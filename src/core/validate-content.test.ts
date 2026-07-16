import { describe, expect, it } from "vitest";
import { resolveContent, validateContent } from "./validate-content";
import { fixtureContent } from "./fixture-content";
import { content as realContent } from "../data";
import type { Content } from "./types";

describe("validateContent", () => {
  it("returns [] for the fixture Content", () => {
    expect(validateContent(fixtureContent)).toEqual([]);
  });

  it("returns [] for the real v1 Content", () => {
    expect(validateContent(realContent)).toEqual([]);
  });

  it("reports zero currency items", () => {
    const content: Content = {
      ...fixtureContent,
      items: fixtureContent.items.filter((i) => i.kind !== "currency"),
    };
    expect(validateContent(content)).toContain("Content defines no currency item");
  });

  it("reports two currency items", () => {
    const content: Content = {
      ...fixtureContent,
      items: [
        ...fixtureContent.items,
        { kind: "currency", id: "gems", name: "Gems", icon: "gold" },
      ],
    };
    const violations = validateContent(content);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/currency/i);
    expect(violations[0]).toContain("2");
  });

  it("reports a dangling dropTable itemId", () => {
    const content: Content = {
      ...fixtureContent,
      monsters: fixtureContent.monsters.map((m) =>
        m.id === "dummy"
          ? {
              ...m,
              dropTable: [
                ...m.dropTable,
                { itemId: "gold-bar", qty: 1, chance: 1, band: "rare" as const },
              ],
            }
          : m,
      ),
    };
    expect(validateContent(content)).toContain(
      'dropTable itemId "gold-bar" not found (monster "dummy")',
    );
  });

  it("reports a weapon that declares no attackSpeed", () => {
    const content: Content = {
      ...fixtureContent,
      items: fixtureContent.items.map((i) => {
        if (i.kind !== "equipment" || i.id !== "bronze-sword") return i;
        const { attackSpeed: _dropped, ...speedless } = i;
        return speedless;
      }),
    };
    expect(validateContent(content)).toContain('weapon "bronze-sword" declares no attackSpeed');
  });

  it("does not require attackSpeed on non-weapon Equipment", () => {
    const content: Content = {
      ...fixtureContent,
      items: [
        ...fixtureContent.items,
        {
          kind: "equipment" as const,
          id: "plain-shield",
          name: "Plain Shield",
          icon: "bronze-shield",
          slot: "shield" as const,
          def: { stab: 1, slash: 1, crush: 1, ranged: 1, magic: 1 },
        },
      ],
    };
    expect(validateContent(content)).toEqual([]);
  });

  it("reports an item that declares no icon (#78)", () => {
    const content: Content = {
      ...fixtureContent,
      items: fixtureContent.items.map((i) => {
        if (i.id !== "bronze-sword") return i;
        const { icon: _dropped, ...iconless } = i;
        return iconless as unknown as (typeof fixtureContent.items)[number];
      }),
    };
    expect(validateContent(content)).toContain('item "bronze-sword" declares no icon');
  });

  it("reports an item with an empty-string icon", () => {
    const content: Content = {
      ...fixtureContent,
      items: fixtureContent.items.map((i) => (i.id === "bronze-sword" ? { ...i, icon: "" } : i)),
    };
    expect(validateContent(content)).toContain('item "bronze-sword" declares no icon');
  });

  it("reports a weapon that declares no attackType (#99)", () => {
    const content: Content = {
      ...fixtureContent,
      items: fixtureContent.items.map((i) => {
        if (i.kind !== "equipment" || i.id !== "bronze-sword") return i;
        const { attackType: _dropped, ...typeless } = i;
        return typeless;
      }),
    };
    expect(validateContent(content)).toContain('weapon "bronze-sword" declares no attackType');
  });

  it("reports a non-weapon that declares an attackType (#99)", () => {
    const content: Content = {
      ...fixtureContent,
      items: [
        ...fixtureContent.items,
        {
          kind: "equipment" as const,
          id: "cursed-shield",
          name: "Cursed Shield",
          icon: "bronze-shield",
          slot: "shield" as const,
          attackType: "crush" as const,
          def: { stab: 1, slash: 1, crush: 1, ranged: 1, magic: 1 },
        },
      ],
    };
    expect(validateContent(content)).toContain('non-weapon "cursed-shield" declares attackType');
  });

  it("permits twoHanded on weapons and rejects it on non-weapons (#340)", () => {
    const legalTwoHanded: Content = {
      ...fixtureContent,
      items: [
        ...fixtureContent.items,
        {
          kind: "equipment" as const,
          id: "two-hand-sword",
          name: "Two Hand Sword",
          icon: "bronze-sword",
          slot: "weapon" as const,
          attackType: "slash" as const,
          atkBonus: 10,
          strBonus: 10,
          def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
          attackSpeed: 4,
          twoHanded: true,
        },
        {
          kind: "equipment" as const,
          id: "one-hand-sword",
          name: "One Hand Sword",
          icon: "bronze-sword",
          slot: "weapon" as const,
          attackType: "slash" as const,
          atkBonus: 8,
          strBonus: 8,
          def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
          attackSpeed: 4,
        },
      ],
    };
    expect(validateContent(legalTwoHanded)).toEqual([]);

    const illegalShield: Content = {
      ...fixtureContent,
      items: [
        ...fixtureContent.items,
        {
          kind: "equipment" as const,
          id: "cursed-shield",
          name: "Cursed Shield",
          icon: "bronze-shield",
          slot: "shield" as const,
          def: { stab: 1, slash: 1, crush: 1, ranged: 1, magic: 1 },
          twoHanded: false,
        },
      ],
    };
    expect(validateContent(illegalShield)).toContain(
      'non-weapon "cursed-shield" declares twoHanded',
    );
  });

  it("permits atkBonus/strBonus on jewelry (amulet/ring slots, #117 — the owner's offence-slot decision)", () => {
    const content: Content = {
      ...fixtureContent,
      items: [
        ...fixtureContent.items,
        {
          kind: "equipment" as const,
          id: "test-amulet",
          name: "Test Amulet",
          icon: "goblin-charm",
          slot: "amulet" as const,
          atkBonus: 3,
          strBonus: 2,
          def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 1 },
        },
        {
          kind: "equipment" as const,
          id: "test-ring",
          name: "Test Ring",
          icon: "goblin-charm",
          slot: "ring" as const,
          atkBonus: 2,
          strBonus: 1,
          def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
        },
      ],
    };
    expect(validateContent(content)).toEqual([]);
  });

  it("still rejects attackType on jewelry (#117) — jewelry never attacks, same as every other non-weapon", () => {
    const content: Content = {
      ...fixtureContent,
      items: [
        ...fixtureContent.items,
        {
          kind: "equipment" as const,
          id: "cursed-amulet",
          name: "Cursed Amulet",
          icon: "goblin-charm",
          slot: "amulet" as const,
          attackType: "crush" as const,
          atkBonus: 3,
          strBonus: 2,
          def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 1 },
        },
      ],
    };
    expect(validateContent(content)).toContain('non-weapon "cursed-amulet" declares attackType');
  });

  it("still rejects attackSpeed on jewelry (#117)", () => {
    const content: Content = {
      ...fixtureContent,
      items: [
        ...fixtureContent.items,
        {
          kind: "equipment" as const,
          id: "cursed-ring",
          name: "Cursed Ring",
          icon: "goblin-charm",
          slot: "ring" as const,
          attackType: "crush" as const,
          atkBonus: 2,
          strBonus: 1,
          attackSpeed: 4,
          def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
        },
      ],
    };
    expect(validateContent(content)).toContain('jewelry "cursed-ring" declares attackSpeed');
  });

  it("still rejects atkBonus/strBonus on ordinary armour (non-jewelry, non-weapon) slots (#117 does not widen this)", () => {
    const content: Content = {
      ...fixtureContent,
      items: [
        ...fixtureContent.items,
        {
          kind: "equipment" as const,
          id: "cursed-shield-2",
          name: "Cursed Shield 2",
          icon: "bronze-shield",
          slot: "shield" as const,
          atkBonus: 5,
          strBonus: 5,
          def: { stab: 1, slash: 1, crush: 1, ranged: 1, magic: 1 },
        },
      ],
    };
    const violations = validateContent(content);
    expect(violations).toContain('non-weapon "cursed-shield-2" declares atkBonus');
    expect(violations).toContain('non-weapon "cursed-shield-2" declares strBonus');
  });

  it("reports a dangling area.monsterIds reference", () => {
    const content: Content = {
      ...fixtureContent,
      areas: fixtureContent.areas.map((a) =>
        a.id === "meadow" ? { ...a, monsterIds: [...a.monsterIds, "ogre"] } : a,
      ),
    };
    const violations = validateContent(content);
    expect(violations.some((v) => v.includes("ogre") && v.includes("meadow"))).toBe(true);
  });

  it("reports a dangling area.fishingSpotIds reference", () => {
    const content: Content = {
      ...fixtureContent,
      areas: fixtureContent.areas.map((a) =>
        a.id === "meadow" ? { ...a, fishingSpotIds: [...(a.fishingSpotIds ?? []), "lake"] } : a,
      ),
    };
    const violations = validateContent(content);
    expect(violations.some((v) => v.includes("lake") && v.includes("meadow"))).toBe(true);
  });

  it("reports a dangling fishingSpot.itemId reference", () => {
    const content: Content = {
      ...fixtureContent,
      fishingSpots: fixtureContent.fishingSpots.map((s) =>
        s.id === "pond" ? { ...s, itemId: "no-such-item" } : s,
      ),
    };
    const violations = validateContent(content);
    expect(violations.some((v) => v.includes("no-such-item") && v.includes("pond"))).toBe(true);
  });

  it("reports a fishingSpot.itemId that resolves but is not a Material (#115)", () => {
    const content: Content = {
      ...fixtureContent,
      fishingSpots: fixtureContent.fishingSpots.map((s) =>
        s.id === "pond" ? { ...s, itemId: "gold" } : s,
      ),
    };
    expect(validateContent(content)).toContain(
      'fishingSpot "pond" itemId "gold" is not a Material',
    );
  });

  it("reports a dangling recipe inputs itemId reference", () => {
    const content: Content = {
      ...fixtureContent,
      recipes: fixtureContent.recipes.map((r) =>
        r.id === "test-sword" ? { ...r, inputs: [{ itemId: "no-such-bar", qty: 1 }] } : r,
      ),
    };
    const violations = validateContent(content);
    expect(violations.some((v) => v.includes("no-such-bar") && v.includes("test-sword"))).toBe(
      true,
    );
  });

  it("reports a dangling recipe outputItemId reference", () => {
    const content: Content = {
      ...fixtureContent,
      recipes: fixtureContent.recipes.map((r) =>
        r.id === "test-sword" ? { ...r, outputItemId: "no-such-output" } : r,
      ),
    };
    const violations = validateContent(content);
    expect(violations.some((v) => v.includes("no-such-output") && v.includes("test-sword"))).toBe(
      true,
    );
  });

  it("reports a duplicate id within a collection", () => {
    const meat = fixtureContent.items.find((i) => i.id === "meat")!;
    const content: Content = {
      ...fixtureContent,
      items: [...fixtureContent.items, { ...meat }],
    };
    const violations = validateContent(content);
    expect(violations).toEqual([`items contains 2 entries with id "${meat.id}"`]);
  });

  it("aggregates every violation instead of failing fast", () => {
    const content: Content = {
      ...fixtureContent,
      items: fixtureContent.items.filter((i) => i.kind !== "currency"),
      monsters: fixtureContent.monsters.map((m) =>
        m.id === "dummy"
          ? {
              ...m,
              dropTable: [
                ...m.dropTable,
                { itemId: "gold-bar", qty: 1, chance: 1, band: "rare" as const },
              ],
            }
          : m,
      ),
      fishingSpots: fixtureContent.fishingSpots.map((s) =>
        s.id === "pond" ? { ...s, itemId: "gold" } : s,
      ),
    };
    const violations = validateContent(content);
    expect(violations.length).toBeGreaterThanOrEqual(3);
    expect(violations.some((v) => v.includes("no currency"))).toBe(true);
    expect(violations.some((v) => v.includes("gold-bar"))).toBe(true);
    // "gold" was stripped from items above, so the fishingSpot itemId is now dangling,
    // not "not a Material" — both are violations, exercised as the third one here.
    expect(violations.some((v) => v.includes("gold") && v.includes("pond"))).toBe(true);
  });

  it("allows orphans: a monster or fishingSpot unreferenced by any Area is valid", () => {
    const content: Content = {
      ...fixtureContent,
      monsters: [
        ...fixtureContent.monsters,
        {
          id: "orphan-monster",
          name: "Orphan",
          hp: 1,
          attackLevel: 1,
          defenceLevel: 1,
          maxHit: 1,
          attackSpeed: 4,
          attackType: "crush",
          def: { stab: 0, slash: 0, crush: 0, ranged: 0, magic: 0 },
          dropTable: [],
        },
      ],
      fishingSpots: [
        ...fixtureContent.fishingSpots,
        {
          id: "orphan-spot",
          name: "Orphan Spot",
          levelReq: 1,
          itemId: "bar", // must be a Material (#115) — "bar" is fixtureContent's other one
          xp: 1,
          catchTicks: 1,
          catchChance: 1,
        },
      ],
    };
    expect(validateContent(content)).toEqual([]);
  });

  it("reports zero spells (#101) — not doubled up with the redundant levelReq-1 message", () => {
    // Strip rune items (and their vendor entries) too (#221): with no Spells at all, every rune
    // item would otherwise also report as unreferenced, and the vendor would then dangle-reference
    // them — real, separate invariants, but not what this test isolates.
    const content: Content = {
      ...fixtureContent,
      items: fixtureContent.items.filter((i) => !(i.kind === "ammo" && i.ammoType === "rune")),
      vendor: fixtureContent.vendor.filter(
        (v) => !["air-rune", "water-rune", "earth-rune", "fire-rune"].includes(v.itemId),
      ),
      spells: [],
    };
    expect(validateContent(content)).toEqual(["Content defines no spells"]);
  });

  it("reports no spell at levelReq 1 (#101) — spellId: null could never resolve", () => {
    const content: Content = {
      ...fixtureContent,
      spells: fixtureContent.spells.map((s) => (s.id === "test-spark" ? { ...s, levelReq: 2 } : s)),
    };
    expect(validateContent(content)).toContain("Content defines no spell with levelReq 1");
  });

  it("reports a spell with baseMaxHit < 1 (#101)", () => {
    const content: Content = {
      ...fixtureContent,
      spells: fixtureContent.spells.map((s) =>
        s.id === "test-spark" ? { ...s, baseMaxHit: 0 } : s,
      ),
    };
    expect(validateContent(content)).toContain('spell "test-spark" baseMaxHit must be >= 1');
  });

  it("reports a duplicate spell id (#101)", () => {
    const spark = fixtureContent.spells.find((s) => s.id === "test-spark")!;
    const content: Content = {
      ...fixtureContent,
      spells: [...fixtureContent.spells, { ...spark }],
    };
    expect(validateContent(content)).toContain('spells contains 2 entries with id "test-spark"');
  });

  describe("Ammo (#119)", () => {
    it("reports a rune that declares no element", () => {
      const content: Content = {
        ...fixtureContent,
        items: fixtureContent.items.map((i) => {
          if (i.id !== "air-rune" || i.kind !== "ammo") return i;
          const { element: _element, ...rest } = i;
          return rest as typeof i;
        }),
      };
      expect(validateContent(content)).toContain('rune "air-rune" declares no element');
    });

    it("reports an arrow that declares no rangedStr", () => {
      const content: Content = {
        ...fixtureContent,
        items: fixtureContent.items.map((i) => {
          if (i.id !== "arrow" || i.kind !== "ammo") return i;
          const { rangedStr: _rangedStr, ...rest } = i;
          return rest as typeof i;
        }),
      };
      expect(validateContent(content)).toContain('arrow "arrow" declares no rangedStr');
    });

    it("reports an arrow that declares an element", () => {
      const content: Content = {
        ...fixtureContent,
        items: fixtureContent.items.map((i) =>
          i.id === "arrow" && i.kind === "ammo" ? { ...i, element: "air" as const } : i,
        ),
      };
      expect(validateContent(content)).toContain('arrow "arrow" declares element');
    });

    it("a valid arrow/rune pair (rangedStr xor element) reports nothing", () => {
      expect(validateContent(fixtureContent)).toEqual([]);
    });
  });

  describe("Rune Slot 1:1 (#221): SpellDef.runeId <-> rune Item", () => {
    it("reports a runeId that doesn't resolve to any Item", () => {
      const content: Content = {
        ...fixtureContent,
        spells: fixtureContent.spells.map((s) =>
          s.id === "test-spark" ? { ...s, runeId: "no-such-item" } : s,
        ),
      };
      expect(validateContent(content)).toContain(
        'spell "test-spark" runeId "no-such-item" does not resolve to a rune item',
      );
    });

    it("reports a runeId that resolves to a non-rune Item", () => {
      const content: Content = {
        ...fixtureContent,
        spells: fixtureContent.spells.map((s) =>
          s.id === "test-spark" ? { ...s, runeId: "arrow" } : s,
        ),
      };
      expect(validateContent(content)).toContain(
        'spell "test-spark" runeId "arrow" does not resolve to a rune item',
      );
    });

    it("reports a Spell whose Element disagrees with its rune's Element", () => {
      const content: Content = {
        ...fixtureContent,
        spells: fixtureContent.spells.map((s) =>
          s.id === "test-spark" ? { ...s, runeId: "water-rune" } : s,
        ),
      };
      expect(validateContent(content)).toContain(
        'spell "test-spark" element "air" disagrees with rune "water-rune" element "water"',
      );
    });

    it("reports two Spells sharing one runeId", () => {
      const content: Content = {
        ...fixtureContent,
        spells: fixtureContent.spells.map((s) =>
          s.id === "test-blast" ? { ...s, runeId: "air-rune" } : s,
        ),
      };
      expect(validateContent(content)).toContain(
        'runeId "air-rune" is referenced by 2 spells, expected exactly 1',
      );
    });

    it("reports a rune Item that no Spell references", () => {
      const extraRune = {
        kind: "ammo" as const,
        id: "extra-rune",
        name: "Extra Rune",
        icon: "sapphire",
        ammoType: "rune" as const,
        element: "air" as const,
        value: 1,
      };
      const content: Content = { ...fixtureContent, items: [...fixtureContent.items, extraRune] };
      expect(validateContent(content)).toContain(
        'rune "extra-rune" is not referenced by any spell',
      );
    });

    it("the fixture's own 1:1 rune/Spell links report nothing", () => {
      expect(validateContent(fixtureContent)).toEqual([]);
    });
  });

  describe("Vendor (#119)", () => {
    it("reports a vendor entry itemId that isn't a real Item", () => {
      const content: Content = {
        ...fixtureContent,
        vendor: [...fixtureContent.vendor, { itemId: "unobtainium", price: 5 }],
      };
      expect(validateContent(content)).toContain('vendor itemId "unobtainium" not found');
    });

    it("an empty vendor list reports nothing", () => {
      const content: Content = { ...fixtureContent, vendor: [] };
      expect(validateContent(content)).toEqual([]);
    });
  });

  it("allows empty collections (spells excepted — it must keep a levelReq-1 entry)", () => {
    const content: Content = {
      areas: [],
      monsters: [],
      items: fixtureContent.items,
      fishingSpots: [],
      dungeons: [],
      recipes: [],
      spells: fixtureContent.spells,
      vendor: [],
      pets: [],
    };
    expect(validateContent(content)).toEqual([]);
  });

  describe("Dungeons (#250)", () => {
    it("reports a duplicate dungeon id", () => {
      const gauntlet = fixtureContent.dungeons.find((d) => d.id === "gauntlet")!;
      const content: Content = {
        ...fixtureContent,
        dungeons: [...fixtureContent.dungeons, { ...gauntlet }],
      };
      expect(validateContent(content)).toContain('dungeons contains 2 entries with id "gauntlet"');
    });

    it("reports a dangling dungeon areaId reference", () => {
      const content: Content = {
        ...fixtureContent,
        dungeons: fixtureContent.dungeons.map((d) =>
          d.id === "gauntlet" ? { ...d, areaId: "no-such-area" } : d,
        ),
      };
      expect(validateContent(content)).toContain(
        'dungeon "gauntlet" areaId "no-such-area" not found',
      );
    });

    it("reports a dungeon with an empty waves array", () => {
      const content: Content = {
        ...fixtureContent,
        dungeons: fixtureContent.dungeons.map((d) =>
          d.id === "gauntlet" ? { ...d, waves: [] } : d,
        ),
      };
      expect(validateContent(content)).toContain('dungeon "gauntlet" has no waves');
    });

    it("reports a dungeon wave that references an unknown monster", () => {
      const content: Content = {
        ...fixtureContent,
        dungeons: fixtureContent.dungeons.map((d) =>
          d.id === "gauntlet" ? { ...d, waves: [...d.waves, "no-such-monster"] } : d,
        ),
      };
      expect(validateContent(content)).toContain(
        'dungeon "gauntlet" wave references unknown monster "no-such-monster"',
      );
    });

    it("reports a dungeon chest entry that references an unknown item", () => {
      const content: Content = {
        ...fixtureContent,
        dungeons: fixtureContent.dungeons.map((d) =>
          d.id === "gauntlet"
            ? {
                ...d,
                chest: [
                  ...d.chest,
                  { itemId: "no-such-item", qty: 1, chance: 1, band: "rare" as const },
                ],
              }
            : d,
        ),
      };
      expect(validateContent(content)).toContain(
        'dungeon "gauntlet" chest references unknown item "no-such-item"',
      );
    });

    it("aggregates every dungeon violation instead of failing fast", () => {
      const content: Content = {
        ...fixtureContent,
        dungeons: fixtureContent.dungeons.map((d) =>
          d.id === "gauntlet"
            ? { ...d, areaId: "no-such-area", waves: [...d.waves, "no-such-monster"] }
            : d,
        ),
      };
      const violations = validateContent(content);
      expect(violations).toContain('dungeon "gauntlet" areaId "no-such-area" not found');
      expect(violations).toContain(
        'dungeon "gauntlet" wave references unknown monster "no-such-monster"',
      );
    });

    it("the fixture's own dungeon (gauntlet) reports nothing", () => {
      expect(validateContent(fixtureContent)).toEqual([]);
    });
  });

  describe("Pets (#120)", () => {
    it("reports a pet that declares no icon", () => {
      const content: Content = {
        ...fixtureContent,
        pets: fixtureContent.pets.map((p) => {
          if (p.id !== "test-combat-pet") return p;
          const { icon: _dropped, ...iconless } = p;
          return iconless as unknown as (typeof fixtureContent.pets)[number];
        }),
      };
      expect(validateContent(content)).toContain('pet "test-combat-pet" declares no icon');
    });

    it("reports a pet with an empty-string icon", () => {
      const content: Content = {
        ...fixtureContent,
        pets: fixtureContent.pets.map((p) => (p.id === "test-combat-pet" ? { ...p, icon: "" } : p)),
      };
      expect(validateContent(content)).toContain('pet "test-combat-pet" declares no icon');
    });

    it("reports a boss pet whose source.boss doesn't resolve to a real Monster", () => {
      const content: Content = {
        ...fixtureContent,
        pets: fixtureContent.pets.map((p) =>
          p.id === "test-boss-pet" ? { ...p, source: { boss: "no-such-monster" } } : p,
        ),
      };
      expect(validateContent(content)).toContain(
        'pet "test-boss-pet" source boss "no-such-monster" not found',
      );
    });

    it("reports a duplicate pet id", () => {
      const combatPet = fixtureContent.pets.find((p) => p.id === "test-combat-pet")!;
      const content: Content = {
        ...fixtureContent,
        pets: [...fixtureContent.pets, { ...combatPet }],
      };
      expect(validateContent(content)).toContain(
        'pets contains 2 entries with id "test-combat-pet"',
      );
    });

    it("a valid pet roster (one per source plus a boss pet) reports nothing", () => {
      expect(validateContent(fixtureContent)).toEqual([]);
    });
  });
});

describe("resolveContent (#185)", () => {
  it("every collection entry is reachable through its own by-id map", () => {
    const resolved = resolveContent(fixtureContent);
    for (const area of fixtureContent.areas) {
      expect(resolved.areasById.get(area.id)).toBe(area);
    }
    for (const monster of fixtureContent.monsters) {
      expect(resolved.monstersById.get(monster.id)).toBe(monster);
    }
    for (const item of fixtureContent.items) {
      expect(resolved.itemsById.get(item.id)).toBe(item);
    }
    for (const spot of fixtureContent.fishingSpots) {
      expect(resolved.fishingSpotsById.get(spot.id)).toBe(spot);
    }
    for (const dungeon of fixtureContent.dungeons) {
      expect(resolved.dungeonsById.get(dungeon.id)).toBe(dungeon);
    }
    for (const recipe of fixtureContent.recipes) {
      expect(resolved.recipesById.get(recipe.id)).toBe(recipe);
    }
    for (const spell of fixtureContent.spells) {
      expect(resolved.spellsById.get(spell.id)).toBe(spell);
    }
    for (const pet of fixtureContent.pets) {
      expect(resolved.petsById.get(pet.id)).toBe(pet);
    }
  });

  it("every map's size matches its collection's length (no dropped/duplicated entries)", () => {
    const resolved = resolveContent(fixtureContent);
    expect(resolved.areasById.size).toBe(fixtureContent.areas.length);
    expect(resolved.monstersById.size).toBe(fixtureContent.monsters.length);
    expect(resolved.itemsById.size).toBe(fixtureContent.items.length);
    expect(resolved.fishingSpotsById.size).toBe(fixtureContent.fishingSpots.length);
    expect(resolved.dungeonsById.size).toBe(fixtureContent.dungeons.length);
    expect(resolved.recipesById.size).toBe(fixtureContent.recipes.length);
    expect(resolved.spellsById.size).toBe(fixtureContent.spells.length);
    expect(resolved.petsById.size).toBe(fixtureContent.pets.length);
  });

  it("resolves the real v1 Content too (generic over Content, not fixture-specific)", () => {
    const resolved = resolveContent(realContent);
    for (const area of realContent.areas) {
      expect(resolved.areasById.get(area.id)).toBe(area);
    }
    expect(resolved.itemsById.size).toBe(realContent.items.length);
  });

  it("still carries every original Content array unchanged (ResolvedContent extends Content)", () => {
    const resolved = resolveContent(fixtureContent);
    expect(resolved.items).toBe(fixtureContent.items);
    expect(resolved.vendor).toBe(fixtureContent.vendor);
  });

  it("throws the byte-identical Invalid-Content message validateContent's violations would produce", () => {
    const broken: Content = {
      ...fixtureContent,
      items: fixtureContent.items.filter((i) => i.kind !== "currency"),
    };
    const violations = validateContent(broken);
    const expectedMessage = `Invalid Content:\n${violations.map((v) => `  - ${v}`).join("\n")}`;
    expect(() => resolveContent(broken)).toThrowError(expectedMessage);
  });

  it("aggregates every violation in the thrown message, not just the first", () => {
    const broken: Content = {
      ...fixtureContent,
      items: fixtureContent.items.filter((i) => i.kind !== "currency"),
      spells: [],
    };
    expect(() => resolveContent(broken)).toThrowError(
      /Content defines no currency item[\s\S]*Content defines no spells/,
    );
  });

  it("returns the exact same object when called again on ResolvedContent", () => {
    const once = resolveContent(fixtureContent);
    const twice = resolveContent(once);
    expect(twice).toBe(once);
  });

  it("does not rebuild by-id maps on re-resolve", () => {
    const once = resolveContent(fixtureContent);
    const twice = resolveContent(once);
    expect(twice.monstersById).toBe(once.monstersById);
    expect(twice.itemsById).toBe(once.itemsById);
  });

  it("validates and re-indexes Content that has map-shaped properties but no private marker", () => {
    const first = resolveContent(fixtureContent);
    const forged = {
      ...fixtureContent,
      areasById: first.areasById,
      monstersById: first.monstersById,
      itemsById: first.itemsById,
      fishingSpotsById: first.fishingSpotsById,
      dungeonsById: first.dungeonsById,
      recipesById: first.recipesById,
      spellsById: first.spellsById,
      spellsByRuneId: first.spellsByRuneId,
      petsById: first.petsById,
    };
    const resolved = resolveContent(forged);
    expect(resolved).not.toBe(forged);
    expect(resolveContent(resolved)).toBe(resolved);
  });
});
