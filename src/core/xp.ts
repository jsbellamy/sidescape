export const MAX_LEVEL = 99;

const xpTable: number[] = (() => {
  const table = [0, 0]; // index by level; levels start at 1
  let points = 0;
  for (let level = 1; level < MAX_LEVEL; level++) {
    points += Math.floor(level + 300 * Math.pow(2, level / 7));
    table.push(Math.floor(points / 4));
  }
  return table;
})();

/** Total XP required to reach `level` (RuneScape curve). */
export function xpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
    throw new RangeError(`level must be an integer 1..${MAX_LEVEL}, got ${level}`);
  }
  const xp = xpTable[level];
  if (xp === undefined) throw new RangeError(`no XP entry for level ${level}`);
  return xp;
}

/** Level (1–99) for a given total XP amount. */
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL) {
    const next = xpTable[level + 1];
    if (next === undefined || xp < next) break;
    level++;
  }
  return level;
}
