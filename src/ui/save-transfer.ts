import type { Snapshot } from "../core/types";

/** UTF-8 safe base64 encode: btoa alone only handles Latin1, and Snapshot JSON (item/Area/Monster
 * names) is not guaranteed to stay ASCII. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Inverse of `toBase64`. */
function fromBase64(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encodes a Snapshot as a single copy-pasteable string: base64 of its JSON. */
export function encodeSave(snapshot: Snapshot): string {
  return toBase64(JSON.stringify(snapshot));
}

/**
 * Decodes a pasted save string back into a Snapshot. Trims surrounding whitespace,
 * base64-decodes, `JSON.parse`s, and shallow-checks the result is an object with a `player`
 * object — full field validation stays `loadState`'s job (it's tolerant by design, #38). Any
 * failure at any step — empty input, non-base64 text, valid-base64-non-JSON, or JSON missing a
 * `player` object — returns `null`. Never throws.
 */
export function decodeSave(text: string): Snapshot | null {
  try {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const parsed: unknown = JSON.parse(fromBase64(trimmed));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      typeof (parsed as { player?: unknown }).player === "object" &&
      (parsed as { player?: unknown }).player !== null
    ) {
      return parsed as Snapshot;
    }
    return null;
  } catch {
    return null;
  }
}
