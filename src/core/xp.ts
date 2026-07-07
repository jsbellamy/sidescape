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
  if (level < 1 || level > MAX_LEVEL) {
    throw new RangeError(`level must be 1..${MAX_LEVEL}, got ${level}`);
  }
  return xpTable[level];
}

/** Level (1–99) for a given total XP amount. */
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpTable[level + 1]) {
    level++;
  }
  return level;
}
