/** Tauri-free fixed-scale workspace geometry. */
export const UI_SCALES = [1, 1.5, 2] as const;
export type UiScale = (typeof UI_SCALES)[number];
export const DEFAULT_UI_SCALE: UiScale = 1;
export const UI_SCALE_KEY = "sidescape-ui-scale-v1";

export const COMPACT_W = 320;
export const COMPACT_H = 220;
export const CARD_W = 300;
export const CARD_H = 600;
export const CARD_GAP = 8;
export const ANCHOR_DEADBAND = 50;

export const scaled = (value: number, scale: UiScale): number => Math.round(value * scale);

export type VerticalAnchor = "top" | "bottom";
export interface MonitorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface WorkspaceRectArgs {
  current: { x: number; y: number; width: number; height: number };
  scale: UiScale;
  wasCardCount: number;
  cardCount: number;
  anchor: VerticalAnchor | null;
  monitor: MonitorRect | null;
}
export interface WorkspaceRectResult {
  x: number;
  y: number;
  width: number;
  height: number;
  anchor: VerticalAnchor | null;
  capacity: 1 | 2;
}

export function workspaceCapacity(monitorWidth: number, scale: UiScale): 1 | 2 {
  const card = scaled(CARD_W, scale);
  const gap = scaled(CARD_GAP, scale);
  return monitorWidth >= card * 2 + gap ? 2 : 1;
}

export function scaleFitsMonitorHeight(monitorHeight: number, scale: UiScale): boolean {
  return monitorHeight >= scaled(COMPACT_H + CARD_GAP + CARD_H, scale);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function workspaceRect(args: WorkspaceRectArgs): WorkspaceRectResult {
  const { current, scale, monitor } = args;
  const compactW = scaled(COMPACT_W, scale);
  const compactH = scaled(COMPACT_H, scale);
  const cardW = scaled(CARD_W, scale);
  const cardH = scaled(CARD_H, scale);
  const gap = scaled(CARD_GAP, scale);
  const capacity = monitor ? workspaceCapacity(monitor.width, scale) : 2;
  const effective = Math.min(Math.max(0, args.cardCount), capacity);
  const oldEffective = Math.min(Math.max(0, args.wasCardCount), capacity);
  const oldRowW = oldEffective ? oldEffective * cardW + (oldEffective - 1) * gap : 0;
  const oldWidth = Math.max(compactW, oldRowW);
  const compactX = args.wasCardCount > 0 ? current.x + (oldWidth - compactW) / 2 : current.x;
  const compactY =
    args.wasCardCount > 0 && args.anchor === "bottom"
      ? current.y + current.height - compactH
      : current.y;

  if (effective === 0) {
    const x = monitor
      ? clamp(compactX, monitor.x, Math.max(monitor.x, monitor.x + monitor.width - compactW))
      : compactX;
    const y = monitor
      ? clamp(compactY, monitor.y, Math.max(monitor.y, monitor.y + monitor.height - compactH))
      : compactY;
    return { x, y, width: compactW, height: compactH, anchor: null, capacity };
  }

  const rowW = effective * cardW + (effective - 1) * gap;
  const width = Math.max(compactW, rowW);
  const height = compactH + gap + cardH;
  let anchor = args.anchor;
  if (!anchor) {
    const center = current.y + compactH / 2;
    const midpoint = monitor ? monitor.y + monitor.height / 2 : center;
    if (center < midpoint - ANCHOR_DEADBAND) anchor = "top";
    else if (center > midpoint + ANCHOR_DEADBAND) anchor = "bottom";
    else {
      const above = center - (monitor?.y ?? center);
      const below = monitor ? monitor.y + monitor.height - center : center;
      anchor = below > above ? "top" : "bottom";
    }
  }
  let x = compactX - (width - compactW) / 2;
  let y = anchor === "bottom" ? compactY - (height - compactH) : compactY;
  if (monitor) {
    x = clamp(x, monitor.x, Math.max(monitor.x, monitor.x + monitor.width - width));
    y = clamp(y, monitor.y, Math.max(monitor.y, monitor.y + monitor.height - height));
  }
  return { x, y, width, height, anchor, capacity };
}
