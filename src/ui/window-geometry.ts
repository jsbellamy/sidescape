// Window sizing tuning constants (#62) — not spec, chosen to look right around the shrunk
// activity-core main column at 320px wide. See the PR description for the exact rationale.
export const PANEL_W = 300;
export const BASE_W = 320;
export const BASE_H = 460;

/** A monitor's bounds in logical pixels — the subset of Tauri's `Monitor` this module needs,
 * kept Tauri-free so this module has zero Tauri imports. */
export interface MonitorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pure core of the Tauri WindowChrome adapter (#62, extracted by #89): computes the window
 * width and x-position for a given panel state, with no I/O.
 *
 * - width = BASE_W + (left ? PANEL_W : 0) + (right ? PANEL_W : 0)
 * - x starts at `currentX`; opening the LEFT panel (left && !wasLeftOpen) shifts x -= PANEL_W,
 *   closing it (!left && wasLeftOpen) shifts x += PANEL_W — the RIGHT panel never moves x.
 * - with a `monitor`, x is clamped into [monitor.x, max(monitor.x, monitor.x + monitor.width -
 *   width)], so a window wider than the monitor pins to the left edge (monitor.x) rather than
 *   producing an inverted range.
 * - `monitor: null` (no monitor detected) performs no clamping.
 */
export function panelWindowRect(args: {
  currentX: number;
  wasLeftOpen: boolean;
  left: boolean;
  right: boolean;
  monitor: MonitorRect | null;
}): { width: number; x: number } {
  const { currentX, wasLeftOpen, left, right, monitor } = args;
  const width = BASE_W + (left ? PANEL_W : 0) + (right ? PANEL_W : 0);

  let x = currentX;
  if (left && !wasLeftOpen) x -= PANEL_W;
  else if (!left && wasLeftOpen) x += PANEL_W;

  if (monitor) {
    const minX = monitor.x;
    const maxX = Math.max(minX, monitor.x + monitor.width - width);
    x = Math.min(Math.max(x, minX), maxX);
  }

  return { width, x };
}
