import airRuneUrl from "../assets/icons/air-rune.png";
import apprenticeStaffUrl from "../assets/icons/apprentice-staff.png";
import attackPotionUrl from "../assets/icons/attack-potion.png";
import bronzeArrowUrl from "../assets/icons/bronze-arrow.png";
import bronzeBarUrl from "../assets/icons/bronze-bar.png";
import bronzeDaggerUrl from "../assets/icons/bronze-dagger.png";
import bronzeMaceUrl from "../assets/icons/bronze-mace.png";
import bronzeShieldUrl from "../assets/icons/bronze-shield.png";
import bronzeSwordUrl from "../assets/icons/bronze-sword.png";
import cookedMeatUrl from "../assets/icons/cooked-meat.png";
import cookedPikeUrl from "../assets/icons/cooked-pike.png";
import cookedShrimpUrl from "../assets/icons/cooked-shrimp.png";
import cookedTroutUrl from "../assets/icons/cooked-trout.png";
import cowhideUrl from "../assets/icons/cowhide.png";
import earthRuneUrl from "../assets/icons/earth-rune.png";
import emeraldUrl from "../assets/icons/emerald.png";
import emeraldAmuletUrl from "../assets/icons/emerald-amulet.png";
import emeraldRingUrl from "../assets/icons/emerald-ring.png";
import fireRuneUrl from "../assets/icons/fire-rune.png";
import fishingFrogUrl from "../assets/icons/fishing-frog.png";
import fishingPotionUrl from "../assets/icons/fishing-potion.png";
import goblinCharmUrl from "../assets/icons/goblin-charm.png";
import goldUrl from "../assets/icons/gold.png";
import guamHerbUrl from "../assets/icons/guam-herb.png";
import harralanderHerbUrl from "../assets/icons/harralander-herb.png";
import hardLeatherBodyUrl from "../assets/icons/hard-leather-body.png";
import hardLeatherChapsUrl from "../assets/icons/hard-leather-chaps.png";
import hardLeatherCoifUrl from "../assets/icons/hard-leather-coif.png";
import ironBarUrl from "../assets/icons/iron-bar.png";
import ironChainbodyUrl from "../assets/icons/iron-chainbody.png";
import ironDaggerUrl from "../assets/icons/iron-dagger.png";
import ironFullHelmUrl from "../assets/icons/iron-full-helm.png";
import ironKiteshieldUrl from "../assets/icons/iron-kiteshield.png";
import ironMaceUrl from "../assets/icons/iron-mace.png";
import ironShortbowUrl from "../assets/icons/iron-shortbow.png";
import ironStaffUrl from "../assets/icons/iron-staff.png";
import ironSwordUrl from "../assets/icons/iron-sword.png";
import kilnCatUrl from "../assets/icons/kiln-cat.png";
import leatherBodyUrl from "../assets/icons/leather-body.png";
import leatherChapsUrl from "../assets/icons/leather-chaps.png";
import leatherCoifUrl from "../assets/icons/leather-coif.png";
import marrentillHerbUrl from "../assets/icons/marrentill-herb.png";
import mithrilArrowUrl from "../assets/icons/mithril-arrow.png";
import mithrilChainbodyUrl from "../assets/icons/mithril-chainbody.png";
import mithrilDaggerUrl from "../assets/icons/mithril-dagger.png";
import mithrilFullHelmUrl from "../assets/icons/mithril-full-helm.png";
import mithrilKiteshieldUrl from "../assets/icons/mithril-kiteshield.png";
import mithrilMaceUrl from "../assets/icons/mithril-mace.png";
import mithrilShortbowUrl from "../assets/icons/mithril-shortbow.png";
import mithrilStaffUrl from "../assets/icons/mithril-staff.png";
import mithrilSwordUrl from "../assets/icons/mithril-sword.png";
import productionPotionUrl from "../assets/icons/production-potion.png";
import rawBeefUrl from "../assets/icons/raw-beef.png";
import rawPikeUrl from "../assets/icons/raw-pike.png";
import rawShrimpUrl from "../assets/icons/raw-shrimp.png";
import rawTroutUrl from "../assets/icons/raw-trout.png";
import rockGolemUrl from "../assets/icons/rock-golem.png";
import rubyUrl from "../assets/icons/ruby.png";
import rubyAmuletUrl from "../assets/icons/ruby-amulet.png";
import rubyRingUrl from "../assets/icons/ruby-ring.png";
import sapphireUrl from "../assets/icons/sapphire.png";
import sapphireAmuletUrl from "../assets/icons/sapphire-amulet.png";
import sapphireRingUrl from "../assets/icons/sapphire-ring.png";
import shadeBladeUrl from "../assets/icons/shade-blade.png";
import shadeWispUrl from "../assets/icons/shade-wisp.png";
import shortbowUrl from "../assets/icons/shortbow.png";
import steelArrowUrl from "../assets/icons/steel-arrow.png";
import steelChainbodyUrl from "../assets/icons/steel-chainbody.png";
import steelDaggerUrl from "../assets/icons/steel-dagger.png";
import steelFullHelmUrl from "../assets/icons/steel-full-helm.png";
import steelKiteshieldUrl from "../assets/icons/steel-kiteshield.png";
import steelMaceUrl from "../assets/icons/steel-mace.png";
import steelShortbowUrl from "../assets/icons/steel-shortbow.png";
import steelStaffUrl from "../assets/icons/steel-staff.png";
import steelSwordUrl from "../assets/icons/steel-sword.png";
import strengthPotionUrl from "../assets/icons/strength-potion.png";
import tarrominHerbUrl from "../assets/icons/tarromin-herb.png";
import thickHideUrl from "../assets/icons/thick-hide.png";
import waterRuneUrl from "../assets/icons/water-rune.png";
import wolfHideUrl from "../assets/icons/wolf-hide.png";

// UI & Assets wave 1/8 (#131): Skill icons (SKILL_NAMES order) + workspace/navigation icons.
import skillAttackUrl from "../assets/icons/skill-attack.png";
import skillStrengthUrl from "../assets/icons/skill-strength.png";
import skillDefenceUrl from "../assets/icons/skill-defence.png";
import skillHitpointsUrl from "../assets/icons/skill-hitpoints.png";
import skillFishingUrl from "../assets/icons/skill-fishing.png";
import skillSmithingUrl from "../assets/icons/skill-smithing.png";
import skillRangedUrl from "../assets/icons/skill-ranged.png";
import skillMagicUrl from "../assets/icons/skill-magic.png";
import skillCookingUrl from "../assets/icons/skill-cooking.png";
import skillCraftingUrl from "../assets/icons/skill-crafting.png";
import skillHerbloreUrl from "../assets/icons/skill-herblore.png";
import tabWorldUrl from "../assets/icons/tab-world.png";
import tabSkillsUrl from "../assets/icons/tab-skills.png";
import tabCharacterUrl from "../assets/icons/tab-character.png";
import tabBankUrl from "../assets/icons/tab-bank.png";
import tabVendorUrl from "../assets/icons/tab-vendor.png";
import tabLootUrl from "../assets/icons/tab-loot.png";
import type { SkillName } from "../core/types";

/**
 * Item-icon registry (#78), keyed by `ItemDef.icon` (a key, not a URL — Core never touches the
 * asset itself; see the doc on `EquipmentDef.icon`). Mirrors `sprites.ts`'s `monsterSprites`
 * shape/pattern. Every key that any `ItemDef` in `src/data/index.ts` declares must resolve here —
 * `icons.test.ts` in this directory asserts that completeness (Core's own `validateContent` only
 * checks that an item declares a non-empty icon string, since Core can't see this UI registry).
 */
const icons: Record<string, string> = {
  "apprentice-staff": apprenticeStaffUrl,
  "bronze-bar": bronzeBarUrl,
  "bronze-dagger": bronzeDaggerUrl,
  "bronze-shield": bronzeShieldUrl,
  "bronze-sword": bronzeSwordUrl,
  "cooked-meat": cookedMeatUrl,
  "cooked-pike": cookedPikeUrl,
  "cooked-shrimp": cookedShrimpUrl,
  "cooked-trout": cookedTroutUrl,
  "goblin-charm": goblinCharmUrl,
  gold: goldUrl,
  "iron-bar": ironBarUrl,
  "iron-chainbody": ironChainbodyUrl,
  "iron-dagger": ironDaggerUrl,
  "iron-full-helm": ironFullHelmUrl,
  "iron-kiteshield": ironKiteshieldUrl,
  "iron-shortbow": ironShortbowUrl,
  "iron-staff": ironStaffUrl,
  "leather-body": leatherBodyUrl,
  "mithril-chainbody": mithrilChainbodyUrl,
  "mithril-dagger": mithrilDaggerUrl,
  "mithril-full-helm": mithrilFullHelmUrl,
  "mithril-kiteshield": mithrilKiteshieldUrl,
  "mithril-shortbow": mithrilShortbowUrl,
  "mithril-staff": mithrilStaffUrl,
  "shade-blade": shadeBladeUrl,
  shortbow: shortbowUrl,
  "steel-chainbody": steelChainbodyUrl,
  "steel-dagger": steelDaggerUrl,
  "steel-full-helm": steelFullHelmUrl,
  "steel-kiteshield": steelKiteshieldUrl,
  "steel-shortbow": steelShortbowUrl,
  "steel-staff": steelStaffUrl,
  // Gap-fill maces/swords (Combat Depth #102): source-driven icons conformed from committed
  // golden-* sources via scripts/art/icons.mjs (see docs/assets.md), with deterministic tier ramps.
  "bronze-mace": bronzeMaceUrl,
  "iron-mace": ironMaceUrl,
  "iron-sword": ironSwordUrl,
  "steel-mace": steelMaceUrl,
  "steel-sword": steelSwordUrl,
  "mithril-mace": mithrilMaceUrl,
  "mithril-sword": mithrilSwordUrl,
  // Cooking wave (#115) raw catches: source-driven icons conformed from committed golden-* sources
  // via scripts/art/icons.mjs (see docs/assets.md).
  "raw-beef": rawBeefUrl,
  "raw-shrimp": rawShrimpUrl,
  "raw-trout": rawTroutUrl,
  "raw-pike": rawPikeUrl,
  // Crafting wave (#116) hides + leather/ranged armour: source-driven icons conformed from
  // committed golden-* sources via scripts/art/icons.mjs (see docs/assets.md).
  cowhide: cowhideUrl,
  "wolf-hide": wolfHideUrl,
  "thick-hide": thickHideUrl,
  "leather-chaps": leatherChapsUrl,
  "leather-coif": leatherCoifUrl,
  "hard-leather-body": hardLeatherBodyUrl,
  "hard-leather-chaps": hardLeatherChapsUrl,
  "hard-leather-coif": hardLeatherCoifUrl,
  // Crafting wave (#117) jewelry line: gems + amulet/ring Equipment, source-driven icons conformed
  // from committed golden-* sources via scripts/art/icons.mjs (see docs/assets.md).
  sapphire: sapphireUrl,
  emerald: emeraldUrl,
  ruby: rubyUrl,
  "sapphire-amulet": sapphireAmuletUrl,
  "sapphire-ring": sapphireRingUrl,
  "emerald-amulet": emeraldAmuletUrl,
  "emerald-ring": emeraldRingUrl,
  "ruby-amulet": rubyAmuletUrl,
  "ruby-ring": rubyRingUrl,
  // Herblore wave (#118): herb Materials + charge potions, source-driven icons conformed from
  // committed golden-* sources via scripts/art/icons.mjs (see docs/assets.md).
  "guam-herb": guamHerbUrl,
  "marrentill-herb": marrentillHerbUrl,
  "tarromin-herb": tarrominHerbUrl,
  "harralander-herb": harralanderHerbUrl,
  "strength-potion": strengthPotionUrl,
  "attack-potion": attackPotionUrl,
  "fishing-potion": fishingPotionUrl,
  "production-potion": productionPotionUrl,
  // Ammo wave (#119) arrow tiers + element runes: source-driven icons conformed from committed
  // golden-* sources via scripts/art/icons.mjs (see docs/assets.md).
  "bronze-arrow": bronzeArrowUrl,
  "steel-arrow": steelArrowUrl,
  "mithril-arrow": mithrilArrowUrl,
  "air-rune": airRuneUrl,
  "water-rune": waterRuneUrl,
  "earth-rune": earthRuneUrl,
  "fire-rune": fireRuneUrl,
  // Pets wave (#120) starter roster: source-driven icons conformed from committed golden-* sources
  // via scripts/art/icons.mjs (see docs/assets.md). Keyed by `PetDef.icon`, resolved through this
  // SAME registry as every `ItemDef.icon` — a pet isn't an Item, but its icon key is
  // validated/rendered exactly the same way.
  "rock-golem": rockGolemUrl,
  "fishing-frog": fishingFrogUrl,
  "kiln-cat": kilnCatUrl,
  "shade-wisp": shadeWispUrl,
};

/** Resolves an `ItemDef.icon` key to its imported asset URL. Throws on an unknown key rather than
 * falling back to a placeholder (#78's explicit "no placeholder/fallback branch in the UI" —
 * same discipline as a weapon's required attackSpeed): every key content declares is covered by
 * `icons.test.ts`, so hitting this at runtime means the registry and Content have drifted, which
 * should fail loud rather than silently render a broken image. */
export function itemIcon(key: string): string {
  const url = icons[key];
  if (!url) throw new Error(`icons.ts registry has no entry for icon key "${key}"`);
  return url;
}

/** Every key currently registered — used by `icons.test.ts` to assert every Content icon key
 * resolves, and available to any other completeness check that wants the full key set. */
export function registeredIconKeys(): string[] {
  return Object.keys(icons);
}

/** Skill-icon registry (#131), keyed by `SkillName` — separate from `icons` above because a
 * Skill isn't an `ItemDef.icon` key. Complete over `SKILL_NAMES`; same "throw on unknown key, no
 * placeholder/fallback branch" discipline as `itemIcon`. */
const skillIcons: Record<SkillName, string> = {
  attack: skillAttackUrl,
  strength: skillStrengthUrl,
  defence: skillDefenceUrl,
  hitpoints: skillHitpointsUrl,
  fishing: skillFishingUrl,
  smithing: skillSmithingUrl,
  ranged: skillRangedUrl,
  magic: skillMagicUrl,
  cooking: skillCookingUrl,
  crafting: skillCraftingUrl,
  herblore: skillHerbloreUrl,
};

/** Resolves a `SkillName` to its pixel-icon URL. Throws for an unknown key (same discipline as
 * `itemIcon`). */
export function skillIcon(skill: SkillName): string {
  const url = skillIcons[skill];
  if (!url) throw new Error(`icons.ts registry has no entry for skill icon "${skill}"`);
  return url;
}

/** Workspace/navigation icon registry (#131, widened by #206's two-card redesign), keyed by
 * destination/nav id. The four production views (smithing, cooking, crafting, herblore) reuse the
 * matching `skillIcon` rather than a duplicate `tab-*.png` — see the issue's own "do not draw
 * tab-*.png duplicates for them". `workshop` (the grouped Smithing/Cooking/Crafting/Herblore
 * destination) and `activity` (the grouped Loot Zone/Loot Feed destination) are new #206
 * destinations that reuse existing art — `tab-skills.png` and `tab-loot.png` respectively — rather
 * than commissioning new pixel art in this presentation-only slice; a later asset issue may give
 * them dedicated icons. */
const tabIcons: Record<string, string> = {
  world: tabWorldUrl,
  character: tabCharacterUrl,
  bank: tabBankUrl,
  vendor: tabVendorUrl,
  smithing: skillIcon("smithing"),
  cooking: skillIcon("cooking"),
  crafting: skillIcon("crafting"),
  herblore: skillIcon("herblore"),
  loot: tabLootUrl,
  workshop: tabSkillsUrl,
  activity: tabLootUrl,
  // #222: Skills gets its own Management destination but ships no new art this wave — stand-in
  // icon, reusing the Attack skill icon already in the sheet rather than 404ing on a missing key.
  skills: skillIcon("attack"),
};

/** Resolves a workspace/internal-tab id to its pixel-icon URL. Throws for an unknown key (same
 * discipline as `itemIcon`/`skillIcon`). */
export function tabIcon(tabId: string): string {
  const url = tabIcons[tabId];
  if (!url) throw new Error(`icons.ts registry has no entry for tab icon "${tabId}"`);
  return url;
}
