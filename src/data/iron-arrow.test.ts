import { describe, expect, it } from "vitest";
import { effectiveLevel, maxHit } from "../core/combat";
import { createEngine } from "../core/engine";
import { seededRng } from "../core/rng";
import { fixtureContent } from "../core/testing/fixture-content";
import { makeSnapshot } from "../core/testing/make-snapshot";
import { xpForLevel } from "../core/xp";
import { validateContent } from "../core/validate-content";
import type { AmmoDef, Content, EquipmentDef } from "../core/types";
import { itemIcon } from "../ui/icons";
import { content } from "./index";
import { GEAR_TIERS, TIER_REQ_LEVEL } from "./tier-ladder";

const controlDummy = fixtureContent.monsters.find((m) => m.id === "control-dummy")!;
const contentWithControlDummy: Content = {
  ...content,
  monsters: [...content.monsters, controlDummy],
};

/**
 * Wave A arrow ladder (#365): iron-arrow fills the missing iron tier between bronze-arrow and
 * steel-arrow so iron-shortbow (Ranged 5) has ammo at the same wear level.
 */
describe("iron-arrow (#365)", () => {
  it("exists exactly as specified, appended at the end of content.items with every pre-existing id unchanged", () => {
    const ironArrow = content.items.find((i) => i.id === "iron-arrow");
    expect(ironArrow).toMatchObject({
      kind: "ammo",
      id: "iron-arrow",
      name: "Iron Arrow",
      icon: "iron-arrow",
      ammoType: "arrow",
      rangedStr: 4,
      levelReq: { ranged: 5 },
      value: 1,
    });
    expect(ironArrow).not.toHaveProperty("element");
    expect(ironArrow).not.toHaveProperty("tier");

    const ids = content.items.map((i) => i.id);
    expect(ids[ids.length - 1]).toBe("iron-arrow");
    expect(ids[ids.length - 2]).toBe("fire-blast-rune");
  });

  it("passes validateContent (declares rangedStr, declares no element)", () => {
    expect(validateContent(content)).toEqual([]);
  });

  it("assignLoadoutSlot quiver throws at Ranged 4 and succeeds at Ranged 5", () => {
    const now = () => 1_000_000;
    const atFour = createEngine(
      content,
      seededRng(1),
      makeSnapshot({
        bank: { items: [{ itemId: "iron-arrow", qty: 5 }] },
        player: { skills: { ranged: { level: 4, xp: xpForLevel(4) } } },
      }),
      now,
    );
    const before = atFour.snapshot();
    expect(() => atFour.assignLoadoutSlot("quiver", "iron-arrow")).toThrow(
      /ranged level too low: need 5/,
    );
    expect(atFour.snapshot()).toEqual(before);

    const atFive = createEngine(
      content,
      seededRng(1),
      makeSnapshot({
        bank: { items: [{ itemId: "iron-arrow", qty: 5 }] },
        player: { skills: { ranged: { level: 5, xp: xpForLevel(5) } } },
      }),
    );
    atFive.assignLoadoutSlot("quiver", "iron-arrow");
    expect(atFive.snapshot().player.quiver).toEqual({ itemId: "iron-arrow", qty: 5 });
  });

  it("with iron-arrow loaded, ranged max hit is maxHit(effectiveRanged, gearBonus(rangedStr) + 4)", () => {
    const rangedLevel = 50;
    const bow = content.items.find((i) => i.id === "iron-shortbow" && i.kind === "equipment")!;
    const bowRangedStr = bow.kind === "equipment" ? (bow.rangedStr ?? 0) : 0;

    const engine = createEngine(
      contentWithControlDummy,
      seededRng(42),
      makeSnapshot({
        player: {
          combatStyle: "accurate",
          skills: {
            ranged: { level: rangedLevel, xp: xpForLevel(rangedLevel) },
            hitpoints: { level: 40, xp: xpForLevel(40) },
          },
          equipment: { weapon: "iron-shortbow" },
          quiver: { itemId: "iron-arrow", qty: 100_000 },
        },
      }),
    );
    engine.selectMonster("control-dummy");
    let max = 0;
    engine.on("attack", (e) => {
      if (e.actor === "player") max = Math.max(max, e.damage);
    });
    for (let i = 0; i < 2000; i++) engine.tick();

    const eff = Math.floor(effectiveLevel(rangedLevel, "ranged", "accurate", "ranged") * 1);
    const expected = maxHit(eff, bowRangedStr + 4);
    expect(max).toBe(expected);
  });

  it("arrow ladder rangedStr and levelReq climb monotonically bronze → rune with every GEAR_TIERS entry matched", () => {
    const arrows: AmmoDef[] = GEAR_TIERS.map((tier) => {
      const id = `${tier}-arrow`;
      const arrow = content.items.find((i) => i.id === id);
      expect(arrow?.kind).toBe("ammo");
      return arrow as AmmoDef;
    });

    for (let i = 1; i < arrows.length; i++) {
      const prev = arrows[i - 1]!;
      const curr = arrows[i]!;
      expect(curr.rangedStr, "rangedStr").toBeGreaterThan(prev.rangedStr!);
      expect(curr.levelReq!.ranged, "levelReq.ranged").toBeGreaterThan(prev.levelReq!.ranged!);
    }
  });

  it("every bow tier has an arrow at or below its own Ranged requirement", () => {
    for (const tier of GEAR_TIERS) {
      const bowId = tier === "bronze" ? "shortbow" : `${tier}-shortbow`;
      const arrowId = `${tier}-arrow`;
      const bowItem = content.items.find((i) => i.id === bowId);
      const arrowItem = content.items.find((i) => i.id === arrowId);
      expect(bowItem?.kind).toBe("equipment");
      expect(arrowItem?.kind).toBe("ammo");
      const bow = bowItem as EquipmentDef;
      const arrow = arrowItem as AmmoDef;
      const bowReq = bow.levelReq!.ranged!;
      const arrowReq = arrow.levelReq!.ranged!;
      expect(arrowReq, `${arrowId} vs ${bowId}`).toBeLessThanOrEqual(bowReq);
      expect(bowReq, `${bowId} wear req`).toBe(TIER_REQ_LEVEL[tier]);
    }
  });

  it("is vendor-purchasable", () => {
    const entry = content.vendor.find((v) => v.itemId === "iron-arrow");
    expect(entry).toBeDefined();
    expect(entry!.price).toBeGreaterThan(0);
  });

  it("itemIcon resolves (#360 registered it)", () => {
    expect(() => itemIcon("iron-arrow")).not.toThrow();
    expect(itemIcon("iron-arrow")).toEqual(expect.any(String));
    expect(itemIcon("iron-arrow").length).toBeGreaterThan(0);
  });
});
