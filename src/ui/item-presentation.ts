import { UNARMED_SPEED } from "../core/engine";
import { ATTACK_TYPES } from "../core/types";
import type { AmmoDef, AttackType, EquipmentDef, PotionDef, SkillName } from "../core/types";
import type { Snapshot } from "../core/types";
import type { ResolvedContent } from "../core/validate-content";
import { formatQty } from "./format";
import { itemIcon } from "./icons";
import { formatLevelReqDetailLine } from "./level-req";

/** Abbreviated Attack Type labels for the compact defence-vector readout (#99). */
const ATTACK_TYPE_ABBR: Record<AttackType, string> = {
  stab: "st",
  slash: "sl",
  crush: "cr",
  ranged: "rn",
  magic: "mg",
};

export interface ItemPresentation {
  name(itemId: string): string;
  sellPrice(itemId: string): number | undefined;
  detailLines(itemId: string, skills?: Snapshot["player"]["skills"]): readonly string[];
  iconMarkup(itemId: string): string;
  tileMarkup(itemId: string, qty: number): string;
}

function defVectorLabel(def: Record<AttackType, number>): string {
  return ATTACK_TYPES.map((t) => `${ATTACK_TYPE_ABBR[t]} ${def[t]}`).join(" · ");
}

function potionTargetLabel(target: PotionDef["target"]): string {
  if (target === "fishing-speed") return "Fishing speed";
  if (target === "production-speed") return "Production speed";
  return target.charAt(0).toUpperCase() + target.slice(1);
}

function potionActionNoun(target: PotionDef["target"]): string {
  if (target === "fishing-speed") return "catches";
  if (target === "production-speed") return "crafts";
  return "attacks";
}

function potionDetailLines(def: PotionDef): string[] {
  const pct = Math.round(def.boostPct * 100);
  const lines = [
    `+${pct}% ${potionTargetLabel(def.target)} for ${def.charges} ${potionActionNoun(def.target)}`,
  ];
  if (def.value !== undefined) lines.push(`Worth ${def.value}g`);
  return lines;
}

function ammoDetailLines(def: AmmoDef): string[] {
  const lines =
    def.ammoType === "arrow" ? [`+${def.rangedStr ?? 0} ranged str`] : [`Element: ${def.element}`];
  if (def.value !== undefined) lines.push(`Worth ${def.value}g`);
  return lines;
}

function equipmentStatParts(def: EquipmentDef): string[] {
  const parts: string[] = [];
  if (def.slot === "weapon" && def.attackType) parts.push(def.attackType);
  if (def.atkBonus) parts.push(`+${def.atkBonus} atk`);
  if (def.strBonus) parts.push(`+${def.strBonus} str`);
  if (def.rangedStr) parts.push(`+${def.rangedStr} ranged str`);
  if (def.magicDamage) parts.push(`+${def.magicDamage}% magic dmg`);
  parts.push(defVectorLabel(def.def));
  if (def.slot === "weapon") parts.push(`spd ${def.attackSpeed ?? UNARMED_SPEED}t`);
  return parts;
}

function appendLevelReqLine(
  lines: string[],
  levelReq: Partial<Record<SkillName, number>> | undefined,
  skills?: Snapshot["player"]["skills"],
): void {
  if (!levelReq) return;
  lines.push(formatLevelReqDetailLine(levelReq, skills));
}

export function createItemPresentation(content: ResolvedContent): ItemPresentation {
  function name(itemId: string): string {
    return content.itemsById.get(itemId)?.name ?? itemId;
  }

  function sellPrice(itemId: string): number | undefined {
    const def = content.itemsById.get(itemId);
    return def && def.kind !== "currency" ? def.value : undefined;
  }

  function detailLines(itemId: string, skills?: Snapshot["player"]["skills"]): readonly string[] {
    const def = content.itemsById.get(itemId);
    if (!def) return [];
    switch (def.kind) {
      case "equipment": {
        const lines = [equipmentStatParts(def).join(" ")];
        appendLevelReqLine(lines, def.levelReq, skills);
        return lines;
      }
      case "food": {
        const lines = [`Heals ${def.heals}`];
        if (def.value !== undefined) lines.push(`Worth ${def.value}g`);
        return lines;
      }
      case "material":
        return def.value !== undefined ? [`Worth ${def.value}g`] : [];
      case "currency":
        return [];
      case "potion":
        return potionDetailLines(def);
      case "ammo": {
        const lines = ammoDetailLines(def);
        appendLevelReqLine(lines, def.levelReq, skills);
        return lines;
      }
    }
  }

  function iconMarkup(itemId: string): string {
    const def = content.itemsById.get(itemId);
    const src = def ? itemIcon(def.icon) : "";
    return `<img class="icon pixel" src="${src}" alt="${name(itemId)}" />`;
  }

  function tileMarkup(itemId: string, qty: number): string {
    return `${iconMarkup(itemId)}<span class="tile-qty">×${formatQty(qty)}</span>`;
  }

  return { name, sellPrice, detailLines, iconMarkup, tileMarkup };
}
