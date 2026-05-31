import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getWorkingDir } from "../config.js";

const MAX_READ_BYTES = 1024 * 1024; // 1MB read cap
const MAX_WRITE_BYTES = 5 * 1024 * 1024; // 5MB write cap
const MAX_LIST_ENTRIES = 500;

// Directories that must never be written to / deleted, regardless of approval.
function systemRoots(): string[] {
  if (process.platform === "win32") {
    const sys = process.env.SystemRoot ?? "C:/Windows";
    const pf = process.env.ProgramFiles ?? "C:/Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)";
    return [sys, pf, pf86].map((p) => path.resolve(p).toLowerCase());
  }
  return ["/System", "/usr", "/bin", "/sbin", "/etc", "/var", "/Library", "/private", "/dev", "/boot", "/proc", "/sys"].map((p) => path.resolve(p));
}

function isInsideSystemDir(abs: string): boolean {
  const target = process.platform === "win32" ? abs.toLowerCase() : abs;
  return systemRoots().some((root) => target === root || target.startsWith(root + path.sep));
}

// Resolve the real path of the nearest existing ancestor so symlinks are
// followed even when the leaf file does not exist yet.
function realAncestor(abs: string): string {
  let cur = abs;
  // Walk up until an existing path is found.
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  try {
    const realParent = fs.realpathSync(cur);
    return path.join(realParent, path.relative(cur, abs));
  } catch {
    return abs;
  }
}

export interface PathInfo {
  abs: string;
  insideWorkdir: boolean;
}

export class FsError extends Error {}

// Resolve a requested path. Rejects `..` traversal, symlink escapes into system
// dirs, and any path inside a protected OS directory.
export function classifyPath(requested: string): PathInfo {
  if (typeof requested !== "string" || !requested.trim()) throw new FsError("A path is required.");
  if (requested.includes("\0")) throw new FsError("Invalid path.");

  const workdir = fs.realpathSync(getWorkingDir());
  const normalizedInput = requested.replace(/\\/g, "/");

  // Reject explicit parent traversal in relative inputs.
  const isAbsolute = path.isAbsolute(requested);
  if (!isAbsolute && normalizedInput.split("/").some((seg) => seg === "..")) {
    throw new FsError("Parent-directory (..) traversal is not allowed.");
  }

  const abs = isAbsolute ? path.resolve(requested) : path.resolve(workdir, requested);
  const real = realAncestor(abs);

  if (isInsideSystemDir(real)) throw new FsError("Access to system directories is not allowed.");

  const insideWorkdir = real === workdir || real.startsWith(workdir + path.sep);
  return { abs: real, insideWorkdir };
}

export function listDirectory(requested: string): string {
  const { abs } = classifyPath(requested);
  const entries = fs.readdirSync(abs, { withFileTypes: true }).slice(0, MAX_LIST_ENTRIES);
  const lines = entries.map((e) => `${e.isDirectory() ? "[dir] " : "      "}${e.name}`);
  return lines.length ? lines.join("\n") : "(empty directory)";
}

export function readFile(requested: string): string {
  const { abs } = classifyPath(requested);
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) throw new FsError("That path is a directory, not a file.");
  if (stat.size > MAX_READ_BYTES) throw new FsError("File is too large to read (max 1MB).");
  return fs.readFileSync(abs, "utf-8");
}

export function writeFile(requested: string, content: string): string {
  if (typeof content !== "string") throw new FsError("content must be a string.");
  if (Buffer.byteLength(content, "utf-8") > MAX_WRITE_BYTES) throw new FsError("Content too large (max 5MB).");
  const { abs } = classifyPath(requested);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf-8");
  return abs;
}

export function makeDir(requested: string): string {
  const { abs } = classifyPath(requested);
  fs.mkdirSync(abs, { recursive: true });
  return abs;
}

export function deletePath(requested: string): string {
  const { abs } = classifyPath(requested);
  if (abs === fs.realpathSync(getWorkingDir())) throw new FsError("Refusing to delete the working directory itself.");
  if (!fs.existsSync(abs)) throw new FsError("That path does not exist.");
  fs.rmSync(abs, { recursive: true, force: true });
  return abs;
}

// Does a write/mkdir/delete need explicit user approval, given the mode?
export function needsApproval(action: "write" | "mkdir" | "delete", insideWorkdir: boolean, mode: string): boolean {
  if (action === "delete") return true; // deletes always need approval
  if (!insideWorkdir) return true; // anything outside the workdir needs approval
  return mode === "ask-every-time";
}

export function workingDirDisplay(): string {
  return getWorkingDir();
}

export function homeDir(): string {
  return os.homedir();
}
