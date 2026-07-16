/** The deep, mounted Skills Management destination (#328): owns the Skills destination host's shell,
 * skill rows, XP/progress, total level, Pets summary/popover/roster, and listener lifecycle. No
 * Engine commands — `render(player)` consumes only its argument plus resolved Content. */

import { SKILL_NAMES } from "../core/types";
import type { SkillName, SkillSnapshot, Snapshot } from "../core/types";
import type { ResolvedContent } from "../core/validate-content";
import { MAX_LEVEL, xpForLevel } from "../core/xp";
import { itemIcon, skillIcon } from "./icons";

export interface SkillsPageUi {
  render(player: Snapshot["player"]): void;
  dispose(): void;
}

export interface SkillsPageUiOptions {
  host: HTMLElement;
  content: ResolvedContent;
}

/** Fraction (0..1) of the way a Skill's XP is from its current level's threshold to the next
 * level's threshold. Skills at MAX_LEVEL have no next threshold, so the bar reads full. */
function skillProgress(skill: SkillSnapshot): number {
  if (skill.level >= MAX_LEVEL) return 1;
  const floor = xpForLevel(skill.level);
  const ceil = xpForLevel(skill.level + 1);
  return (skill.xp - floor) / (ceil - floor);
}

/** Tooltip text for one Skill cell in the icon grid (#135): capitalized name, level, floored xp,
 * and percent-to-next-level — MAX once a Skill hits `MAX_LEVEL`, since there is no next
 * threshold (mirrors `skillProgress`'s own MAX_LEVEL special case). */
function skillTooltip(skill: SkillName, s: SkillSnapshot): string {
  const label = skill[0]?.toUpperCase() + skill.slice(1);
  const xp = Math.floor(s.xp);
  if (s.level >= MAX_LEVEL) return `${label}: level ${s.level} · ${xp} xp · MAX`;
  const pct = Math.floor(skillProgress(s) * 100);
  return `${label}: level ${s.level} · ${xp} xp · ${pct}% to ${s.level + 1}`;
}

/** XP-remaining-to-next-level label for one Skill row (#222) — floored to a whole number, "MAX"
 * once a Skill hits `MAX_LEVEL` (mirrors `skillTooltip`'s own MAX_LEVEL special case, since
 * there's no next threshold to count down to). */
function xpToNextLabel(s: SkillSnapshot): string {
  if (s.level >= MAX_LEVEL) return "MAX";
  const remaining = Math.max(0, Math.ceil(xpForLevel(s.level + 1) - s.xp));
  return `${remaining} xp to next`;
}

function skillsShellMarkup(): string {
  return `<ul id="skills-list" class="card-scroll"></ul>
    <div class="card-fixed">
      <div id="pets-summary" class="pets-summary">
        <button data-nav="pets" title="Pets" aria-expanded="false">
          <span aria-hidden="true">🐾</span>
          <span id="pets-summary-count"></span>
        </button>
        <div id="pets-popover" class="pets-popover" hidden>
          <div id="pets-grid" class="tile-grid"></div>
        </div>
      </div>
    </div>`;
}

export function createSkillsPageUi(options: SkillsPageUiOptions): SkillsPageUi {
  const { host, content } = options;

  let openPetsPopover = false;
  let disposed = false;

  host.innerHTML = skillsShellMarkup();

  function el<T extends HTMLElement>(selector: string): T {
    return host.querySelector(selector) as T;
  }

  function syncPetsPopoverVisibility(): void {
    el<HTMLElement>("#pets-popover").hidden = !openPetsPopover;
    host
      .querySelector<HTMLButtonElement>('[data-nav="pets"]')
      ?.setAttribute("aria-expanded", String(openPetsPopover));
  }

  function renderSkills(skills: Snapshot["player"]["skills"]): void {
    const rows = SKILL_NAMES.map((skill) => {
      const s = skills[skill];
      const pct = Math.floor(skillProgress(s) * 100);
      const label = skill[0]?.toUpperCase() + skill.slice(1);
      return `<li class="skill" data-skill="${skill}" title="${skillTooltip(skill, s)}">
             <img class="skill-icon pixel" src="${skillIcon(skill)}" alt="" />
             <div class="skill-info">
               <p class="skill-name">${label} <span class="skill-level">${s.level}</span></p>
               <div class="skill-bar"><div class="skill-bar-fill" style="width: ${pct}%"></div></div>
               <p class="skill-xp-next">${xpToNextLabel(s)}</p>
             </div>
           </li>`;
    });
    const total = SKILL_NAMES.reduce((sum, skill) => sum + skills[skill].level, 0);
    rows.push(`<li class="skill skill-total" title="Total level">
             <span class="skill-total-label">Total</span>
             <span class="skill-level">${total}</span>
           </li>`);
    el("#skills-list").innerHTML = rows.join("");
  }

  function renderPets(ownedPets: string[]): void {
    const owned = new Set(ownedPets);
    el("#pets-summary-count").textContent = `${owned.size}/${content.pets.length}`;
    el("#pets-grid").innerHTML = content.pets
      .map((pet) => {
        const isOwned = owned.has(pet.id);
        return `<div class="tile${isOwned ? "" : " tile-unowned"}" data-pet="${pet.id}" title="${pet.name}">
                  <img class="icon pixel" src="${itemIcon(pet.icon)}" alt="${pet.name}" />
                </div>`;
      })
      .join("");
  }

  const onHostClick = (event: Event): void => {
    const navBtn = (event.target as HTMLElement).closest<HTMLElement>("[data-nav]");
    if (navBtn?.dataset["nav"] === "pets") {
      openPetsPopover = !openPetsPopover;
      syncPetsPopoverVisibility();
    }
  };

  host.addEventListener("click", onHostClick);

  return {
    render(player) {
      renderSkills(player.skills);
      renderPets(player.ownedPets);
      syncPetsPopoverVisibility();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      host.removeEventListener("click", onHostClick);
    },
  };
}
