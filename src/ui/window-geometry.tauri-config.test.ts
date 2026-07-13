import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPACT_H, COMPACT_W } from "./window-geometry";

const conf = JSON.parse(
  readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
) as { app: { windows: Array<Record<string, unknown>> } };
describe("Tauri fixed compact geometry", () => {
  it("uses the 320x220 fixed non-resizable native floor", () => {
    expect(conf.app.windows[0]).toMatchObject({
      width: COMPACT_W,
      height: COMPACT_H,
      minWidth: COMPACT_W,
      minHeight: COMPACT_H,
      resizable: false,
      maxWidth: 1216,
    });
  });
});
