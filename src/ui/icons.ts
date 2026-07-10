import apprenticeStaffUrl from "../assets/icons/apprentice-staff.png";
import bronzeBarUrl from "../assets/icons/bronze-bar.png";
import bronzeDaggerUrl from "../assets/icons/bronze-dagger.png";
import bronzeShieldUrl from "../assets/icons/bronze-shield.png";
import bronzeSwordUrl from "../assets/icons/bronze-sword.png";
import cookedMeatUrl from "../assets/icons/cooked-meat.png";
import cookedPikeUrl from "../assets/icons/cooked-pike.png";
import cookedShrimpUrl from "../assets/icons/cooked-shrimp.png";
import cookedTroutUrl from "../assets/icons/cooked-trout.png";
import goblinCharmUrl from "../assets/icons/goblin-charm.png";
import goldUrl from "../assets/icons/gold.png";
import ironBarUrl from "../assets/icons/iron-bar.png";
import ironChainbodyUrl from "../assets/icons/iron-chainbody.png";
import ironDaggerUrl from "../assets/icons/iron-dagger.png";
import ironFullHelmUrl from "../assets/icons/iron-full-helm.png";
import ironKiteshieldUrl from "../assets/icons/iron-kiteshield.png";
import ironShortbowUrl from "../assets/icons/iron-shortbow.png";
import ironStaffUrl from "../assets/icons/iron-staff.png";
import leatherBodyUrl from "../assets/icons/leather-body.png";
import mithrilChainbodyUrl from "../assets/icons/mithril-chainbody.png";
import mithrilDaggerUrl from "../assets/icons/mithril-dagger.png";
import mithrilFullHelmUrl from "../assets/icons/mithril-full-helm.png";
import mithrilKiteshieldUrl from "../assets/icons/mithril-kiteshield.png";
import mithrilShortbowUrl from "../assets/icons/mithril-shortbow.png";
import mithrilStaffUrl from "../assets/icons/mithril-staff.png";
import shadeBladeUrl from "../assets/icons/shade-blade.png";
import shortbowUrl from "../assets/icons/shortbow.png";
import steelChainbodyUrl from "../assets/icons/steel-chainbody.png";
import steelDaggerUrl from "../assets/icons/steel-dagger.png";
import steelFullHelmUrl from "../assets/icons/steel-full-helm.png";
import steelKiteshieldUrl from "../assets/icons/steel-kiteshield.png";
import steelShortbowUrl from "../assets/icons/steel-shortbow.png";
import steelStaffUrl from "../assets/icons/steel-staff.png";

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
