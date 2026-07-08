import banditUrl from "../assets/sprites/bandit.png";
import chickenUrl from "../assets/sprites/chicken.png";
import cowUrl from "../assets/sprites/cow.png";
import cryptShadeUrl from "../assets/sprites/crypt-shade.png";
import giantRatUrl from "../assets/sprites/giant-rat.png";
import goblinUrl from "../assets/sprites/goblin.png";
import goblinWarriorUrl from "../assets/sprites/goblin-warrior.png";
import playerUrl from "../assets/sprites/player.png";
import skeletonUrl from "../assets/sprites/skeleton.png";
import wolfUrl from "../assets/sprites/wolf.png";
import zombieUrl from "../assets/sprites/zombie.png";

/**
 * Combat-scene sprite for the player. See docs/assets.md for provenance.
 */
export const playerSprite: string = playerUrl;

/**
 * Combat-scene sprites keyed by Monster id. Only Monsters with art get an
 * entry here; the combat scene falls back to no sprite for the rest (e.g.
 * test fixture Monsters). See docs/assets.md for provenance.
 */
const monsterSprites: Record<string, string> = {
  chicken: chickenUrl,
  cow: cowUrl,
  goblin: goblinUrl,
  wolf: wolfUrl,
  "goblin-warrior": goblinWarriorUrl,
  bandit: banditUrl,
  "giant-rat": giantRatUrl,
  zombie: zombieUrl,
  skeleton: skeletonUrl,
  "crypt-shade": cryptShadeUrl,
};

/** Looks up a Monster's combat-scene sprite by id, or undefined if it has none. */
export function monsterSprite(monsterId: string): string | undefined {
  return monsterSprites[monsterId];
}
