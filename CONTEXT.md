# SideScape

A taskbar-sized incremental idle game, thematically similar to RuneScape. The player picks an Area and a Monster; the character auto-fights, earning Skill XP and Drops. Better Equipment unlocks harder Areas with better Drop Tables.

## Language

**Area**:
A themed location the player selects (e.g. Lumbry Meadows, Bone Crypt). Holds several **Monsters** and may be gated by a combat-level or Gear Tier requirement.
_Avoid_: zone, map, region

**Monster**:
An enemy inside an **Area** that the player farms. Has HP, attack/defence stats, an attack cadence in **Ticks**, and exactly one **Drop Table**.
_Avoid_: mob, enemy, NPC

**Skill**:
One of Attack (hit chance), Strength (max hit), Defence (damage avoidance), Hitpoints (HP pool). Each holds XP and a derived Level (1–99, RuneScape-style exponential table).
_Avoid_: stat, attribute

**Combat Style**:
The player's training selector — Accurate / Aggressive / Defensive — which decides whether kill XP goes to Attack, Strength, or Defence. Hitpoints XP always trickles.
_Avoid_: stance, mode

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
Anything obtainable: **Equipment**, **Food**, or Gold.

**Equipment**:
An **Item** worn in one of five **Gear Slots**, granting attack / strength / defence bonuses.
_Avoid_: gear (alone), armor (as the general term)

**Gear Slot**:
One of: weapon, shield, head, body, legs.

**Gear Tier**:
Equipment progression rank: bronze → iron → steel → mithril. Area gating references Gear Tiers.

**Food**:
An **Item** auto-eaten when the player's HP falls below a threshold, restoring HP.

**Loot Feed**:
The scrolling UI log of kills, **Drops**, and level-ups.

**Engine**:
The single deep module that owns all game state and advances it one **Tick** per call; the only place combat rules live.
_Avoid_: game loop, simulator, game manager

**Snapshot**:
An immutable view of the **Engine**'s state at a point in time — what the UI renders from and what gets saved.
_Avoid_: state (as an interface term), view model

**Respawn**:
The brief post-death state during which the player cannot act; combat auto-resumes on the same **Monster** when it ends.
_Avoid_: death screen, grave

## Relationships

- An **Area** holds many **Monsters**
- A **Monster** has exactly one **Drop Table**
- A **Drop Table** roll yields **Drops** (quantities of **Items**)
- A piece of **Equipment** occupies one **Gear Slot** and has one **Gear Tier**
- Combat advances one **Tick** at a time; each kill grants XP to **Skills** according to the active **Combat Style**
- The **Engine** emits events for happenings (kill, **Drop**, level-up, death, food eaten) and produces **Snapshots** for continuous state
- Death leads to **Respawn**, which leads back to fighting the same **Monster**
