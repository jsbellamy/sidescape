import { describe, expect, it } from "vitest";
import { content } from "./index";

/** Combat Depth wave 4/4 (#102)'s armour re-stat: metal (chainbody/kiteshield/full-helm lines)
 * defends stab/slash/ranged well but is noticeably weaker vs crush and weak (low/negative) vs
 * magic; leather (leather-body) is the anti-caster choice — modest melee def, magic def that
 * beats every metal body's own tier. Tuning-flagged exact numbers; this test only asserts the
 * directional shape.
 *
 * Issue #251 retired two assertions from this file into src/data/tier-ladder.test.ts, where they
 * now hold by construction: "at each metal body tier, magic def is lower than stab def" (replaced
 * by the stronger "metal armour def.magic is strictly decreasing across tiers (0, -1, -2, -3)")
 * and "each metal body tier dominates the previous tier's def in stab/slash/crush/ranged". The
 * leather-beats-metal invariant below survives unchanged (leather-body's magic def 5 still beats
 * every metal body's, per the issue's own text). */

const METAL_BODY_IDS = ["iron-chainbody", "steel-chainbody", "mithril-chainbody"];

function equipment(id: string) {
  const item = content.items.find((i) => i.id === id);
  expect(item, `${id} not found in Content`).toBeDefined();
  expect(item!.kind).toBe("equipment");
  return item as Extract<(typeof content.items)[number], { kind: "equipment" }>;
}

describe("Armour directional rules (Combat Depth #102)", () => {
  it("leather-body's magic def beats every metal body's magic def", () => {
    const leather = equipment("leather-body");
    for (const id of METAL_BODY_IDS) {
      const body = equipment(id);
      expect(leather.def.magic, `leather-body vs ${id}`).toBeGreaterThan(body.def.magic);
    }
  });

  it("goblin-charm leans magic (small, but its highest def entry)", () => {
    const charm = equipment("goblin-charm");
    const values = { ...charm.def };
    const maxType = (Object.keys(values) as (keyof typeof values)[]).reduce((best, t) =>
      values[t] > values[best] ? t : best,
    );
    expect(maxType).toBe("magic");
  });
});
