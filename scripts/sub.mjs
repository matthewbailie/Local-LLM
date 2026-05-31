#!/usr/bin/env node
// Run an npm command inside a subproject (backend/ or frontend/) with the
// working directory actually changed to that folder.
//
// Why this exists: we used to delegate with `npm --prefix backend <cmd>`.
// On macOS that targets the subfolder, but on Windows npm resolves the
// package.json (and its lifecycle scripts) from the CURRENT directory, not the
// prefix. That made the root `postinstall` re-invoke itself and recurse until
// it crashed the Windows CI runner. Changing cwd here behaves identically on
// macOS, Windows, and Linux.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const [dir, ...args] = process.argv.slice(2);

if (!dir || args.length === 0) {
  console.error("usage: node scripts/sub.mjs <backend|frontend> <npm args...>");
  process.exit(1);
}

const result = spawnSync("npm", args, {
  cwd: path.join(root, dir),
  stdio: "inherit",
  // On Windows the executable is npm.cmd, which needs a shell to resolve.
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
