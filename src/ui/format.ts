/** Abbreviates a stack quantity for icon-tile badges (#78) — Bank/Character/Food/Loot tiles are
 * small, so a plain unbounded number (there's no stack cap, per #78's grounding notes) would
 * overflow. Below 10,000 the exact count is shown (still cheap to read at a glance); at and above
 * 10,000 it's abbreviated to one significant decimal with a k/M suffix, dropping a trailing ".0"
 * so round thousands/millions read clean (10,000 → "10k", not "10.0k").
 *
 * Boundaries (owner-specified, #78): 9,999 stays exact; 10,000 → "10k"; 10,000,000 → "10M". */
export function formatQty(n: number): string {
  if (n < 10_000) return String(n);

  const abbreviate = (scaled: number, suffix: string): string => {
    const rounded = Math.round(scaled * 10) / 10;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${text}${suffix}`;
  };

  if (n < 1_000_000) return abbreviate(n / 1_000, "k");
  return abbreviate(n / 1_000_000, "M");
}
