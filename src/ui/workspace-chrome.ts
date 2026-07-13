/**
 * Adapter `mountApp` calls whenever a side panel opens/closes (#62). The real implementation
 * (main.ts) resizes/repositions the always-on-top Tauri window around the fixed activity core;
 * tests and the plain-browser `npm run dev` path use a noop, so the window itself is the only
 * seam — everything else in this file is plain in-page flex layout.
 */
export interface WorkspaceChrome {
  getCapacity(): Promise<1 | 2>;
  setCardCount(cardCount: number): void;
  getScale?(): import("./window-geometry").UiScale;
  getScaleOptions?(): Promise<
    Array<{ value: import("./window-geometry").UiScale; supported: boolean }>
  >;
  setScale?(scale: import("./window-geometry").UiScale): Promise<void>;
}
