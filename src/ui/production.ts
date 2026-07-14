import type { Content, SkillName, Snapshot } from "../core/types";

/** One Production Skill — a Recipe-driven Skill trained by crafting (see CONTEXT.md). Smithing
 * (#28/#113), Cooking (#115), Crafting (#116), and Herblore (#118) each get exactly one row here:
 * one management panel, one activity prop, one scene label. Adding a fifth Production Skill is
 * one row, not new renderer code. `panelId` (a per-skill recipe-list element id) was retired by
 * #209: the Workshop destination now shows one shared scrollable recipe list (`#workshop-recipes`
 * in app.ts) for whichever Skill is selected, rather than four permanently-stacked lists. */
export interface ProductionSkillDescriptor {
  skill: "smithing" | "cooking" | "crafting" | "herblore";
  label: string; // scene label, e.g. "🔨 Smithing"
  prop: string; // prop-<key> CSS class suffix, e.g. "anvil"
}

export const PRODUCTION_SKILLS: readonly ProductionSkillDescriptor[] = [
  { skill: "smithing", label: "🔨 Smithing", prop: "anvil" },
  { skill: "cooking", label: "🍳 Cooking", prop: "cooking" },
  { skill: "crafting", label: "🧵 Crafting", prop: "crafting" },
  { skill: "herblore", label: "🧪 Herblore", prop: "cauldron" },
];

/** One of the four Production Skills, derived from `PRODUCTION_SKILLS` itself (#209) rather than a
 * hand-duplicated union — widening the descriptor table automatically widens this type too. Drives
 * the Workshop destination's session-only `selectedProductionSkill` selection in app.ts. */
export type ProductionSkill = (typeof PRODUCTION_SKILLS)[number]["skill"];

/**
 * Fixed near-scene overlay registry (#141): which activity paints environmental artwork beside the
 * separately-rendered player, and which
 * one. A prop follows the ACTIVITY (unlike the backdrop Theme, which follows the AREA — see
 * theme.ts), keyed off `production.skill` since #113 made production multi-skill — descriptor-
 * backed (#181) rather than hand-listing each Skill: Smithing gets its anvil, Cooking (#115) gets
 * a range/campfire, Crafting (#116) gets a workbench/tanning rack, Herblore (#118) gets a
 * cauldron. Fishing has its one reusable planted-rod/ripple overlay. Combat needs no overlay (the
 * Monster is its foreground focus).
 *
 * Returns a `prop-<key>` CSS class suffix (see styles.css), or null for "no prop this activity".
 */
export function resolveProp(snap: Snapshot): string | null {
  const skill = snap.production?.skill;
  return (
    PRODUCTION_SKILLS.find((d) => d.skill === skill)?.prop ?? (snap.fishing ? "fishing" : null)
  );
}

/** Replaces the `renderScene` emoji ternary: the production scene label for `skill`, or the raw
 * skill string for anything outside the four Production Skills (descriptor-backed, #181). */
export function productionLabel(skill: SkillName): string {
  return PRODUCTION_SKILLS.find((d) => d.skill === skill)?.label ?? skill;
}

/** Pure markup for one Production Skill panel's recipe list (#181): filters `content.recipes` to
 * `descriptor.skill`, one `<li>` per Recipe with its inputs (owned quantities from `bankItems`),
 * level gate, and a Craft button disabled while under-leveled or short on inputs. Byte-identical
 * to what `renderSmithing`/`renderCooking`/`renderCrafting`/`renderHerblore` each built by hand
 * before this module unified them. */
export function productionPanelMarkup(
  descriptor: ProductionSkillDescriptor,
  content: Content,
  bankItems: Snapshot["bank"]["items"],
  level: number,
): string {
  const owned = (itemId: string) => bankItems.find((s) => s.itemId === itemId)?.qty ?? 0;
  const itemName = (itemId: string) => content.items.find((i) => i.id === itemId)?.name ?? itemId;

  return content.recipes
    .filter((recipe) => recipe.skill === descriptor.skill)
    .map((recipe) => {
      const inputsLine = recipe.inputs
        .map((input) => `${input.qty}× ${itemName(input.itemId)} (have ${owned(input.itemId)})`)
        .join(", ");
      const underLeveled = level < recipe.levelReq;
      const shortOnInputs = recipe.inputs.some((input) => owned(input.itemId) < input.qty);
      const disabled = underLeveled || shortOnInputs;
      return `<li data-recipe-row="${recipe.id}">
                  <p class="recipe-name">${recipe.name} <span class="recipe-level">Lvl ${recipe.levelReq}</span></p>
                  <p class="recipe-inputs">${inputsLine}</p>
                  <button class="craft-btn" data-recipe="${recipe.id}" ${disabled ? "disabled" : ""}>Craft</button>
                </li>`;
    })
    .join("");
}
