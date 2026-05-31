export interface CatalogModel {
  tag: string;
  name: string;
  description: string;
  downloadSizeGb: number;
  ramGb: number;
  vision: boolean;
  toolCalling: boolean;
  isLatest?: boolean;
  family?: string;
  discovered?: boolean;
}

// Curated list of models that can be pulled from the Ollama registry.
// ramGb is an approximate working-set estimate (download size + context headroom).
// toolCalling marks models that support Ollama tool calling (needed for the
// agentic web-search + filesystem features). Vision models read images.
export const CATALOG: CatalogModel[] = [
  {
    tag: "qwen2.5:1.5b",
    name: "Qwen2.5 1.5B",
    description: "Tiny, fast, tool-capable text model. Good for very low-RAM machines.",
    downloadSizeGb: 1.0,
    ramGb: 2,
    vision: false,
    toolCalling: true,
  },
  {
    tag: "qwen2.5:3b",
    name: "Qwen2.5 3B",
    description: "Small tool-capable text model with solid quality for its size.",
    downloadSizeGb: 1.9,
    ramGb: 4,
    vision: false,
    toolCalling: true,
  },
  {
    tag: "llama3.2:3b",
    name: "Llama 3.2 3B",
    description: "Compact tool-capable text model from Meta.",
    downloadSizeGb: 2.0,
    ramGb: 4,
    vision: false,
    toolCalling: true,
  },
  {
    tag: "qwen2.5-vl:7b",
    name: "Qwen2.5-VL 7B",
    description: "Vision + text. Reads images and documents. Tool calling supported.",
    downloadSizeGb: 6.0,
    ramGb: 9,
    vision: true,
    toolCalling: true,
  },
  {
    tag: "llama3.2-vision:11b",
    name: "Llama 3.2 Vision 11B",
    description: "Meta vision + text model. Strong image understanding. No tool calling.",
    downloadSizeGb: 7.8,
    ramGb: 12,
    vision: true,
    toolCalling: false,
  },
  {
    tag: "qwen2.5:14b",
    name: "Qwen2.5 14B",
    description: "Strong tool-capable text model for reasoning and coding. Text only.",
    downloadSizeGb: 9.0,
    ramGb: 14,
    vision: false,
    toolCalling: true,
  },
  {
    tag: "qwen2.5-vl:32b",
    name: "Qwen2.5-VL 32B",
    description: "High-quality vision + text with tool calling. Needs a large RAM budget.",
    downloadSizeGb: 21.0,
    ramGb: 28,
    vision: true,
    toolCalling: true,
  },
  {
    tag: "qwen2.5:32b",
    name: "Qwen2.5 32B",
    description: "Large, high-quality tool-capable text model. Text only.",
    downloadSizeGb: 20.0,
    ramGb: 26,
    vision: false,
    toolCalling: true,
  },
  // --- Other popular open-source families (sizes are approximate) -----------
  {
    tag: "llama3.1:8b",
    name: "Llama 3.1 8B",
    description: "Meta's tool-capable text model. Solid all-rounder.",
    downloadSizeGb: 4.9,
    ramGb: 8,
    vision: false,
    toolCalling: true,
  },
  {
    tag: "mistral:7b",
    name: "Mistral 7B",
    description: "Fast, tool-capable text model from Mistral AI.",
    downloadSizeGb: 4.1,
    ramGb: 6,
    vision: false,
    toolCalling: true,
  },
  {
    tag: "deepseek-r1:7b",
    name: "DeepSeek-R1 7B",
    description: "Reasoning-focused distilled model. Text only; no tool calling.",
    downloadSizeGb: 4.7,
    ramGb: 7,
    vision: false,
    toolCalling: false,
  },
  {
    tag: "deepseek-r1:14b",
    name: "DeepSeek-R1 14B",
    description: "Larger DeepSeek-R1 reasoning model. Text only; no tool calling.",
    downloadSizeGb: 9.0,
    ramGb: 14,
    vision: false,
    toolCalling: false,
  },
  {
    tag: "gemma3:4b",
    name: "Gemma 3 4B",
    description: "Google Gemma 3, multimodal (text + images). No tool calling.",
    downloadSizeGb: 3.3,
    ramGb: 6,
    vision: true,
    toolCalling: false,
  },
  {
    tag: "gemma3:12b",
    name: "Gemma 3 12B",
    description: "Larger multimodal Gemma 3 (text + images). No tool calling.",
    downloadSizeGb: 8.1,
    ramGb: 12,
    vision: true,
    toolCalling: false,
  },
  {
    tag: "granite3.3:8b",
    name: "Granite 3.3 8B",
    description: "IBM Granite, tool-capable text model tuned for enterprise tasks.",
    downloadSizeGb: 4.9,
    ramGb: 8,
    vision: false,
    toolCalling: true,
  },
  {
    tag: "glm4:9b",
    name: "GLM-4 9B",
    description: "Zhipu GLM-4, tool-capable text model with strong reasoning.",
    downloadSizeGb: 5.5,
    ramGb: 8,
    vision: false,
    toolCalling: true,
  },
  {
    tag: "nemotron-mini:4b",
    name: "Nemotron-Mini 4B",
    description: "NVIDIA Nemotron-Mini, small tool/function-calling text model.",
    downloadSizeGb: 2.7,
    ramGb: 4,
    vision: false,
    toolCalling: true,
  },
  {
    tag: "lfm2:1.2b",
    name: "LFM2 1.2B",
    description: "Liquid LFM2, very small and fast text model for low-RAM machines.",
    downloadSizeGb: 0.7,
    ramGb: 2,
    vision: false,
    toolCalling: false,
  },
];

// Heuristic: does a locally-installed model tag support Ollama tool calling?
// Used to gate the agentic loop when the catalog has no entry for the tag.
export function tagSupportsTools(tag: string): boolean {
  const known = CATALOG.find((m) => m.tag === tag);
  if (known) return known.toolCalling;
  const t = tag.toLowerCase();
  if (t.includes("vision") && t.startsWith("llama")) return false;
  return /qwen2\.5|qwen3|llama3\.1|llama3\.2|mistral|mixtral|command-r|firefunction|hermes/.test(t);
}

// Estimate the working-set RAM (GB) for an installed model. Uses the curated
// catalog when the tag is known; otherwise approximates from the on-disk size
// (weights + context headroom). Returns 0 when unknown so callers treat it as fitting.
export function estimateRamGb(tag: string, sizeBytes?: number): number {
  const known = CATALOG.find((m) => m.tag === tag);
  if (known) return known.ramGb;
  if (sizeBytes && sizeBytes > 0) {
    const sizeGb = sizeBytes / 1e9;
    return Math.max(1, Math.round(sizeGb * 1.2 + 1));
  }
  return 0;
}

export function tagSupportsVision(tag: string): boolean {
  const known = CATALOG.find((m) => m.tag === tag);
  if (known) return known.vision;
  const t = tag.toLowerCase();
  return t.includes("vision") || t.includes("-vl") || t.includes("llava") || t.includes("minicpm-v");
}

// --- Model families and per-family "latest" --------------------------------

// Pretty labels for known model brands. Unknown families are title-cased.
const FAMILY_LABELS: Record<string, string> = {
  qwen: "Qwen",
  llama: "Llama",
  mistral: "Mistral",
  mixtral: "Mixtral",
  gemma: "Gemma",
  phi: "Phi",
  deepseek: "DeepSeek",
  llava: "LLaVA",
  codellama: "Code Llama",
  command: "Command-R",
  granite: "Granite",
  smollm: "SmolLM",
  falcon: "Falcon",
  yi: "Yi",
  vicuna: "Vicuna",
  orca: "Orca",
  starcoder: "StarCoder",
  nomic: "Nomic",
};

// The brand key for a tag, e.g. "qwen2.5-vl:32b" -> "qwen", "llama3.2:3b" -> "llama".
export function familyKey(tag: string): string {
  const base = tag.split(":")[0].toLowerCase();
  const m = base.match(/^[a-z]+/);
  return m ? m[0] : base;
}

export function familyLabel(tag: string): string {
  const key = familyKey(tag);
  if (FAMILY_LABELS[key]) return FAMILY_LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// First numeric token in the tag base, used to rank versions within a family.
// "qwen2.5" -> 2.5, "llama3.2" -> 3.2, "qwen3" -> 3, "deepseek-r1" -> 1.
function versionScore(tag: string): number {
  const base = tag.split(":")[0];
  const m = base.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

// Annotate each model with its family label and mark one "latest" per family:
// the highest version, breaking ties by the larger RAM footprint (flagship).
// Returns a new array; does not mutate the inputs.
export function annotateFamilyAndLatest<T extends CatalogModel>(models: T[]): T[] {
  const bestByFamily = new Map<string, T>();
  for (const m of models) {
    const key = familyKey(m.tag);
    const cur = bestByFamily.get(key);
    if (!cur) {
      bestByFamily.set(key, m);
      continue;
    }
    const better = versionScore(m.tag) - versionScore(cur.tag) || (m.ramGb ?? 0) - (cur.ramGb ?? 0);
    if (better > 0) bestByFamily.set(key, m);
  }
  const latestTags = new Set([...bestByFamily.values()].map((m) => m.tag));
  return models.map((m) => ({ ...m, family: familyLabel(m.tag), isLatest: latestTags.has(m.tag) }));
}
