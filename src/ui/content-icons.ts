import type { Content } from "../core/types";
import { registeredIconKeys } from "./icons";

/** UI-owned completeness check (#323): every `ItemDef.icon` and `PetDef.icon` in Content must
 * resolve through the bundled `icons.ts` registry. Core `validateContent` only requires non-empty
 * keys — registry membership is a UI/assets fact and stays out of `resolveContent`. */
export function assertRegisteredContentIcons(content: Pick<Content, "items" | "pets">): void {
  const registered = new Set(registeredIconKeys());
  const violations: string[] = [];

  for (const item of content.items) {
    if (!registered.has(item.icon)) {
      violations.push(`item "${item.id}" declares icon "${item.icon}" not in registry`);
    }
  }

  for (const pet of content.pets) {
    if (!registered.has(pet.icon)) {
      violations.push(`pet "${pet.id}" declares icon "${pet.icon}" not in registry`);
    }
  }

  if (violations.length === 0) return;

  throw new Error(
    `Invalid Content icon registry:\n${violations.map((line) => `  - ${line}`).join("\n")}`,
  );
}
