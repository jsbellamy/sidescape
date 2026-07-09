import { describe, expect, it } from "vitest";
import { makeSnapshot } from "../core/make-snapshot";
import { decodeSave, encodeSave } from "./save-transfer";

describe("encodeSave / decodeSave", () => {
  it("round-trips a Snapshot through encode then decode", () => {
    const snapshot = makeSnapshot({ player: { gold: 42 } });
    const decoded = decodeSave(encodeSave(snapshot));
    expect(decoded).toEqual(snapshot);
  });

  it("tolerates surrounding whitespace on decode", () => {
    const snapshot = makeSnapshot();
    const decoded = decodeSave(`  \n${encodeSave(snapshot)}\t \n`);
    expect(decoded).toEqual(snapshot);
  });

  it("returns null for an empty string", () => {
    expect(decodeSave("")).toBeNull();
    expect(decodeSave("   ")).toBeNull();
  });

  it("returns null for garbage text", () => {
    expect(decodeSave("this is not a save")).toBeNull();
  });

  it("returns null for non-base64 text", () => {
    expect(decodeSave("!!!not-base64!!!")).toBeNull();
  });

  it("returns null for valid base64 that isn't JSON", () => {
    // "hello world" base64-encoded — decodes fine, but JSON.parse fails on it.
    expect(decodeSave("aGVsbG8gd29ybGQ=")).toBeNull();
  });

  it("returns null for JSON missing a player object", () => {
    const encoded = btoa(JSON.stringify({ monster: null }));
    expect(decodeSave(encoded)).toBeNull();

    const encodedNullPlayer = btoa(JSON.stringify({ player: null }));
    expect(decodeSave(encodedNullPlayer)).toBeNull();

    const encodedArray = btoa(JSON.stringify([1, 2, 3]));
    expect(decodeSave(encodedArray)).toBeNull();
  });

  it("never throws on malformed input", () => {
    expect(() => decodeSave("")).not.toThrow();
    expect(() => decodeSave("%%%")).not.toThrow();
    expect(() => decodeSave("null")).not.toThrow();
    expect(decodeSave("null")).toBeNull();
  });
});
