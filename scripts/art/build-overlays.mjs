import { spawnSync } from "node:child_process";
import { overlays } from "./overlays.mjs";

for (const overlay of overlays) {
  const args = [
    "scripts/art/ingest-overlay.mjs",
    "--name",
    overlay.name,
    "--place",
    overlay.place,
    "--fit",
    overlay.fit,
  ];
  if (overlay.zone) args.push("--zone", overlay.zone);
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
