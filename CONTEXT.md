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
Attack (hit chance), Strength (max hit), Defence (damage avoidance), Hitpoints (HP pool), Ranged, and Magic — the six combat Skills — plus Fishing and Smithing, the non-combat Skills. Each holds XP and a derived Level (1–99, RuneScape-style exponential table).
_Avoid_: stat, attribute

**Combat Style**:
The player's training selector — Accurate / Aggressive / Defensive — which decides whether melee kill XP goes to Attack, Strength, or Defence. Applies only while the equipped weapon's Combat Mode is melee; Hitpoints XP always trickles regardless of mode.
_Avoid_: stance, mode

**Combat Mode**:
Melee, Ranged, or Magic — the family a weapon belongs to, derived from the weapon's own **Attack Type** (stab/slash/crush → melee, ranged → Ranged, magic → Magic). Decides which Skill an attack's kill XP trains: melee routes through Combat Style, while Ranged and Magic each train their own Skill directly. Orthogonal to Combat Style — picking a Combat Style never changes Combat Mode, and vice versa.
_Avoid_: stance, style (reserved for Combat Style)

**Attack Type**:
One of stab, slash, crush, ranged, or magic — the single type a weapon attacks with, fixed by the weapon itself (a dagger is stab, a sword is slash, a mace is crush, a Shortbow is ranged, an Apprentice Staff is magic); a weapon has exactly one, never a per-swing choice. Melee's three sub-types (stab/slash/crush) all fall under the melee **Combat Mode**, which is derived from Attack Type rather than stored separately. The player's accuracy roll checks the defending Monster's **Defence Vector** entry for the attacker's own Attack Type, so a Monster's weak spot is simply the type it defends worst.
_Avoid_: attack style (reserved for Combat Style), damage type

**Defence Vector**:
A piece of Equipment's or a Monster's defence bonus, broken out per **Attack Type** rather than a single scalar — five numbers (stab/slash/crush/ranged/magic) instead of one. An accuracy roll checks the Defence Vector entry matching the attacker's own Attack Type; the level half of the roll (Defence Skill for the player, `defenceLevel` for a Monster) stays a single number, untouched.
_Avoid_: defence bonus (singular, pre-Combat-Depth terminology), resistance

**Spell**:
Magic's own content ladder — a Magic-level-gated selection (`levelReq`) that decides the player's magic max hit (`baseMaxHit`) directly, the way a weapon decides melee/Ranged's; Magic level gates WHICH Spell can be selected, the Spell itself decides the damage. Selecting a Spell is a loadout choice like Combat Style, legal any time and independent of the active Monster/Fishing Spot/Dungeon/Recipe. Every Spell carries one **Element**.
_Avoid_: element-on-staff (rejected design — Spells are content, not a weapon property)

**Element**:
One of air, water, earth, or fire — a property of a **Spell** only; melee and Ranged are elementless. A Monster may declare a `weakElement`: a Spell whose Element matches deals bonus damage (see **Weakness**). Explicit per-Monster weakness, no elemental wheel.
_Avoid_: damage type (reserved for **Attack Type**)

**Weakness**:
A Monster's optional `weakElement` and the ×1.5 damage bonus a matching **Spell** deals against it — the ONE damage-side modifier in the otherwise accuracy-only Hybrid combat model (every other Skill/Attack Type change is an accuracy or max-hit shift, never a multiplier). Keys off the `attack` event's `hit` flag: an accuracy miss never gets it, a zero-damage hit still does.
_Avoid_: resistance (reserved for **Defence Vector**), elemental wheel (not implemented — explicit per-Monster weakness only)

**Weak Spot**:
A Monster's lowest **Defence Vector** entry — the **Attack Type** it defends worst, so the type most rewarding to switch a weapon to. UI-derived (`src/ui/app.ts`), not a stored field: ties break by ATTACK_TYPES order (stab, slash, crush, ranged, magic). Distinct from **Weakness**, which is `weakElement`-based and Magic-only; a Monster always has a Weak Spot, but only some carry a `weakElement` too.
_Avoid_: weakness (reserved for the `weakElement` mechanic above), soft spot

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
An **Item** worn in one of five **Gear Slots**, granting a per-**Attack Type** **Defence Vector** plus, for weapons only, attack/strength bonuses and an **Attack Type** of its own.
_Avoid_: gear (alone), armor (as the general term)

**Gear Slot**:
One of: weapon, shield, head, body, legs.

**Gear Tier**:
Equipment progression rank: bronze → iron → steel → mithril. Area gating references Gear Tiers.

**Food**:
An **Item** auto-eaten when the player's HP falls below a threshold, restoring HP. Eaten only via a **Food Slot** — never directly from the Bank.

**Food Slot**:
One of 3 loadout slots holding the player's active Food; the slot is that Food's home (its whole stock lives there while assigned, and new arrivals flow to it), auto-eat drains slots in order, and clicking a slot eats one.

**Material**:
An **Item** consumed as a **Recipe** input — stackable, unequippable, uneatable; sellable when it carries a value and always bankable, same as any other Item. A **Bar** is the only Material in v1.
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
The small buffer (10 stacks) where combat Drops accumulate — kill Drops and Dungeon Chest items land here first, not straight in the Bank; Catches and Recipe outputs bypass it entirely and go straight to the Bank, unchanged. Auto-looted into the Bank when the player leaves combat, or manually via Loot all. Excess beyond its capacity is auto-sold for Gold (or discarded, if unsellable).
_Avoid_: inventory, loot bag

**Bank Slot**:
One unit of **Bank** capacity; each holds exactly one Item stack regardless of that stack's quantity. A fresh Bank starts with 100 Bank Slots.

**Gold**:
The player's currency balance — a number on the player, not an Item stack, so it never occupies a **Bank Slot**. Currency Drops credit it directly; selling an Item and buying Bank Slots are its only other movements.
_Avoid_: coins, cash, currency (as the general term — use Gold, the v1 currency's name)

**Fishing Spot**:
A location inside an **Area** where the player fishes instead of fighting, gated by the Area's own gate (see **Area**) and its own Fishing level requirement. Yields exactly one kind of **Food** per **Catch** (mirroring "a Monster has exactly one Drop Table"); progression comes from unlocking better spots, not from scaling odds.
_Avoid_: fishing node, resource node

**Catch**:
The **Food** produced by a successful attempt at a **Fishing Spot**, rolled once per its cooldown at a flat per-spot chance. Immediately edible ("cooked catch") — v1 has no Cooking Skill in between.
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
The scrolling UI log of kills, **Drops**, and level-ups.

**Engine**:
The single deep module that owns all game state and advances it one **Tick** per call; the only place combat rules live.
_Avoid_: game loop, simulator, game manager

**Snapshot**:
An immutable view of the **Engine**'s state at a point in time — what the UI renders from and what gets saved.
_Avoid_: state (as an interface term), view model

**Respawn**:
The brief post-death state during which the player cannot act; combat auto-resumes on the same **Monster** when it ends — except during a **Dungeon** run, which death abandons, so Respawn ends idle instead.
_Avoid_: death screen, grave

**Compact Widget**:
The opaque gameplay card shown while no management surface is open. Its default
geometry is 320×460; its locally stored dimensions are presentation state,
never part of an Engine **Snapshot** or transferable save.

**Cards-on-Glass**:
The single transparent native window model: opaque DOM cards float inside one
window with transparent glass around and between them. Cards-on-Glass never
creates child windows; it contains the Compact Widget and the Management Row.

**Management Row**:
The horizontal row of zero to three opaque management cards. Each card is
300px wide and cards are separated by an 8px gap; the row is vertically
adjacent to the Compact Widget within Cards-on-Glass.

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
The one-to-three-card Management Row limit derived from logical monitor width.
`workspaceCapacity` computes it from 300px cards and the 8px `CARD_GAP`.

**Workspace Chrome** (`WorkspaceChrome`):
The UI boundary that receives an open-card count and applies the corresponding
Workspace Rect. `createTauriWindowChrome` is its Tauri implementation; browser
fallbacks may reject native calls while retaining the in-page layout.

**Native Window Port** (`NativeWindowPort`):
The narrow adapter over Tauri's native window API. It exposes physical native
size/position and scale factor operations; Workspace Chrome converts them to
logical geometry, which lets the same behavior be tested without a desktop
runtime.

**Geometry Persistence** (`StoredGeometry`):
Presentation-only local preference under `sidescape-ui-geometry-v2`: compact
width/height and preferred Management Card height. It never records the open
Card Row, so a relaunch starts closed.

## Relationships

- An **Area** holds many **Monsters**
- A **Monster** has exactly one **Drop Table**
- A **Drop Table** roll yields **Drops** (quantities of **Items**)
- A piece of **Equipment** occupies one **Gear Slot** and has one **Gear Tier**
- A weapon's **Combat Mode** decides which **Skill** an attack's XP trains: melee routes through the active **Combat Style**, Ranged and Magic each train their own Skill
- Combat advances one **Tick** at a time; each kill grants XP to **Skills** according to the equipped weapon's **Combat Mode** (and, for melee, the active **Combat Style**)
- The **Engine** emits events for happenings (kill, **Drop**, level-up, death, food eaten, Catch) and produces **Snapshots** for continuous state
- Death leads to **Respawn**, which leads back to fighting the same **Monster**
- The **Bank** holds one Item stack per **Bank Slot** and is the player's sole Item store; **Gold** is tracked separately as a player-level balance, never a Bank stack
- A **Drop** or **Chest** item lands in the **Loot Zone** first, not the Bank directly; leaving combat (or the on-demand Loot all) sweeps it into the Bank
- An **Area** may also hold **Fishing Spots**; at most one of a Monster or a Fishing Spot is selected at a time, and selecting one cancels the other
- An **Area** may also host a **Dungeon**: an ordered sequence of **Waves** ending in a **Boss**, rewarding a **Chest** on completion; entering one cancels any selected Monster or Fishing Spot, and vice versa
- A **Recipe** converts Materials into an Equipment Item, training Smithing; at most one of a Monster, a Fishing Spot, a Dungeon run, or a Recipe is active at a time — selecting/entering any one of the four cancels whichever of the other three was active
