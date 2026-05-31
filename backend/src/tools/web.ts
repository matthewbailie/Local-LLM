import dns from "node:dns/promises";
import net from "node:net";
import { getSearchApiKey } from "../secrets.js";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB response cap
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 4;

export class WebError extends Error {}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// --- SSRF protection -------------------------------------------------------

function ipIsBlocked(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p[0] === 127) return true; // loopback
    if (p[0] === 10) return true; // private
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true; // private
    if (p[0] === 192 && p[1] === 168) return true; // private
    if (p[0] === 169 && p[1] === 254) return true; // link-local + metadata
    if (p[0] === 0) return true;
    if (p[0] >= 224) return true; // multicast / reserved
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    // IPv4-mapped (::ffff:a.b.c.d)
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/);
    if (mapped) return ipIsBlocked(mapped[1]);
    return false;
  }
  return true; // unknown format -> block
}

async function assertHostAllowed(hostname: string): Promise<void> {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new WebError("Requests to local/internal hosts are not allowed.");
  }
  // If it is a literal IP, check directly; otherwise resolve all addresses.
  if (net.isIP(host)) {
    if (ipIsBlocked(host)) throw new WebError("Requests to private/loopback addresses are not allowed.");
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch {
    throw new WebError("Could not resolve that host.");
  }
  if (addrs.length === 0 || addrs.some((a) => ipIsBlocked(a.address))) {
    throw new WebError("That host resolves to a blocked address.");
  }
}

function assertScheme(u: URL): void {
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new WebError("Only http and https URLs are allowed.");
  }
}

// Fetch with SSRF checks on every redirect hop, size + time caps.
export async function safeFetch(rawUrl: string): Promise<{ url: string; body: string; contentType: string }> {
  let current = rawUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const u = new URL(current);
    assertScheme(u);
    await assertHostAllowed(u.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "LocalLLMChat/1.0 (+local agent)", Accept: "text/html,application/xhtml+xml,text/plain,*/*" },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current).toString();
      continue; // re-check host on next loop iteration
    }
    if (!res.ok) throw new WebError(`The site returned status ${res.status}.`);

    const contentType = res.headers.get("content-type") ?? "";
    const reader = res.body?.getReader();
    if (!reader) return { url: current, body: "", contentType };
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > MAX_BYTES) {
          reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return { url: current, body: buf.toString("utf-8"), contentType };
  }
  throw new WebError("Too many redirects.");
}

// --- HTML -> readable text -------------------------------------------------

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function htmlToText(html: string): string {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const text = noScript
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function fetchUrl(rawUrl: string): Promise<{ url: string; text: string }> {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) throw new WebError("A URL is required.");
  const { url, body, contentType } = await safeFetch(rawUrl.trim());
  const text = contentType.includes("html") ? htmlToText(body) : body;
  return { url, text: text.slice(0, 20_000) };
}

// --- Web search (keyless DuckDuckGo by default) ----------------------------

function decodeDdgHref(href: string): string {
  try {
    const u = new URL(href, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    return href.startsWith("http") ? href : "https:" + href;
  } catch {
    return href;
  }
}

async function duckDuckGoSearch(query: string): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const { body } = await safeFetch(url);
  const results: SearchResult[] = [];
  const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippets: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(body)) !== null) snippets.push(decodeEntities(sm[1].replace(/<[^>]+>/g, "")).trim());
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = linkRe.exec(body)) !== null && results.length < 6) {
    const href = decodeDdgHref(m[1]);
    const title = decodeEntities(m[2].replace(/<[^>]+>/g, "")).trim();
    if (!title) continue;
    results.push({ title, url: href, snippet: snippets[idx] ?? "" });
    idx++;
  }
  return results;
}

// Optional keyed providers; keys come from env, never hardcoded.
async function tavilySearch(query: string, key: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, max_results: 6 }),
  });
  if (!res.ok) throw new WebError("Search provider error.");
  const data = (await res.json()) as { results?: { title: string; url: string; content: string }[] };
  return (data.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.content }));
}

export async function webSearch(query: string): Promise<SearchResult[]> {
  if (typeof query !== "string" || !query.trim()) throw new WebError("A search query is required.");
  const tavilyKey = getSearchApiKey();
  if (tavilyKey) {
    try {
      return await tavilySearch(query.trim(), tavilyKey);
    } catch {
      /* fall back to keyless */
    }
  }
  return duckDuckGoSearch(query.trim());
}
