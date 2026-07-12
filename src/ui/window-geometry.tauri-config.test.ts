import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIN_COMPACT_H, MIN_COMPACT_W } from "./window-geometry";

/** #137 §3: `src-tauri/tauri.conf.json`'s native `minWidth`/`minHeight` must equal the exported
 * compact floor `window-geometry.ts` (and the CSS media queries in styles.css) are tuned against
 * — otherwise a user could shrink the native window below the size the compact minimum surface
 * actually needs, or the Tauri floor could be stricter than necessary. Read as raw JSON (no Rust
 * needed) so this runs in plain `npm test`. */
interface TauriConf {
  app: { windows: Array<{ minWidth?: number; minHeight?: number }> };
}

function readTauriConf(): TauriConf {
  const raw = readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8");
  return JSON.parse(raw) as TauriConf;
}

describe("Tauri window floor agrees with the exported compact minima (#137)", () => {
  it("sets app.windows[0].minWidth to MIN_COMPACT_W", () => {
    const conf = readTauriConf();
    expect(conf.app.windows[0]?.minWidth).toBe(MIN_COMPACT_W);
  });

  it("sets app.windows[0].minHeight to MIN_COMPACT_H", () => {
    const conf = readTauriConf();
    expect(conf.app.windows[0]?.minHeight).toBe(MIN_COMPACT_H);
  });
});
