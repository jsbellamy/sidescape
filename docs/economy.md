# Economy reference

SideScape's gold loop is OSRS-shaped: Monsters and Dungeons inject currency, the Bank and Vendor drain it, and every sellable Item carries a `value` that passive flows and player commands respect. **All figures below are tuning defaults**, not spec — a balance pass may retune them without changing the invariant rules encoded in `src/data/economy.test.ts`.

## Gold sources

| Source             | Mechanism                                                                          | Notes (tuning)                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-kill gold      | Guaranteed `gold` Drop on every Monster's Drop Table                               | Rises by Area: Lumbry Meadows 2–10g, Darkroot Forest 15–25g, Old Sewers 30–50g, Bone Crypt 90–120g, Frostspire 180–230g on open-world Monsters |
| Dungeon boss gold  | Guaranteed `gold` on each Dungeon's final Wave Monster                             | Always above that Area's open-world max (e.g. Goblin Chief 20g vs Lumbry max 10g)                                                              |
| Dungeon chest gold | Guaranteed `gold` in each Dungeon's Chest                                          | Strictly rises in Area order: 75 → 150 → 300 → 500 → 800                                                                                       |
| `sell`             | Player sells Bank stacks at each Item's `value` per unit                           | See `src/core/bank.ts` — currency Items have no sell value                                                                                     |
| Overflow-sold      | Passive arrival when the Bank is full and the Item is sellable                     | Credits `value × qty` to gold; emits `overflow-sold`                                                                                           |
| Duplicate-sold     | Combat drop of Equipment the player already wears, when auto-sell-duplicates is on | Credits `value × qty`; emits `duplicate-sold`                                                                                                  |

Fishing Catches, Cooking output, and Crafting gear are not direct gold sources — they enter the loop when sold or when overflow/duplicate auto-sell fires.

## Gold sinks

| Sink                | Mechanism                                      | Notes (tuning)                                                                                                       |
| ------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Bank Slot purchases | `buyBankSlots()` grants +10 slots per purchase | First purchase 1000g, then +500g per subsequent purchase (1500g, 2000g, …) as capacity grows past the 100-slot start |
| Vendor purchases    | `buy()` debits `price × qty` from gold         | Arrows, elemental runes, and higher-tier ammo/runes — see vendor spread below                                        |

Ammo and rune upkeep is the main recurring combat sink: at ~2,000 attacks/hr, bronze-arrow / Strike-rune vendor prices land in a ~30–40% gold-sink band against mid-game kill income (see the economy comment on arrows in `src/data/index.ts`).

## Value ladders

Sell values (`Item.value`) follow several family curves. Gear uses `value = baseValue × 2^tierIndex` from `src/data/tier-ladder.ts` (pinned by `tier-ladder.test.ts`).

| Family              | Tier values (tuning)                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Bars                | 8 → 20 → 45 → 90 → 180 → 360 (bronze through rune)                                                                 |
| Hides               | 2 → 4 → 8 (cowhide, wolf-hide, thick-hide)                                                                         |
| Herbs               | 4 → 6 → 8 → 10 (guam through harralander)                                                                          |
| Gems                | 15 → 30 → 60 (sapphire, emerald, ruby)                                                                             |
| Fishing raw catches | 1 → 2 → 3 → 5 → 8 by Fishing Spot `levelReq` (shrimp pool through glacial melt)                                    |
| Cooked Food         | `value` strictly above the raw Material input; sorting all Food by `heals` ascending yields non-decreasing `value` |

## Vendor spread convention

Every `content.vendor` entry whose Item has a sell `value` prices at **at least 2×** that value (`price >= 2 * value`). Shipped entries typically run **2.5×–5×** — e.g. bronze-arrow value 1 / price 3, mithril-arrow value 4 / price 10, adamant-arrow value 8 / price 20. Strike runes mirror bronze-arrow; Bolt and Blast runes scale with their tier values from `spell-ladder.ts`.

Items without a `value` are unsellable and are not subject to the spread rule.
