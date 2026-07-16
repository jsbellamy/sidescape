# SideScape — v1 Design

A taskbar-sized RuneScape-like idle grinder. The window is the game: park it at the screen edge and it grinds while open (no offline gains in v1).

## Window

One transparent, frameless, always-on-top Tauri window. Closed, it is the fixed
320×220 logical **Compact Widget** live stage. The entire workspace has three
local scale stops: 100%, 150%, and 200%, producing compact rectangles of
320×220, 480×330, and 640×440. The selected scale is stored locally but never
in a Snapshot/save. The native window is not user-resizable.

Opening management surfaces expands the same window into a transparent
**Workspace Rect**, not a second window: the Compact Widget and each opaque
**Management Card** float as siblings with real glass between them. The row has
the fixed Character hub plus at most one destination card; each logical card is
300×600 with an 8px gap. Capacity is one or two based on the scaled card widths.
Unsupported scale stops are disabled when the monitor cannot fit the complete
fixed height, and a chosen scale is never silently reduced. **Workspace Chrome**
selects a stable top/bottom **Vertical
Anchor** when cards first open, so cards grow into the available half of the
display; closing restores the scaled compact rect. Open cards do not persist.
On macOS, card-count resizes from a non-empty workspace are covered for a couple
of paint frames by a non-interactive snapshot of the old workspace while the
real window is transparent; this masks WindowServer's stale WKWebView texture
without introducing another game surface or state owner.

The Compact Widget is visual rather than informational. Combat shows backdrop,
player and Monster, small non-numeric HP bars, transient feedback, and a
zero-Food warning when appropriate. Production replaces the Monster with its
descriptor-backed prop; Fishing and idle show only backdrop and player. It also
carries the live Loot Zone strip beneath the scene, the sole Loot Zone
interface. Gold is in Bank, Food configuration in Character, and the Loot Feed
in Activity (a full-height Recent Activity feed, with no Loot Zone view of its
own). The titlebar contains Menu, the SideScape drag region, and Close.
Character Settings owns Mute, Import/Export, and the scale selector.

## Skills & XP

- **Attack** (hit chance), **Strength** (max hit), **Defence** (damage avoidance), **Hitpoints** (HP pool; gains XP from all combat).
- RuneScape-style exponential XP table, levels 1–99. XP per kill scales with Monster HP.
- **Combat Style** selector: mode-aware — melee Accurate (Attack XP) / Aggressive (Strength XP) / Defensive (Defence XP); ranged and magic Accurate (mode Skill XP + boost) / Rapid (mode Skill XP, faster attacks) / Defensive (50/50 mode Skill + Defence XP, Defence boost). Hitpoints XP always trickles.

## Combat model

- Tick-based, 600ms Ticks. Weapon defines attack speed in Ticks (dagger 4, sword 5, 2h 7).
- Hit roll: accuracy from effective Attack + Equipment attack bonus vs Monster defence; damage roll `0..maxHit` from Strength + strength bonus. Monster attacks back on its own cadence.
- Sustain: Food auto-eaten below an HP threshold; slow passive regen otherwise.
- Death: no item loss — combat halts, short respawn, back to Area picker.

## Areas & Monsters (10 monsters, 4 tiers)

| Area            | Monsters                     | Gate             |
| --------------- | ---------------------------- | ---------------- |
| Lumbry Meadows  | Chicken, Cow, Goblin         | none             |
| Darkroot Forest | Wolf, Goblin Warrior, Bandit | ~cmb 10 / bronze |
| Old Sewers      | Giant Rat, Zombie, Skeleton  | ~cmb 25 / iron   |
| Bone Crypt      | Crypt Shade (mini-boss)      | ~cmb 40 / steel  |

Each tier roughly doubles Monster HP/damage. Locked Areas stay visible (the carrot).

## Items & Drops

- Five Gear Slots: weapon, shield, head, body, legs. Bonuses: attack / strength / defence.
- Gear Tiers: bronze → iron → steel → mithril, sourced from Drop Tables by Area tier.
- Drop Table bands per Monster: guaranteed (bones → gold), common (gold, Food), uncommon (Equipment), rare (uniques ~1/128–1/512, e.g. Crypt Shade's _Shade Blade_). Rare Drops get a visual flash + Loot Feed highlight.
- Inventory list, equip-on-click, auto-sell-duplicates toggle. Gold has no sink in v1 (shop is v2).

## UI layout (top → bottom)

1. Header/titlebar: drag region, Area/Monster picker, settings.
2. Combat scene: player vs Monster sprites (CC0 pixel packs, `image-rendering: pixelated`), HP bars, damage splats.
3. XP row: 4 mini bars with level badges; level-up toast.
4. Tabs: Loot Feed · Equipment · Inventory.

## Persistence

Autosave state JSON every 10s + on close (Tauri fs plugin or localStorage fallback).

## Milestones

1. ✅ Scaffold: slim always-on-top Tauri window
2. Core engine: XP table, combat tick math, Drop Tables — headless + Vitest
3. UI slice: combat scene + bars + Loot Feed (placeholder rectangles)
4. Content + Equipment: 10 Monsters, 4 Areas, tiers, equip flow, gating
5. Polish + persistence: sprites, splats, level-up/rare-drop effects, save/load, death/respawn
