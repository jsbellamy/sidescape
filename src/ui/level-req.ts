import { SKILL_NAMES, type SkillName, type Snapshot } from "../core/types";

export type SkillsSlice = Snapshot["player"]["skills"];

/** Stable SKILL_NAMES order — the only iteration order for `levelReq` display and gating. */
export function levelReqEntries(
  levelReq: Partial<Record<SkillName, number>>,
): { skill: SkillName; need: number }[] {
  const entries: { skill: SkillName; need: number }[] = [];
  for (const skill of SKILL_NAMES) {
    const need = levelReq[skill];
    if (need !== undefined) entries.push({ skill, need });
  }
  return entries;
}

/** First unmet wear requirement, mirroring the Engine's `checkLevelReq` loop order. */
export function unmetRequirement(
  def: { levelReq?: Partial<Record<SkillName, number>> },
  skills: SkillsSlice,
): { skill: SkillName; need: number } | undefined {
  return levelReqEntries(def.levelReq ?? {}).find(({ skill, need }) => skills[skill].level < need);
}

function skillReqLabel(skill: SkillName): string {
  return skill[0]!.toUpperCase() + skill.slice(1);
}

/** Player-facing requirement line for item detail/tooltip strips. */
export function formatLevelReqDetailLine(
  levelReq: Partial<Record<SkillName, number>>,
  skills?: SkillsSlice,
): string {
  const clauses = levelReqEntries(levelReq).map(({ skill, need }) => {
    const label = `${skillReqLabel(skill)} ${need}`;
    if (skills !== undefined && skills[skill].level < need) {
      return `<span class="req-unmet">${label}</span>`;
    }
    return label;
  });
  return `Requires: ${clauses.join(" · ")}`;
}
