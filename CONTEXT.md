# SideScape

A taskbar-sized incremental idle game, thematically similar to RuneScape. The player picks an Area and a Monster; the character auto-fights, earning Skill XP and Drops. Better Equipment unlocks harder Areas with better Drop Tables.

## Language

**Area**:
A themed location the player selects (e.g. Lumbry Meadows, Bone Crypt). Holds several **Monsters** and may be gated behind completing another Area's **Dungeon**; the first Area is open from the start.
_Avoid_: zone, map, region

**Monster**:
An enemy inside an **Area** that the player farms. Has HP, attack/defence stats, an attack cadence in **Ticks**, and exactly one **Drop Table**.
_Avoid_: mob, enemy, NPC

**Skill**:
Attack (hit chance), Strength (max hit), Defence (damage avoidance), Hitpoints (HP pool), Ranged, and Magic — the six combat Skills — plus Fishing and Smithing, the non-combat Skills. Each holds XP and a derived Level (1–99, RuneScape-style exponential table).
_Avoid_: stat, attribute

**Combat Style**:
The player's training selector — Accurate / Aggressive / Defensive — which decides whether melee kill XP goes to Attack, Strength, or Defence. Applies only while the equipped weapon's Combat Mode is melee; Hitpoints XP always trickles regardless of mode.
_Avoid_: stance, mode

**Combat Mode**:
Melee, Ranged, or Magic — the family a weapon belongs to, fixed by the weapon itself (e.g. a sword is melee, a Shortbow is Ranged, an Apprentice Staff is Magic). Decides which Skill an attack's kill XP trains: melee routes through Combat Style, while Ranged and Magic each train their own Skill directly. Orthogonal to Combat Style — picking a Combat Style never changes Combat Mode, and vice versa.
_Avoid_: stance, style (reserved for Combat Style)

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
Anything obtainable: **Equipment**, **Food**, **Material**, or Gold.

**Equipment**:
An **Item** worn in one of five **Gear Slots**, granting attack / strength / defence bonuses.
_Avoid_: gear (alone), armor (as the general term)

**Gear Slot**:
One of: weapon, shield, head, body, legs.

**Gear Tier**:
Equipment progression rank: bronze → iron → steel → mithril. Area gating references Gear Tiers.

**Food**:
An **Item** auto-eaten when the player's HP falls below a threshold, restoring HP.

**Material**:
An **Item** consumed as a **Recipe** input — stackable, unequippable, uneatable; sellable when it carries a value and always bankable, same as any other Item. A **Bar** is the only Material in v1.
_Avoid_: resource, ingredient (as the general term)

**Bar**:
A metal Material dropped by certain Monsters (e.g. Bronze Bar, Iron Bar) and smithed into Equipment via a **Recipe**.

**Recipe**:
A Smithing-level-gated conversion of Materials into one Equipment Item, trained via the Smithing Skill. Selecting a Recipe crafts it repeatedly on a per-craft cooldown (mirroring a Fishing Spot's Catch cooldown) for as long as its inputs hold out, consuming them and granting Smithing XP at each completion.
_Avoid_: blueprint, formula

**Bank**:
A player's storage separate from the carried inventory; deposited **Items** don't count against anything carried, and can't be worn or auto-eaten until withdrawn. Holds one stack per distinct Item, up to its capacity in **Bank Slots**. Capacity is expanded by spending carried gold, a gold sink.
_Avoid_: storage, chest, warehouse

**Bank Slot**:
One unit of **Bank** capacity; each holds exactly one Item stack regardless of that stack's quantity. A fresh Bank starts with 100 Bank Slots.

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

## Relationships

- An **Area** holds many **Monsters**
- A **Monster** has exactly one **Drop Table**
- A **Drop Table** roll yields **Drops** (quantities of **Items**)
- A piece of **Equipment** occupies one **Gear Slot** and has one **Gear Tier**
- A weapon's **Combat Mode** decides which **Skill** an attack's XP trains: melee routes through the active **Combat Style**, Ranged and Magic each train their own Skill
- Combat advances one **Tick** at a time; each kill grants XP to **Skills** according to the equipped weapon's **Combat Mode** (and, for melee, the active **Combat Style**)
- The **Engine** emits events for happenings (kill, **Drop**, level-up, death, food eaten, Catch) and produces **Snapshots** for continuous state
- Death leads to **Respawn**, which leads back to fighting the same **Monster**
- The **Bank** holds one Item stack per **Bank Slot**, separate from the carried inventory
- An **Area** may also hold **Fishing Spots**; at most one of a Monster or a Fishing Spot is selected at a time, and selecting one cancels the other
- An **Area** may also host a **Dungeon**: an ordered sequence of **Waves** ending in a **Boss**, rewarding a **Chest** on completion; entering one cancels any selected Monster or Fishing Spot, and vice versa
- A **Recipe** converts Materials into an Equipment Item, training Smithing; at most one of a Monster, a Fishing Spot, a Dungeon run, or a Recipe is active at a time — selecting/entering any one of the four cancels whichever of the other three was active
