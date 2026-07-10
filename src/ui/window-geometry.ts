/** Tauri-free workspace geometry.  Keep this module pure so browser tests and the native shell
 * share exactly the same capacity, anchoring, and monitor-clamping decisions. */
export const MIN_COMPACT_W = 320;
export const MIN_COMPACT_H = 320;
export const DEFAULT_COMPACT_W = 320;
export const DEFAULT_COMPACT_H = 460;
export const CARD_W = 300;
export const DEFAULT_CARD_H = 600;
export const CARD_GAP = 8;
export const ANCHOR_DEADBAND = 50;

export type VerticalAnchor = "top" | "bottom";
export interface Size {
  width: number;
  height: number;
}
export interface MonitorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface WorkspaceRectArgs {
  current: { x: number; y: number; width: number; height: number };
  compact: Size;
  cardHeight: number;
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
  capacity: 1 | 2 | 3;
}

export function workspaceCapacity(monitorWidth: number): 1 | 2 | 3 {
  return Math.max(1, Math.min(3, Math.floor((monitorWidth + CARD_GAP) / (CARD_W + CARD_GAP)))) as
    1 | 2 | 3;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
function clampRect(
  x: number,
  y: number,
  width: number,
  height: number,
  monitor: MonitorRect | null,
) {
  if (!monitor) return { x, y, width, height };
  const maxX = Math.max(monitor.x, monitor.x + monitor.width - width);
  const maxY = Math.max(monitor.y, monitor.y + monitor.height - height);
  return { x: clamp(x, monitor.x, maxX), y: clamp(y, monitor.y, maxY), width, height };
}

export function workspaceRect(args: WorkspaceRectArgs): WorkspaceRectResult {
  const { current, compact, wasCardCount, cardCount, monitor } = args;
  const capacity = monitor ? workspaceCapacity(monitor.width) : 3;
  const effective = Math.min(Math.max(0, cardCount), capacity);
  if (effective === 0) {
    // The current union's anchored compact point is converted back to its compact rect.
    const oldEffective = Math.min(Math.max(0, wasCardCount), capacity);
    const oldRow = oldEffective * CARD_W + Math.max(0, oldEffective - 1) * CARD_GAP;
    const oldWidth = Math.max(compact.width, oldRow);
    const x = current.x + (oldWidth - compact.width) / 2;
    const y = args.anchor === "bottom" ? current.y + current.height - compact.height : current.y;
    return { ...clampRect(x, y, compact.width, compact.height, monitor), anchor: null, capacity };
  }
  const rowWidth = effective * CARD_W + Math.max(0, effective - 1) * CARD_GAP;
  const width = Math.max(compact.width, rowWidth);
  const visibleCompactH = Math.max(MIN_COMPACT_H, compact.height);
  const availableCardH = monitor
    ? Math.max(0, monitor.height - visibleCompactH - CARD_GAP)
    : args.cardHeight;
  const cardHeight = clamp(args.cardHeight, 0, availableCardH || args.cardHeight);
  const height = visibleCompactH + CARD_GAP + cardHeight;
  let anchor = args.anchor;
  if (!anchor) {
    const center = current.y + compact.height / 2;
    const midpoint = monitor ? monitor.y + monitor.height / 2 : center;
    if (center < midpoint - ANCHOR_DEADBAND) anchor = "top";
    else if (center > midpoint + ANCHOR_DEADBAND) anchor = "bottom";
    else {
      // Inside the deadband, pick the side the cards extend *into* that has more room: a "top"
      // anchor keeps the compact widget up top and grows cards downward, so it wants more space
      // *below*; a "bottom" anchor grows cards upward and wants more space above. Ties use "bottom".
      const above = center - (monitor?.y ?? center);
      const below = monitor ? monitor.y + monitor.height - center : center;
      anchor = below > above ? "top" : "bottom";
    }
  }
  // Recover the compact point from the old union when changing open-card count, then center it.
  const oldEffective = Math.min(Math.max(0, wasCardCount), capacity);
  const oldWidth = Math.max(
    compact.width,
    oldEffective * CARD_W + Math.max(0, oldEffective - 1) * CARD_GAP,
  );
  const compactX = wasCardCount > 0 ? current.x + (oldWidth - compact.width) / 2 : current.x;
  const compactY =
    wasCardCount > 0 && anchor === "bottom"
      ? current.y + current.height - compact.height
      : current.y;
  const x = compactX - (width - compact.width) / 2;
  const y = anchor === "bottom" ? compactY - (height - compact.height) : compactY;
  return { ...clampRect(x, y, width, height, monitor), anchor, capacity };
}
