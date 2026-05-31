export interface ChatSummary {
  id: string;
  title: string;
  pinned: boolean;
  created_at: number;
  updated_at: number;
  snippet?: string;
}

export interface Attachment {
  name: string;
  type: string;
  size: number;
  kind: "image" | "text";
}

export interface Source {
  title: string;
  url: string;
}

export interface ToolActivity {
  tool: string;
  label: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: Attachment[];
  sources?: Source[];
  toolActivity?: ToolActivity[];
  created_at: number;
  streaming?: boolean;
  loadingModel?: boolean;
}

export interface ChatDetail extends ChatSummary {
  messages: Message[];
}

export interface LocalModel {
  tag: string;
  size: number;
  family?: string;
  parameters?: string;
  ramGb?: number;
  toolCalling?: boolean;
}

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
  installed: boolean;
  fitsRam: boolean;
  fitsDisk: boolean;
  fits: boolean;
}

export interface MachineInfo {
  arch: string;
  totalRamGb: number;
  reservedRamGb: number;
  modelBudgetGb: number;
  freeDiskGb: number;
}

export type ApprovalMode = "ask-every-time" | "auto-in-workdir";
export type Theme = "light" | "dark" | "system";

export interface AppConfig {
  defaultModel: string;
  systemPrompt: string;
  temperature: number;
  webSearchEnabled: boolean;
  approvalMode: ApprovalMode;
  agentWorkingDir: string;
  unloadOnClose: boolean;
  unloadAfterIdle: boolean;
  idleMinutes: number;
  theme: Theme;
  resolvedWorkingDir?: string;
  hasSearchApiKey?: boolean;
  machine: MachineInfo;
}

export interface RuntimeStatus {
  loaded: boolean;
  models: { tag: string; size?: number; vram?: number }[];
  totalSize?: number;
}

export interface PreparedUpload {
  name: string;
  type: string;
  size: number;
  kind: "image" | "text";
  dataBase64?: string;
  textContent?: string;
}

export interface ApprovalAction {
  tool: string;
  action: "write" | "mkdir" | "delete";
  path: string;
  content?: string;
}
