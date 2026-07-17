// Stamps a release version into the files Tauri reads at build time.
//
// Tags are the source of truth for SideScape's version: the committed values
// are placeholders (0.0.0) and CI overwrites them from the tag without ever
// committing the result. See .github/workflows/release.yml.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error(`usage: node scripts/set-version.mjs <major.minor.patch>`);
  process.exit(1);
}

const editJson = (relative, mutate) => {
  const path = join(root, relative);
  const json = JSON.parse(readFileSync(path, "utf8"));
  mutate(json);
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
};

const editText = (relative, pattern, replacement) => {
  const path = join(root, relative);
  const before = readFileSync(path, "utf8");
  const after = before.replace(pattern, replacement);
  if (after === before) throw new Error(`${relative}: no version match for ${pattern}`);
  writeFileSync(path, after);
};

editJson("package.json", (json) => {
  json.version = version;
});
editJson("package-lock.json", (json) => {
  json.version = version;
  if (json.packages?.[""]) json.packages[""].version = version;
});
editJson("src-tauri/tauri.conf.json", (json) => {
  json.version = version;
});

// Only the [package] version at the top of the manifest, not dependencies'.
editText("src-tauri/Cargo.toml", /^version = "[^"]*"/m, `version = "${version}"`);
// The workspace member's own entry in the lock file. `\r?\n` because the
// Windows release runner checks these files out with CRLF endings.
editText("src-tauri/Cargo.lock", /^(name = "sidescape"\r?\nversion = )"[^"]*"/m, `$1"${version}"`);

console.log(`set version ${version}`);
