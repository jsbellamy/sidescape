import banditUrl from "../assets/sprites/bandit.png";
import boneKnightUrl from "../assets/sprites/bone-knight.png";
import chickenUrl from "../assets/sprites/chicken.png";
import cowUrl from "../assets/sprites/cow.png";
import cryptGhoulUrl from "../assets/sprites/crypt-ghoul.png";
import cryptShadeUrl from "../assets/sprites/crypt-shade.png";
import frostGiantUrl from "../assets/sprites/frost-giant.png";
import frostWardenUrl from "../assets/sprites/frost-warden.png";
import frostWolfUrl from "../assets/sprites/frost-wolf.png";
import giantRatUrl from "../assets/sprites/giant-rat.png";
import goblinUrl from "../assets/sprites/goblin.png";
import goblinBruteUrl from "../assets/sprites/goblin-brute.png";
import goblinChiefUrl from "../assets/sprites/goblin-chief.png";
import goblinWarriorUrl from "../assets/sprites/goblin-warrior.png";
import hollowWardenUrl from "../assets/sprites/hollow-warden.png";
import iceWraithUrl from "../assets/sprites/ice-wraith.png";
import playerUrl from "../assets/sprites/player.png";
import sewerKingUrl from "../assets/sprites/sewer-king.png";
import skeletonUrl from "../assets/sprites/skeleton.png";
import wolfUrl from "../assets/sprites/wolf.png";
import zombieUrl from "../assets/sprites/zombie.png";

/**
 * Global display grain: every combat sprite renders at this integer multiple of its native canvas
 * (`image-rendering: pixelated`, so a non-integer scale would give visibly uneven pixels). Keeping
 * the grain uniform is what makes a 48-native hero and a 32-native mob read as one art style — the
 * hero is bigger because she has MORE pixels, not bigger ones. Make a boss loom by giving it a
 * bigger native canvas (see `sprites.mjs` — canvas size is explicit visual scale), never a bigger grain;
 * mixing grains in one frame is exactly what makes a sprite look like it came from another game.
 */
export const SPRITE_GRAIN = 2;

/** The px edge a sprite occupies on screen: its native canvas times the global grain. Square. */
export function spriteEdgePx(nativeSize: number): number {
  return nativeSize * SPRITE_GRAIN;
}

interface SpriteAsset {
  url: string;
  /** Native canvas edge in logical px — must match this id's `size` in `scripts/art/sprites.mjs`
   *  (guarded by sprites.test.ts). Drives the on-screen box via `spriteEdgePx`. */
  size: number;
}

/**
 * Combat-scene sprite for the player. See docs/assets.md for provenance.
 */
export const playerSprite: string = playerUrl;

/** The player's native canvas edge (48 — the ingested original-art hero, #264). */
export const playerSpriteSize = 48;

/**
 * Combat-scene sprites keyed by Monster id. Only Monsters with art get an
 * entry here; the combat scene falls back to no sprite for the rest (e.g.
 * test fixture Monsters). See docs/assets.md for provenance.
 */
const monsterSprites: Record<string, SpriteAsset> = {
  chicken: { url: chickenUrl, size: 32 },
  cow: { url: cowUrl, size: 48 },
  goblin: { url: goblinUrl, size: 32 },
  "goblin-brute": { url: goblinBruteUrl, size: 48 },
  "goblin-chief": { url: goblinChiefUrl, size: 48 },
  wolf: { url: wolfUrl, size: 32 },
  "goblin-warrior": { url: goblinWarriorUrl, size: 32 },
  bandit: { url: banditUrl, size: 48 },
  "hollow-warden": { url: hollowWardenUrl, size: 64 },
  "giant-rat": { url: giantRatUrl, size: 32 },
  zombie: { url: zombieUrl, size: 48 },
  skeleton: { url: skeletonUrl, size: 48 },
  "sewer-king": { url: sewerKingUrl, size: 48 },
  "crypt-shade": { url: cryptShadeUrl, size: 64 },
  "crypt-ghoul": { url: cryptGhoulUrl, size: 48 },
  "bone-knight": { url: boneKnightUrl, size: 48 },
  "frost-wolf": { url: frostWolfUrl, size: 32 },
  "ice-wraith": { url: iceWraithUrl, size: 32 },
  "frost-giant": { url: frostGiantUrl, size: 32 },
  "frost-warden": { url: frostWardenUrl, size: 48 },
};

/** Looks up a Monster's combat-scene sprite by id, or undefined if it has none. */
export function monsterSprite(monsterId: string): string | undefined {
  return monsterSprites[monsterId]?.url;
}

/** Native canvas edge of a Monster's sprite, or undefined if it has none. */
export function monsterSpriteSize(monsterId: string): number | undefined {
  return monsterSprites[monsterId]?.size;
}
