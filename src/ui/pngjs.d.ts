// pngjs (already a devDependency, used by scripts/art/write-png.mjs) ships no types and this
// issue's dispatch notes exclude touching package.json (shared with #142/#143/#144), so
// @types/pngjs isn't an option here — this ambient module covers exactly the shape
// icon-assets.test.ts reads off a decoded PNG (#166).
declare module "pngjs" {
  export class PNG {
    constructor(options?: { width?: number; height?: number });
    width: number;
    height: number;
    data: Buffer;
    static sync: {
      read(buffer: Buffer): PNG;
      write(png: PNG): Buffer;
    };
  }
}
