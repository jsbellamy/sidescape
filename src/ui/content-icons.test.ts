// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Content } from "../core/types";
import { fixtureContent } from "../core/testing/fixture-content";
import { seededRng } from "../core/rng";
import { content } from "../data";
import type { WorkspaceChrome } from "./workspace-chrome";
import { boot } from "./boot";
import { assertRegisteredContentIcons } from "./content-icons";
import { itemIcon } from "./icons";

const noopWindowChrome: WorkspaceChrome = {
  getCapacity: () => Promise.resolve(2),
  setCardCount: () => Promise.resolve(),
};

function stubLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

describe("assertRegisteredContentIcons", () => {
  it("passes for complete production content", () => {
    expect(() => assertRegisteredContentIcons(content)).not.toThrow();
  });

  it("fails for an item with a non-empty but unknown icon key", () => {
    const bad: Pick<Content, "items" | "pets"> = {
      items: [{ ...content.items[0]!, id: "bad-item", icon: "missing-sword" }],
      pets: [],
    };
    expect(() => assertRegisteredContentIcons(bad)).toThrow(
      /item "bad-item" declares icon "missing-sword" not in registry/,
    );
  });

  it("fails for a pet with a non-empty but unknown icon key", () => {
    const bad: Pick<Content, "items" | "pets"> = {
      items: [],
      pets: [{ ...content.pets[0]!, id: "bad-pet", icon: "missing-wisp" }],
    };
    expect(() => assertRegisteredContentIcons(bad)).toThrow(
      /pet "bad-pet" declares icon "missing-wisp" not in registry/,
    );
  });

  it("aggregates multiple missing keys in deterministic Content order", () => {
    const bad: Pick<Content, "items" | "pets"> = {
      items: [
        { ...content.items[0]!, id: "first-bad", icon: "missing-a" },
        { ...content.items[1]!, id: "second-bad", icon: "missing-b" },
      ],
      pets: [{ ...content.pets[0]!, id: "pet-bad", icon: "missing-c" }],
    };

    let message = "";
    try {
      assertRegisteredContentIcons(bad);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toMatch(/^Invalid Content icon registry:/);
    const itemFirst = message.indexOf('item "first-bad"');
    const itemSecond = message.indexOf('item "second-bad"');
    const petBad = message.indexOf('pet "pet-bad"');
    expect(itemFirst).toBeGreaterThanOrEqual(0);
    expect(itemSecond).toBeGreaterThan(itemFirst);
    expect(petBad).toBeGreaterThan(itemSecond);
  });

  it("itemIcon still throws for a direct unknown-key lookup", () => {
    expect(() => itemIcon("not-a-real-icon-key")).toThrow(/no entry/);
  });
});

describe("boot icon registry gate", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", stubLocalStorage());
    localStorage.clear();
    document.body.replaceChildren();
  });

  it("does not mount the application when registry assertion fails", () => {
    const root = document.createElement("main");
    const badContent: Content = {
      ...fixtureContent,
      items: [{ ...fixtureContent.items[0]!, icon: "not-registered-icon-key" }],
    };

    expect(() =>
      boot(root, {
        content: badContent,
        rng: seededRng(1),
        now: () => 0,
        createChrome: () => noopWindowChrome,
        closeWindow: async () => {},
        reload: () => {},
        confirm: () => true,
      }),
    ).toThrow(/Invalid Content icon registry/);

    expect(root.querySelector("#app")).toBeNull();
  });
});
