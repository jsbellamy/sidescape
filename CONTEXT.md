# SideScape

A taskbar-sized incremental idle game, thematically similar to RuneScape. The player picks an Area and a Monster; the character auto-fights, earning Skill XP and Drops. Better Equipment unlocks harder Areas with better Drop Tables.

## Language

**Area**:
A themed location the player selects (e.g. Lumbry Meadows, Bone Crypt). Holds several **Monsters** and may be gated behind completing another Area's **Dungeon**; the first Area is open from the start.
_Avoid_: zone, map, region

**Monster**:
An enemy inside an **Area** that the player farms. Has HP, attack/defence stats (including a per-**Attack Type** **Defence Vector**), an attack cadence in **Ticks**, and exactly one **Drop Table**. Attacks the player with one **Attack Type** of its own; the player's armour **Defence Vector** opposes it, the mirror of how the player's own weapon attacks against the Monster's Defence Vector.
_Avoid_: mob, enemy, NPC

**Skill**:
Eleven Skills in all: the six combat Skills — Attack (hit chance), Strength (max hit), Defence (damage avoidance), Hitpoints (HP pool), Ranged, and Magic — plus Fishing, Smithing, Cooking, Crafting, and Herblore. Each holds XP and a derived Level (1–99, RuneScape-style exponential table).
_Avoid_: stat, attribute

**Combat Style**:
The player's training selector — legal choices depend on **Combat Mode**: melee shows Accurate / Aggressive / Defensive; ranged and magic show Accurate / Rapid / Defensive. Routes damage XP per mode-aware tables (melee: one Skill via style; ranged/magic Accurate/Rapid train the mode Skill at `4 * damage`, Defensive splits `2 * damage` to the mode Skill and `2 * damage` to Defence). Hitpoints XP always trickles regardless of mode. Weapon swaps remap Aggressive ↔ Rapid; Accurate and Defensive keep the same id.
_Avoid_: stance, mode

**Combat Mode**:
Melee, Ranged, or Magic — the family a weapon belongs to, derived from the weapon's own **Attack Type** (stab/slash/crush → melee, ranged → Ranged, magic → Magic). Together with **Combat Style**, decides which Skills gain damage XP and which receive combat boosts (+3 effective level). Orthogonal to Combat Style — picking a Combat Style never changes Combat Mode, and vice versa.
_Avoid_: stance, style (reserved for Combat Style)

**Attack Type**:
One of stab, slash, crush, ranged, or magic — the single type a weapon attacks with, fixed by the weapon itself (a dagger is stab, a sword is slash, a mace is crush, a Shortbow is ranged, an Apprentice Staff is magic); a weapon has exactly one, never a per-swing choice. Melee's three sub-types (stab/slash/crush) all fall under the melee **Combat Mode**, which is derived from Attack Type rather than stored separately. The player's accuracy roll checks the defending Monster's **Defence Vector** entry for the attacker's own Attack Type, so a Monster's weak spot is simply the type it defends worst.
_Avoid_: attack style (reserved for Combat Style), damage type

**Defence Vector**:
A piece of Equipment's or a Monster's defence bonus, broken out per **Attack Type** rather than a single scalar — five numbers (stab/slash/crush/ranged/magic) instead of one. An accuracy roll checks the Defence Vector entry matching the attacker's own Attack Type; the level half of the roll (Defence Skill for the player, `defenceLevel` for a Monster) stays a single number, untouched.
_Avoid_: defence bonus (singular, pre-Combat-Depth terminology), resistance

**Offence stats (three-stat model)**:
Equipment carries one of three mode-specific power stats, each summed across equipped gear slots: **Strength bonus** (`strBonus`, flat — melee max hit only), **Ranged Strength** (`rangedStr`, flat — ranged max hit, alongside arrow `rangedStr`), and **Magic damage** (`magicDamage`, percent — multiplies the cast Spell's `baseMaxHit`). A stat on gear for one mode never bleeds into another; melee reads `strBonus`, ranged reads `rangedStr`, magic reads `magicDamage`. Item detail lines and tooltips surface all three with flat `+N` for Strength/Ranged Strength and `+N%` for Magic damage.
_Avoid_: strBonus as a catch-all power stat (split across modes since #361/#362)

**Spell**:
Magic's own content ladder — three tiers (Strike, Bolt, Blast) across four Elements, Magic-level-gated (`levelReq` 1–59 in Wave A). Each tier's `baseMaxHit` sets that spell's base damage ceiling; equipped gear's **Magic damage** % scales that ceiling (`floor(baseMaxHit × (1 + magicDamage / 100))`), the way melee/Ranged gear scales their max hits. Magic level gates WHICH Spell can be loaded and drives accuracy only — it never raises max hit. Elements overlap across tiers (e.g. Air Blast is weaker than Fire Bolt) — element choice matters as much as tier. Selecting a Spell is a loadout choice: the loaded rune in the **Rune Slot** IS the Spell (1:1 rune↔spell invariant; twelve runes, twelve spells). Legal any time and independent of the active Monster/Fishing Spot/Dungeon/Recipe. Every Spell carries one **Element**.
_Avoid_: element-on-staff (rejected design — Spells are content, not a weapon property)

**Element**:
One of air, water, earth, or fire — a property of a **Spell** only; melee and Ranged are elementless. A Monster may declare a `weakElement`: a Spell whose Element matches deals bonus damage (see **Weakness**). Explicit per-Monster weakness, no elemental wheel.
_Avoid_: damage type (reserved for **Attack Type**)

**Weakness**:
A Monster's optional `weakElement` and the ×1.5 damage bonus a matching **Spell** deals against it — one of two damage-side multipliers in combat (the other is gear **Magic damage** % on max hit). Both apply independently: `magicDamage` scales the spell's max-hit ceiling before the roll; **Weakness** multiplies the rolled damage after. Keys off the `attack` event's `hit` flag: an accuracy miss never gets it, a zero-damage hit still does.
_Avoid_: resistance (reserved for **Defence Vector**), elemental wheel (not implemented — explicit per-Monster weakness only)

**Weak Spot**:
A Monster's lowest **Defence Vector** entry — the **Attack Type** it defends worst, so the type most rewarding to switch a weapon to. Derived by the **Engine** (`weakSpot` in `src/core/combat.ts`) and carried on the **Snapshot**'s monster view, not a stored Content field: ties break by ATTACK_TYPES order (stab, slash, crush, ranged, magic). Distinct from **Weakness**, which is `weakElement`-based and Magic-only; a Monster always has a Weak Spot, but only some carry a `weakElement` too.
_Avoid_: weakness (reserved for the `weakElement` mechanic above), soft spot

**Theme**:
One of meadow, forest, sewer, crypt, town, or glacier — required on every **Area** (`AreaDef.theme`) so an unthemed new Area is a compile error; drives backdrop and palette gamut resolution in the UI.
_Avoid_: zone palette (as the general term — use Theme)

**Modifier**:
The boost system: temporary percentage boosts from an active **Potion**, permanent percentage boosts from owned **Pets** (summing across the roster), plus the +3 **Combat Style** effective-level boost. Accuracy/level-side only — combat's damage-side multipliers are **Weakness** (rolled damage) and gear **Magic damage** % (max hit).
_Avoid_: buff (as the general term), multiplier (reserved for Weakness damage)

**Tick**:
The 600ms unit of game time. All combat timing (attack speeds, regen) is expressed in Ticks.
_Avoid_: frame, step, cycle

**Drop Table**:
A **Monster**'s weighted loot list, rolled once per kill, with guaranteed / common / uncommon / rare bands.
_Avoid_: loot table

**Drop**:
A concrete **Item** (with quantity) produced by rolling a **Drop Table**.
_Avoid_: loot (as a noun for a single item)

**Item**:
Anything obtainable and storable in the **Bank**: **Equipment**, **Food**, or **Material**. Gold is tracked separately as a currency balance, not an Item stack — see **Gold**.

**Equipment**:
An **Item** worn in one of seven **Gear Slots**, granting a per-**Attack Type** **Defence Vector** plus combat-mode offence bonuses — melee Strength (`strBonus`), Ranged Strength (`rangedStr`), and (on weapons) an **Attack Type** and attack bonus. Jewelry (amulet/ring) may carry melee and Ranged Strength bonuses; weapons carry the stat matching their combat mode. Equipment may declare `levelReq` — Skill levels that must be met to `equip()` the item; absent means no requirement. The gate binds on the action only: gear already worn when a save loads is never stripped for being under-levelled (grandfathering). Worn gear can be removed to empty via `unequip()`, returning it to the Bank — including grandfathered under-levelled gear (the one-way door from #363: unequip always succeeds; re-equipping then throws). The UI surfaces wear requirements in gear-chooser badges (`Lv N`), quiver chooser badges, and item detail/tooltip lines; the Engine gate remains the enforcement point.
_Avoid_: gear (alone), armor (as the general term)

**Gear Slot**:
One of: weapon, shield, head, body, legs, amulet, ring.

**Gear Tier**:
Equipment progression rank: bronze → iron → steel → mithril → adamant → rune. Area gating references Gear Tiers. Each tier carries a wear requirement — the Skill level needed to equip ladder gear at that tier (1 / 5 / 10 / 20 / 30 / 40 in the governing Skill: Attack for melee weapons, Ranged for bows and arrows, Magic for staves, Defence for armour). Wear requirements appear in the gear and quiver choosers and on item detail lines; the Engine still enforces them on `equip()` and `assignLoadoutSlot("quiver", …)`. This wear ladder is distinct from the Smithing ladder (1 / 15 / 30 / 45 / 60 / 75), which gates what you can make, not what you can wear.

**Food**:
An **Item** auto-eaten when the player's HP falls below a threshold, restoring HP. Eaten only via a **Food Slot** — never directly from the Bank.

**Food Slot**:
One of 3 loadout slots holding the player's active Food; the slot is that Food's home (its whole stock lives there while assigned, and new arrivals flow to it), auto-eat drains slots in order, and clicking a slot eats one.

**Loadout Slot**:
A slot in the player's loadout that is an **Item**'s home while assigned — the **Food Slots**, the Potion Slot, the Quiver, and the Rune Slot are its four kinds. Assigning pulls the Item's whole **Bank** stock into the slot; swapping returns the displaced stock to the Bank, room-checked before the swap lands (the incoming Item's freed Bank Slot counts). One shared implementation inside the Engine behind one parameterised assign/clear command pair; each kind keeps only its own rules (Food's 3 indexed slots, the Potion's charges, the Rune Slot's single loaded rune, which IS the player's **Spell** choice — twelve elemental runes across Strike/Bolt/Blast tiers, 1:1 with the Spell ladder). The UI mirrors this with one deep, mounted `createLoadoutSlotUi` module (`src/ui/loadout-slot.ts`) owning all four kinds' chooser state, Item eligibility, and Engine command dispatch; at most one Loadout Slot chooser is open at a time.
_Avoid_: store slot, gear slot (reserved for worn **Equipment**), Rune Pouch (superseded singular Rune Slot — a rune's Element no longer keys a per-Element stack)

**Potion**:
A **Potion** Item opened via the singular Potion Slot (a **Loadout Slot** kind); carries `charges` that drain on qualifying actions. Re-assigning the same potion tops up qty while keeping open charges; swapping to a different potion consumes the open one and returns qty−1 to the **Bank**.
_Avoid_: elixir, flask

**Pet**:
An owned collectible dropped by activity — never an **Item**, never in the **Bank**. `PetDef` declares `target` (a **Skill** or `fishing-speed` / `production-speed`), `boostPct` (deliberately tiny), and `source` (`combat`, `fishing`, `production`, or `{ boss: monsterId }`). Combat/fishing/production pets roll at `PET_DROP_CHANCE`; boss pets at `BOSS_PET_DROP_CHANCE` (`src/core/engine.ts`). Duplicate ownership is impossible (`ownedPets` set). Every owned pet's boost is always-on and boosts sum across the roster — no active-pet slot. Emits `pet-dropped`.
_Avoid_: companion, familiar

**Material**:
An **Item** consumed as a **Recipe** input — stackable, unequippable, uneatable; sellable when it carries a value and always bankable, same as any other Item.
_Avoid_: resource, ingredient (as the general term)

**Bar**:
A metal Material dropped by certain Monsters (e.g. Bronze Bar, Iron Bar) and smithed into Equipment via a **Recipe**.

**Recipe**:
A Smithing-level-gated conversion of Materials into one Equipment Item, trained via the Smithing Skill. Selecting a Recipe crafts it repeatedly on a per-craft cooldown (mirroring a Fishing Spot's Catch cooldown) for as long as its inputs hold out, consuming them and granting Smithing XP at each completion.
_Avoid_: blueprint, formula

**Production Skill**:
A Recipe-driven **Skill** trained by crafting — Smithing, Cooking, Crafting, and Herblore. Each has one management panel, one activity prop, and one scene label, all declared in a single descriptor table (`src/ui/production.ts`); adding a Production Skill is one descriptor row, not new renderer code.
_Avoid_: craft skill, trade skill

**Bank**:
The player's sole **Item** store — there is no separate carried inventory. Every passive Item arrival (Catch, Recipe output, and — once swept out of the **Loot Zone** — Drop and Chest) lands here, unless it's Food assigned to a **Food Slot**, which routes there instead; **Equipment** is worn directly from the Bank, while **Food** is eaten only via a Food Slot. Holds one stack per distinct Item, up to its capacity in **Bank Slots**. Capacity is expanded by spending **Gold**, a gold sink.
_Avoid_: storage, chest, warehouse, inventory

**Loot Zone**:
The small buffer (`LOOT_ZONE_CAPACITY` stacks; `src/core/engine.ts`) where combat Drops accumulate — kill Drops and Dungeon Chest items land here first, not straight in the Bank; Catches and Recipe outputs bypass it entirely and go straight to the Bank, unchanged. Auto-looted into the Bank when the player leaves combat, or manually via Loot all. Excess beyond its capacity is auto-sold for Gold (or discarded, if unsellable). Its sole UI is the Compact Widget's live Loot Zone strip; the Activity destination shows no Loot Zone view, only the **Loot Feed**.
_Avoid_: inventory, loot bag

**Bank Slot**:
One unit of **Bank** capacity; each holds exactly one Item stack regardless of that stack's quantity. A fresh Bank starts at `BANK_START_CAPACITY` (`src/core/engine.ts`).

**Gold**:
The player's currency balance — a number on the player, not an Item stack, so it never occupies a **Bank Slot**. Currency Drops credit it directly; selling an Item, buying Bank Slots, and **Vendor** purchases are its other movements.
_Avoid_: coins, cash, currency (as the general term — use Gold, the v1 currency's name)

**Vendor**:
The shop: `Content.vendor` is a `VendorEntry { itemId, price }[]`. `buy(itemId, qty?)` spends **Gold** (a gold sink alongside Bank Slots); `sell` credits it.
_Avoid_: shop (as the general term — use Vendor)

**Fishing Spot**:
A location inside an **Area** where the player fishes instead of fighting, gated by the Area's own gate (see **Area**) and its own Fishing level requirement. Yields exactly one kind of **Food** per **Catch** (mirroring "a Monster has exactly one Drop Table"); progression comes from unlocking better spots, not from scaling odds.
_Avoid_: fishing node, resource node

**Catch**:
The **Food** produced by a successful attempt at a **Fishing Spot**, rolled once per its cooldown at a flat per-spot chance. Immediately edible ("cooked catch").
_Avoid_: loot (for fish)

**Dungeon**:
A fixed sequence of Monster **Waves** ending in a **Boss**, hosted inside one **Area** (entering it requires that Area unlocked). Clearing the Boss awards a **Chest**; dying mid-run abandons it, and re-entry always restarts at Wave 1 — all-or-nothing, unlike ordinary farming.
_Avoid_: instance, raid

**Wave**:
One Monster fought in sequence within a **Dungeon** run; killing it advances to the next Wave, or to the **Boss** if it was the last one before the Boss.
_Avoid_: stage, room

**Boss**:
The final, toughest Monster in a **Dungeon**'s Wave sequence; killing it completes the Dungeon and opens its **Chest**.
_Avoid_: final boss (redundant)

**Chest**:
A **Dungeon**'s completion reward: every entry in its reward table is rolled independently (multi-roll) rather than the single per-kill roll a **Drop Table** makes.
_Avoid_: loot box

**Loot Feed**:
The scrolling UI log of kills, **Drops**, and level-ups. It is the Activity management destination's only content — a full-height Recent Activity feed with no **Loot Zone** view of its own.

**Engine**:
The single deep module that owns all game state and advances it one **Tick** per call; the only place combat rules live.
_Avoid_: game loop, simulator, game manager

**Offline Progress**:
On boot, elapsed away time is converted to **Ticks** and pumped through the **Engine** (`pumpOffline`, `src/ui/offline-progress.ts`), capped at `OFFLINE_CAP_TICKS` (`src/ui/offline-progress.ts`; ~8h; tuning, not spec — durations beyond the cap render "8h+"). Realizes ADR-0001's "pump N ticks on reopen" prediction; no new architecture.
_Avoid_: idle gains (as the general term — use Offline Progress)

**Snapshot**:
An immutable view of the **Engine**'s state at a point in time — what the UI renders from and what gets saved.
_Avoid_: state (as an interface term), view model

**Save Transfer**:
Manual export/import of a save as a portable string: `encodeSave(snapshot)` / tolerant `decodeSave(text): Snapshot | null` (`src/ui/save-transfer.ts`); decode never throws.
_Avoid_: cloud save, backup file

**SFX**:
Sound effects mounted as an **Engine**-event subscriber (`mountSfx`, `src/ui/sfx.ts`) with a UI mute toggle; presentation-only, never in a **Snapshot**.
_Avoid_: audio engine, sound system

**Respawn**:
The brief post-death state during which the player cannot act; combat auto-resumes on the same **Monster** when it ends — except during a **Dungeon** run, which death abandons, so Respawn ends idle instead.
_Avoid_: death screen, grave

**Compact Widget**:
The fixed 320×220 logical live stage shown while no management surface is open.
It contains only Menu/drag/Close chrome and visual activity feedback: backdrop,
actors, Production prop, non-numeric combat HP bars, transient effects, and the
persistent zero-Food readiness badge (icon beside the Menu control, visible whenever total Food
quantity is 0, in or out of combat). It also carries the live **Loot Zone** strip
beneath the scene, the sole Loot Zone interface. It scales with the complete
workspace at the 100%, 150%, and 200% **UiScale** stops and cannot be freely
resized.

**Cards-on-Glass**:
The single interactive transparent native window model: opaque DOM cards float
inside one window with transparent glass around and between them. It contains
the Compact Widget and the Management Row and never creates persistent or
interactive child windows. On macOS only, a card-count resize from a non-empty
workspace may briefly replace it with a click-through snapshot cover while the
real window is transparent and WebKit catches up; the cover owns no state or
controls and is removed as the real final layout is made visible.

**Management Row**:
The horizontal row of zero to two opaque management cards: the fixed
Character hub and one shared Management card whose body swaps between the
`world`/`bank`/`workshop`/`activity`/`skills` destinations. Each card is 300px wide and
cards are separated by an 8px gap; the row is vertically adjacent to the
Compact Widget within Cards-on-Glass.

**Workspace Rect** (`workspaceRect`):
The pure, logical rectangle for the complete Compact Widget/Card Row union.
`workspaceRect` resolves its size, position, Card Row capacity, monitor clamp,
and **Vertical Anchor** without importing Tauri APIs.

**Anchor** (`VerticalAnchor`):
The `top` or `bottom` choice made when Management Cards first open. A top
anchor keeps the Compact Widget above the Card Row and grows cards downward; a
bottom anchor keeps it below and grows cards upward. It remains stable until
all cards close. `workspaceRect` chooses it by monitor-midpoint comparison
with the 50px `ANCHOR_DEADBAND`.

**Capacity** (`workspaceCapacity`):
The one-to-two-card Management Row limit derived from logical monitor width and
the selected **UiScale**. It never changes the selected scale.

**Workspace Chrome** (`WorkspaceChrome`):
The UI boundary that receives an open-card count and applies the corresponding
Workspace Rect. `createTauriWindowChrome` is its Tauri implementation; browser
fallbacks may reject native calls while retaining the in-page layout.

**Native Window Port** (`NativeWindowPort`):
The narrow adapter over Tauri's native window API. It exposes physical native
size/position and scale factor operations; Workspace Chrome converts them to
logical geometry, which lets the same behavior be tested without a desktop
runtime.

**UiScale**:
Presentation-only local preference under `sidescape-ui-scale-v1`, restricted to
1, 1.5, or 2 and tolerantly defaulted to 1. It scales Compact Widget, cards,
gaps, text, controls, effects, and hit targets together. It never enters an
Engine Snapshot or transferable save. Open cards never persist, and boot always
restores the scaled closed Compact Widget.

## Relationships

- An **Area** holds many **Monsters**
- A **Monster** has exactly one **Drop Table**
- A **Drop Table** roll yields **Drops** (quantities of **Items**)
- A piece of **Equipment** occupies one **Gear Slot** and has one **Gear Tier**
- A weapon's **Combat Mode** and active **Combat Style** together decide which **Skills** an attack's XP trains; Hitpoints always trickles
- Combat advances one **Tick** at a time; each damaging hit grants XP to **Skills** according to the equipped weapon's **Combat Mode** and active **Combat Style**
- The **Engine** emits events for happenings (kill, **Drop**, level-up, death, food eaten, Catch, equipped, unequipped) and produces **Snapshots** for continuous state
- Death leads to **Respawn**, which leads back to fighting the same **Monster**
- The **Bank** holds one Item stack per **Bank Slot** and is the player's sole Item store; **Gold** is tracked separately as a player-level balance, never a Bank stack
- **Gold** sinks: **Bank Slot** expansion and **Vendor** purchases
- A **Pet** is dropped by combat, fishing, production, or boss kills and passively boosts its target **Skill** (or activity speed); owned **Pets**' boosts sum
- A **Drop** or **Chest** item lands in the **Loot Zone** first, not the Bank directly; leaving combat (or the on-demand Loot all) sweeps it into the Bank
- An **Area** may also hold **Fishing Spots**; at most one of a Monster or a Fishing Spot is selected at a time, and selecting one cancels the other
- An **Area** may also host a **Dungeon**: an ordered sequence of **Waves** ending in a **Boss**, rewarding a **Chest** on completion; entering one cancels any selected Monster or Fishing Spot, and vice versa
- A **Recipe** converts Materials into an Equipment Item, training Smithing; at most one of a Monster, a Fishing Spot, a Dungeon run, or a Recipe is active at a time — selecting/entering any one of the four cancels whichever of the other three was active
