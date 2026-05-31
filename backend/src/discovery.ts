import { CATALOG, CatalogModel, familyKey, tagSupportsTools, tagSupportsVision } from "./catalog.js";
import { safeFetch } from "./tools/web.js";

// Discovers additional open-source models from the public Ollama library so the
// "Manage LLMs" panel can surface models beyond the curated catalog.
//
// The Ollama library has no stable JSON API, so we fetch the public HTML index
// (a fixed, allowlisted HTTPS host - SSRF-safe via safeFetch) and extract model
// slugs. Discovered entries have unknown size/RAM (0) and are treated as fitting;
// the user can download them like any catalog model.

const LIBRARY_URL = "https://ollama.com/library?sort=newest";
const MAX_DISCOVERED = 24;
const CACHE_TTL_MS = 30 * 60 * 1000; // re-check at most every 30 min unless forced

// Slugs we never surface as chat models (embeddings, safety classifiers, etc.).
const EXCLUDED = /(embed|guard|moderation|reranker|bert|minilm|sentence)/i;

let cache: CatalogModel[] = [];
let cachedAt = 0;

function prettifyName(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((part) => (/^[a-z]/.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

// Base names already represented in the curated catalog (e.g. "qwen2.5").
function catalogBaseNames(): Set<string> {
  return new Set(CATALOG.map((m) => m.tag.split(":")[0].toLowerCase()));
}

// Parse the library index into slugs that can actually be pulled and run
// LOCALLY. Each model is an `<li x-test-model>` card. Cloud-only models (for
// example deepseek-v4-flash, glm-5, kimi-k2) carry a "cloud" capability badge
// and expose NO `x-test-size` entries - pulling them returns "file does not
// exist". We therefore keep only cards that advertise at least one downloadable
// size and are not cloud-only.
function parseLibrary(html: string): string[] {
  const slugs: string[] = [];
  const cards = html.split(/<li[^>]*x-test-model/i).slice(1);
  for (const card of cards) {
    const block = card.split(/<\/li>/i)[0];
    const href = block.match(/href="\/library\/([a-z0-9][a-z0-9._-]*)"/i);
    if (!href) continue;
    const hasDownloadableSize = /x-test-size/i.test(block);
    const cloudOnly = /capability[^>]*>\s*cloud\s*</i.test(block) && !hasDownloadableSize;
    if (!hasDownloadableSize || cloudOnly) continue; // cloud-only / not pullable locally
    slugs.push(href[1].toLowerCase());
  }
  return [...new Set(slugs)];
}

// Force a fresh internet check and update the cache. Returns the discovered list
// (models not already in the curated catalog) and whether the check failed.
export async function refreshDiscovered(): Promise<{ models: CatalogModel[]; stale: boolean }> {
  try {
    const { body } = await safeFetch(LIBRARY_URL);
    const known = catalogBaseNames();
    const knownFamilies = new Set(CATALOG.map((m) => familyKey(m.tag)));
    const found: CatalogModel[] = [];
    for (const slug of parseLibrary(body)) {
      if (found.length >= MAX_DISCOVERED) break;
      if (EXCLUDED.test(slug)) continue;
      if (known.has(slug)) continue; // exact model already curated
      // Skip slugs whose family is already well-covered by the curated catalog
      // unless the slug itself is a clearly newer base name.
      const fam = familyKey(slug);
      const sameAsCurated = knownFamilies.has(fam) && CATALOG.some((m) => m.tag.split(":")[0].toLowerCase() === slug);
      if (sameAsCurated) continue;
      found.push({
        tag: slug, // pulls the model's default (:latest) tag
        name: prettifyName(slug),
        description: "Discovered from the Ollama library. Size and RAM are estimated after download.",
        downloadSizeGb: 0,
        ramGb: 0,
        vision: tagSupportsVision(slug),
        toolCalling: tagSupportsTools(slug),
        discovered: true,
      });
    }
    cache = found;
    cachedAt = Date.now();
    return { models: found, stale: false };
  } catch {
    // Internet unreachable or page changed: keep whatever we cached before.
    return { models: cache, stale: true };
  }
}

// Cached discovered models, refreshing in the background if the cache is stale.
export function getDiscovered(): CatalogModel[] {
  if (Date.now() - cachedAt > CACHE_TTL_MS) {
    // Fire-and-forget background refresh; current callers use the cached value.
    void refreshDiscovered();
  }
  return cache;
}
