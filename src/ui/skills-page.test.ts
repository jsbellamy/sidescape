// @vitest-environment happy-dom
/** Tests the mounted `createSkillsPageUi` interface (#328) — Skills rows, XP/progress, total level,
 * Pets summary/roster/popover session state, repeated render preservation, and disposal. Mounts a
 * minimal dedicated host with explicit player Snapshots, mirroring world-page.test.ts. */
import { describe, expect, it } from "vitest";
import { createEngine } from "../core/engine";
import { fixtureContent } from "../core/fixture-content";
import { makeSnapshot } from "../core/make-snapshot";
import { seededRng } from "../core/rng";
import type { Rng } from "../core/types";
import { SKILL_NAMES } from "../core/types";
import { xpForLevel } from "../core/xp";
import { resolveContent } from "../core/validate-content";
import { createSkillsPageUi } from "./skills-page";
import type { SkillsPageUi } from "./skills-page";

const content = resolveContent(fixtureContent);

function mountSkills(overrides?: Parameters<typeof makeSnapshot>[0], seed = 1) {
  const engine = overrides
    ? createEngine(fixtureContent, seededRng(seed), makeSnapshot(overrides))
    : createEngine(fixtureContent, seededRng(seed));
  const host = document.createElement("div");
  host.id = "skills-page-host";
  host.className = "skills-page-body";
  const ui: SkillsPageUi = createSkillsPageUi({ host, content });
  ui.render(engine.snapshot().player);
  return { engine, host, ui };
}

function sequenceRng(values: number[], fallback = 0): Rng {
  let index = 0;
  return { next: () => values[index++] ?? fallback };
}

function forcedDummyKillRng(): Rng {
  return sequenceRng([0, 0.999, 0.999, 0, 0.999, 0.999, 0, 0.999, 0]);
}

describe("XP progress bars", () => {
  it("shows a fill bar at 0% right at a level threshold", () => {
    const { host } = mountSkills({
      player: {
        hp: 10,
        maxHp: 10,
        skills: { hitpoints: { level: 10, xp: xpForLevel(10) } },
      },
    });

    const fill = host.querySelector<HTMLElement>('[data-skill="hitpoints"] .skill-bar-fill');
    expect(fill?.style.width).toBe("0%");
  });

  it("shows a fill bar approaching 100% just below the next level threshold", () => {
    const nextFloor = xpForLevel(11);
    const { host } = mountSkills({
      player: {
        hp: 10,
        maxHp: 10,
        skills: { hitpoints: { level: 10, xp: nextFloor - 1 } },
      },
    });

    const fill = host.querySelector<HTMLElement>('[data-skill="hitpoints"] .skill-bar-fill');
    expect(fill?.style.width).toBe("99%");
  });

  it("bar fill changes after the player Snapshot gains XP", () => {
    const { engine, host, ui } = mountSkills({}, 7);
    const before = host.querySelector<HTMLElement>('[data-skill="hitpoints"] .skill-bar-fill')
      ?.style.width;

    engine.selectMonster("dummy");
    for (let i = 0; i < 400; i++) engine.tick();
    ui.render(engine.snapshot().player);

    const after = host.querySelector<HTMLElement>('[data-skill="hitpoints"] .skill-bar-fill')?.style
      .width;
    expect(after).not.toBe(before);
  });
});

describe("Skills page (#222: replaces the Character card's abbreviation-chip xp-row)", () => {
  it("renders 12 rows: all 11 SKILL_NAMES in order via data-skill, then the Total row last", () => {
    const { host } = mountSkills();
    const rows = [...host.querySelectorAll<HTMLElement>("#skills-list .skill")];
    expect(rows).toHaveLength(12);
    expect(rows.map((c) => c.dataset["skill"])).toEqual([...SKILL_NAMES, undefined]);
    expect(rows[11]?.classList.contains("skill-total")).toBe(true);
  });

  it("gives every Skill row's icon a non-empty src, sized by the shared 34px .skill-icon chassis (#168)", () => {
    const { host } = mountSkills();
    const imgs = [
      ...host.querySelectorAll<HTMLImageElement>("#skills-list .skill[data-skill] img"),
    ];
    expect(imgs).toHaveLength(11);
    for (const img of imgs) {
      expect(img.getAttribute("src")).toBeTruthy();
      expect(img.classList.contains("skill-icon")).toBe(true);
    }
  });

  it("shows each row's Skill name alongside its level and XP-to-next", () => {
    const { host } = mountSkills();
    const attackRow = host.querySelector<HTMLElement>('#skills-list [data-skill="attack"]');
    expect(attackRow?.querySelector(".skill-name")?.textContent).toMatch(/^Attack/);
    expect(attackRow?.querySelector(".skill-level")?.textContent).toBe("1");
    expect(attackRow?.querySelector(".skill-xp-next")?.textContent).toMatch(/to next/i);
  });

  it("shows capitalized name, level, exact XP, and percent-to-next in a tooltip on the Skill cell (#135)", () => {
    const { host } = mountSkills({
      player: {
        hp: 10,
        maxHp: 10,
        skills: { attack: { level: 10, xp: xpForLevel(10) } },
      },
    });

    const attackSkill = host.querySelector<HTMLElement>('[data-skill="attack"]');
    expect(attackSkill?.title).toBe(`Attack: level 10 · ${xpForLevel(10)} xp · 0% to 11`);
  });

  it("shows the Total row as the sum of all 11 Skill levels, and updates it after a level-up Tick", () => {
    const { engine, host, ui } = mountSkills({
      player: {
        hp: 10,
        maxHp: 10,
        skills: { attack: { level: 1, xp: xpForLevel(2) - 1 } },
      },
    });

    const before = engine.snapshot().player.skills;
    const expectedBefore = SKILL_NAMES.reduce((sum, s) => sum + before[s].level, 0);
    const totalCell = host.querySelector<HTMLElement>("#skills-list .skill-total .skill-level");
    expect(totalCell?.textContent).toBe(String(expectedBefore));

    engine.selectMonster("dummy");
    for (let i = 0; i < 20; i++) engine.tick();
    ui.render(engine.snapshot().player);

    const after = engine.snapshot().player.skills;
    const expectedAfter = SKILL_NAMES.reduce((sum, s) => sum + after[s].level, 0);
    expect(after.attack.level).toBeGreaterThan(before.attack.level);
    expect(
      host.querySelector<HTMLElement>("#skills-list .skill-total .skill-level")?.textContent,
    ).toBe(String(expectedAfter));
    expect(expectedAfter).toBeGreaterThan(expectedBefore);
  });
});

describe("Pets summary and roster (#222, #120)", () => {
  it("shows a compact owned/total count, with the full roster grid behind its own popover", () => {
    const { host } = mountSkills();
    const count = host.querySelector<HTMLElement>("#pets-summary-count");
    expect(count?.textContent).toMatch(/^\d+\/\d+$/);
    expect(host.querySelector<HTMLElement>("#pets-popover")?.hidden).toBe(true);

    host.querySelector<HTMLButtonElement>('[data-nav="pets"]')?.click();
    expect(host.querySelector<HTMLElement>("#pets-popover")?.hidden).toBe(false);
    expect(host.querySelector("#pets-grid [data-pet]")).not.toBeNull();
  });

  it("toggles aria-expanded and closes the popover on a second click", () => {
    const { host } = mountSkills();
    const button = host.querySelector<HTMLButtonElement>('[data-nav="pets"]');
    expect(button?.getAttribute("aria-expanded")).toBe("false");

    button?.click();
    expect(button?.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector<HTMLElement>("#pets-popover")?.hidden).toBe(false);

    button?.click();
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector<HTMLElement>("#pets-popover")?.hidden).toBe(true);
  });

  it("preserves open Pets popover state across repeated renders", () => {
    const { engine, host, ui } = mountSkills();
    host.querySelector<HTMLButtonElement>('[data-nav="pets"]')?.click();
    expect(host.querySelector<HTMLElement>("#pets-popover")?.hidden).toBe(false);

    ui.render(engine.snapshot().player);
    ui.render(engine.snapshot().player);

    expect(host.querySelector<HTMLElement>("#pets-popover")?.hidden).toBe(false);
    expect(
      host.querySelector<HTMLButtonElement>('[data-nav="pets"]')?.getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("renders one tile per Content pet, owned pets lit and unobtained pets greyed via tile-unowned", () => {
    const { host } = mountSkills({ player: { ownedPets: ["test-combat-pet"] } });

    const grid = host.querySelector<HTMLElement>("#pets-grid");
    expect(grid?.classList.contains("tile-grid")).toBe(true);

    const tiles = [...grid!.querySelectorAll<HTMLElement>("[data-pet]")];
    expect(tiles.map((t) => t.dataset["pet"])).toEqual([
      "test-combat-pet",
      "test-fishing-pet",
      "test-production-pet",
      "test-boss-pet",
    ]);

    const owned = host.querySelector<HTMLElement>('[data-pet="test-combat-pet"]');
    expect(owned?.classList.contains("tile-unowned")).toBe(false);

    const unowned = host.querySelector<HTMLElement>('[data-pet="test-fishing-pet"]');
    expect(unowned?.classList.contains("tile-unowned")).toBe(true);
    expect(unowned?.querySelector("img.pixel")).not.toBeNull();
  });

  it("renders every pet greyed on a fresh save with no owned pets", () => {
    const { host } = mountSkills();
    const grid = host.querySelector<HTMLElement>("#pets-grid");
    const tiles = [...grid!.querySelectorAll<HTMLElement>("[data-pet]")];
    expect(tiles.every((t) => t.classList.contains("tile-unowned"))).toBe(true);
  });

  it("never shows a quantity badge on Pet tiles", () => {
    const { host } = mountSkills({ player: { ownedPets: ["test-combat-pet"] } });
    const tiles = [...host.querySelectorAll<HTMLElement>("#pets-grid [data-pet]")];
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.querySelector(".tile-qty")).toBeNull();
    }
  });

  it("lights up a newly-owned pet tile on the next render", () => {
    const engine = createEngine(fixtureContent, forcedDummyKillRng());
    const host = document.createElement("div");
    const ui = createSkillsPageUi({ host, content });
    ui.render(engine.snapshot().player);

    engine.selectMonster("dummy");
    for (let i = 0; i < 50; i++) {
      engine.tick();
      if (engine.snapshot().player.ownedPets.includes("test-combat-pet")) break;
    }
    ui.render(engine.snapshot().player);

    const tile = host.querySelector<HTMLElement>('[data-pet="test-combat-pet"]');
    expect(tile?.classList.contains("tile-unowned")).toBe(false);
  });
});

describe("Skills page disposal (#328)", () => {
  it("dispose() is idempotent and prevents later Pets summary clicks from toggling the popover", () => {
    const { host, ui } = mountSkills();
    ui.dispose();
    ui.dispose();

    const button = host.querySelector<HTMLButtonElement>('[data-nav="pets"]');
    button?.click();

    expect(host.querySelector<HTMLElement>("#pets-popover")?.hidden).toBe(true);
    expect(button?.getAttribute("aria-expanded")).toBe("false");
  });
});
