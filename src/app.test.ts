/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ARRIVE_MS, BUILD_MS, FLIGHT_MS, OPEN_MS, SHOW_MS, WorkshopApp } from "./app";

class FakeClassList {
  #classes = new Set<string>();
  addCalls: string[] = [];
  removeCalls: string[] = [];

  add(...tokens: string[]): void {
    for (const token of tokens) {
      this.#classes.add(token);
      this.addCalls.push(token);
    }
  }

  remove(...tokens: string[]): void {
    for (const token of tokens) {
      this.#classes.delete(token);
      this.removeCalls.push(token);
    }
  }

  contains(token: string): boolean {
    return this.#classes.has(token);
  }
}

class FakeElement {
  id: string;
  tagName: string;
  className = "";
  textContent = "";
  title = "";
  hidden = false;
  disabled = false;
  inert = false;
  dataset: Record<string, string> = {};
  onclick: (() => void) | null = null;
  classList = new FakeClassList();
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  offsetWidthReads = 0;
  focus = vi.fn();
  #attributes = new Map<string, string>();

  constructor(tagName: string, id = "") {
    this.tagName = tagName.toUpperCase();
    this.id = id;
  }

  get offsetWidth(): number {
    this.offsetWidthReads += 1;
    return 300;
  }

  get lastElementChild(): FakeElement | null {
    return this.children.at(-1) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.#attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.#attributes.get(name) ?? null;
  }

  append(...nodes: Array<FakeElement | string>): void {
    for (const node of nodes) {
      if (node instanceof FakeElement) {
        node.parent = this;
        this.children.push(node);
      }
    }
  }

  prepend(...nodes: Array<FakeElement | string>): void {
    const added: FakeElement[] = [];
    for (const node of nodes) {
      if (node instanceof FakeElement) {
        node.parent = this;
        added.push(node);
      }
    }
    this.children.unshift(...added);
  }

  replaceChildren(...nodes: Array<FakeElement | string>): void {
    for (const child of this.children) child.parent = null;
    this.children = [];
    this.append(...nodes);
  }

  remove(): void {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (!selector.startsWith(".")) return [];
    const cls = selector.slice(1);
    return this.children.filter((child) => child.classList.contains(cls));
  }
}

const ELEMENT_IDS = [
  "letter",
  "letter-paper",
  "open-letter-btn",
  "wishes",
  "child",
  "chimney",
  "sack",
  "sack-empty",
  "delivered",
  "empty-sack",
  "skip-letter",
  "elf",
  "elf-says",
  "sleigh",
  "sleigh-tag",
  "log",
  "announcer",
] as const;

type ElementId = (typeof ELEMENT_IDS)[number];

function setupDom(options: { reducedMotion?: boolean } = {}) {
  const elements = Object.fromEntries(
    ELEMENT_IDS.map((id) => [id, new FakeElement(id.endsWith("btn") ? "button" : "div", id)]),
  ) as Record<ElementId, FakeElement>;

  const body = new FakeElement("body");
  const doc = {
    body,
    activeElement: body as FakeElement | null,
    getElementById: (id: string) => (elements as Record<string, FakeElement | undefined>)[id] ?? null,
    createElement: (tag: string) => new FakeElement(tag),
  };

  const matchMedia = vi.fn((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" && Boolean(options.reducedMotion),
  }));

  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", { matchMedia });

  return { doc, elements, matchMedia };
}

describe("WorkshopApp letter open state machine", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders initially closed with hidden/inert paper, enabled envelope button, and binds controls once", () => {
    const { elements } = setupDom();
    const app = new WorkshopApp();
    app.render();

    expect(elements["letter"].dataset["state"]).toBe("closed");
    expect(elements["letter-paper"].getAttribute("aria-hidden")).toBe("true");
    expect(elements["letter-paper"].inert).toBe(true);
    expect(elements["open-letter-btn"].hidden).toBe(false);
    expect(elements["open-letter-btn"].disabled).toBe(false);

    const openHandler = elements["open-letter-btn"].onclick;
    const emptyHandler = elements["empty-sack"].onclick;
    const skipHandler = elements["skip-letter"].onclick;
    expect(openHandler).toBeTypeOf("function");
    expect(emptyHandler).toBeTypeOf("function");
    expect(skipHandler).toBeTypeOf("function");

    app.render();
    expect(elements["open-letter-btn"].onclick).toBe(openHandler);
    expect(elements["empty-sack"].onclick).toBe(emptyHandler);
    expect(elements["skip-letter"].onclick).toBe(skipHandler);
  });

  it("transitions closed -> opening -> open over OPEN_MS, reveals paper, logs once, announces, and clones letter", async () => {
    vi.useFakeTimers();
    const { elements } = setupDom();
    const app = new WorkshopApp();
    app.render();

    let settled = false;
    const pending = app.openLetter().then((letter) => {
      settled = true;
      return letter;
    });

    expect(elements["letter"].dataset["state"]).toBe("opening");
    expect(elements["letter-paper"].getAttribute("aria-hidden")).toBe("true");
    expect(elements["letter-paper"].inert).toBe(true);
    expect(elements["open-letter-btn"].hidden).toBe(false);
    expect(elements["open-letter-btn"].disabled).toBe(true);
    expect(elements["log"].children).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(OPEN_MS - 1);
    expect(settled).toBe(false);
    expect(elements["letter"].dataset["state"]).toBe("opening");

    await vi.advanceTimersByTimeAsync(1);
    const letter = await pending;
    expect(settled).toBe(true);
    expect(elements["letter"].dataset["state"]).toBe("open");
    expect(elements["letter-paper"].getAttribute("aria-hidden")).toBe("false");
    expect(elements["letter-paper"].inert).toBe(false);
    expect(elements["open-letter-btn"].hidden).toBe(true);
    expect(elements["open-letter-btn"].disabled).toBe(true);
    expect(elements["announcer"].textContent).toBe(`Letter from ${letter.child} opened.`);
    expect(elements["letter"].focus).not.toHaveBeenCalled();

    // Mutating the returned letter does not affect WorkshopApp's internal state.
    const originalChild = letter.child;
    letter.child = "Mutated";
    const second = await app.openLetter();
    expect(second.child).toBe(originalChild);
  });

  it("resolves repeat openLetter() immediately while open without re-closing and replays .read", async () => {
    vi.useFakeTimers();
    const { elements } = setupDom();
    const app = new WorkshopApp();
    app.render();

    const firstPromise = app.openLetter();
    await vi.advanceTimersByTimeAsync(OPEN_MS);
    const first = await firstPromise;

    const readsBefore = elements["letter"].offsetWidthReads;
    const repeat = await app.openLetter();

    expect(repeat).toEqual(first);
    expect(elements["letter"].dataset["state"]).toBe("open");
    expect(elements["letter"].offsetWidthReads).toBe(readsBefore + 1);
    expect(elements["letter"].classList.removeCalls).toContain("read");
    expect(elements["letter"].classList.contains("read")).toBe(true);
    expect(elements["log"].children).toHaveLength(2);
  });

  it("coalesces concurrent openLetter() calls while opening onto one promise and one log entry", async () => {
    vi.useFakeTimers();
    const { elements } = setupDom();
    const app = new WorkshopApp();
    app.render();

    const first = app.openLetter();
    const second = app.openLetter();

    expect(first).toBe(second);
    expect(elements["log"].children).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(OPEN_MS);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(elements["letter"].dataset["state"]).toBe("open");
  });

  it("moves focus to #letter when opened via #open-letter-btn, but not on programmatic openLetter()", async () => {
    vi.useFakeTimers();
    const { doc, elements } = setupDom();
    const app = new WorkshopApp();
    app.render();

    // Simulate keyboard/mouse activation where button had focus and browser drops focus to body when disabled.
    doc.activeElement = elements["open-letter-btn"];
    elements["open-letter-btn"].onclick?.();
    doc.activeElement = doc.body;

    expect(elements["letter"].dataset["state"]).toBe("opening");
    expect(elements["letter"].focus).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(OPEN_MS);
    expect(elements["letter"].dataset["state"]).toBe("open");
    expect(elements["letter"].focus).toHaveBeenCalledTimes(1);
    expect(elements["letter"].focus).toHaveBeenCalledWith({ preventScroll: true });

    // Programmatic openLetter() on a fresh app must not call focus().
    const secondDom = setupDom();
    const app2 = new WorkshopApp();
    app2.render();
    const pending = app2.openLetter();
    await vi.advanceTimersByTimeAsync(OPEN_MS);
    await pending;
    expect(secondDom.elements["letter"].focus).not.toHaveBeenCalled();
  });

  it("resolves openLetter() immediately under prefers-reduced-motion: reduce without waiting OPEN_MS", async () => {
    vi.useFakeTimers();
    const { elements } = setupDom({ reducedMotion: true });
    const app = new WorkshopApp();
    app.render();

    const letter = await app.openLetter();
    expect(letter.child).toBeTruthy();
    expect(elements["letter"].dataset["state"]).toBe("open");
    expect(elements["letter-paper"].getAttribute("aria-hidden")).toBe("false");
    expect(elements["letter-paper"].inert).toBe(false);
    expect(elements["open-letter-btn"].hidden).toBe(true);
    expect(elements["announcer"].textContent).toBe(`Letter from ${letter.child} opened.`);
  });
});

async function prepareSleigh(app: WorkshopApp) {
  const openPromise = app.openLetter();
  await vi.advanceTimersByTimeAsync(OPEN_MS);
  const letter = await openPromise;
  for (const wish of letter.wishes) {
    const buildPromise = app.buildToy(wish);
    await vi.advanceTimersByTimeAsync(BUILD_MS + SHOW_MS);
    await buildPromise;
  }
  return letter;
}

describe("WorkshopApp post-delivery letter arrival", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps loadSleigh() pending through FLIGHT_MS + ARRIVE_MS, transitions arriving -> closed, and announces on settle", async () => {
    vi.useFakeTimers();
    const { elements } = setupDom();
    const app = new WorkshopApp();
    app.render();

    const letter = await prepareSleigh(app);
    // Replay read so .read is present before delivery and must be cleared on arrival.
    await app.openLetter();
    expect(elements["letter"].classList.contains("read")).toBe(true);

    let settled = false;
    const deliveryPromise = app.loadSleigh(letter.child, letter.chimney).then((res) => {
      settled = true;
      return res;
    });

    await vi.advanceTimersByTimeAsync(FLIGHT_MS - 1);
    expect(settled).toBe(false);
    expect(elements["sleigh"].classList.contains("flying")).toBe(true);

    const readsBeforeArrive = elements["letter"].offsetWidthReads;
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(false);
    expect(elements["sleigh"].classList.contains("flying")).toBe(false);
    expect(elements["delivered"].textContent).toBe("1");
    expect(elements["sack-empty"].hidden).toBe(false);
    expect(elements["letter"].dataset["state"]).toBe("arriving");
    expect(elements["letter"].classList.contains("read")).toBe(false);
    expect(elements["letter"].offsetWidthReads).toBe(readsBeforeArrive + 1);
    expect(elements["letter-paper"].getAttribute("aria-hidden")).toBe("true");
    expect(elements["letter-paper"].inert).toBe(true);
    expect(elements["open-letter-btn"].hidden).toBe(false);
    expect(elements["open-letter-btn"].disabled).toBe(true);

    await vi.advanceTimersByTimeAsync(ARRIVE_MS - 1);
    expect(settled).toBe(false);
    expect(elements["letter"].dataset["state"]).toBe("arriving");

    await vi.advanceTimersByTimeAsync(1);
    const result = await deliveryPromise;
    expect(settled).toBe(true);
    expect("error" in result).toBe(false);
    expect(elements["letter"].dataset["state"]).toBe("closed");
    expect(elements["open-letter-btn"].hidden).toBe(false);
    expect(elements["open-letter-btn"].disabled).toBe(false);
    expect(elements["announcer"].textContent).toBe(`Delivered to ${letter.child}. A new letter has arrived.`);
  });

  it("returns SLEIGH_BUSY to concurrent loadSleigh() calls during post-flight arrival", async () => {
    vi.useFakeTimers();
    const { elements } = setupDom();
    const app = new WorkshopApp();
    app.render();

    const letter = await prepareSleigh(app);
    const first = app.loadSleigh(letter.child, letter.chimney);

    await vi.advanceTimersByTimeAsync(FLIGHT_MS);
    expect(elements["letter"].dataset["state"]).toBe("arriving");

    const busy = await app.loadSleigh(letter.child, letter.chimney);
    expect(busy).toMatchObject({ code: "SLEIGH_BUSY", retryable: true });

    await vi.advanceTimersByTimeAsync(ARRIVE_MS);
    const delivered = await first;
    expect("error" in delivered).toBe(false);
    expect(elements["letter"].dataset["state"]).toBe("closed");
  });

  it("waits for arrival to finish before openLetter() transitions opening -> open", async () => {
    vi.useFakeTimers();
    const { elements } = setupDom();
    const app = new WorkshopApp();
    app.render();

    const firstLetter = await prepareSleigh(app);
    const delivery = app.loadSleigh(firstLetter.child, firstLetter.chimney);

    await vi.advanceTimersByTimeAsync(FLIGHT_MS);
    expect(elements["letter"].dataset["state"]).toBe("arriving");

    let opened = false;
    const openPromise = app.openLetter().then((nextLetter) => {
      opened = true;
      return nextLetter;
    });

    // Still arriving — must not switch to opening yet.
    await vi.advanceTimersByTimeAsync(ARRIVE_MS - 1);
    expect(opened).toBe(false);
    expect(elements["letter"].dataset["state"]).toBe("arriving");

    // Arrival completes and triggers opening phase.
    await vi.advanceTimersByTimeAsync(1);
    await delivery;
    expect(opened).toBe(false);
    expect(elements["letter"].dataset["state"]).toBe("opening");

    await vi.advanceTimersByTimeAsync(OPEN_MS - 1);
    expect(opened).toBe(false);
    expect(elements["letter"].dataset["state"]).toBe("opening");

    await vi.advanceTimersByTimeAsync(1);
    const nextLetter = await openPromise;
    expect(opened).toBe(true);
    expect(elements["letter"].dataset["state"]).toBe("open");
    expect(nextLetter.child).toBe(elements["child"].textContent);
    expect(elements["announcer"].textContent).toBe(`Letter from ${nextLetter.child} opened.`);
  });

  it("resolves post-delivery arrival immediately under prefers-reduced-motion: reduce without waiting ARRIVE_MS", async () => {
    vi.useFakeTimers();
    const { elements } = setupDom({ reducedMotion: true });
    const app = new WorkshopApp();
    app.render();

    const letter = await prepareSleigh(app);

    let settled = false;
    const delivery = app.loadSleigh(letter.child, letter.chimney).then((res) => {
      settled = true;
      return res;
    });

    await vi.advanceTimersByTimeAsync(FLIGHT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await delivery;
    expect(settled).toBe(true);
    expect("error" in result).toBe(false);
    expect(elements["letter"].dataset["state"]).toBe("closed");
    expect(elements["open-letter-btn"].disabled).toBe(false);
    expect(elements["announcer"].textContent).toBe(`Delivered to ${letter.child}. A new letter has arrived.`);
  });
});

describe("WorkshopApp Next letter skip arrival", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("clears the sack, updates the elf bubble, and transitions arriving -> closed when idle", async () => {
    vi.useFakeTimers();
    const { elements } = setupDom();
    const app = new WorkshopApp();
    app.render();

    const openPromise = app.openLetter();
    await vi.advanceTimersByTimeAsync(OPEN_MS);
    const letter = await openPromise;

    // Replay .read and build one toy so both .read and the sack must be cleared on skip.
    await app.openLetter();
    expect(elements["letter"].classList.contains("read")).toBe(true);
    const buildPromise = app.buildToy(letter.wishes[0]);
    await vi.advanceTimersByTimeAsync(BUILD_MS + SHOW_MS);
    await buildPromise;
    expect(elements["sack"].children).toHaveLength(1);
    expect(elements["sack-empty"].hidden).toBe(true);

    const readsBefore = elements["letter"].offsetWidthReads;
    elements["skip-letter"].onclick?.();

    expect(elements["sack"].children).toHaveLength(0);
    expect(elements["sack-empty"].hidden).toBe(false);
    expect(elements["elf-says"].textContent).toBe("A new letter has arrived.");
    expect(elements["elf-says"].dataset["mood"]).toBe("busy");
    expect(elements["elf"].dataset["mood"]).toBe("busy");
    expect(elements["announcer"].textContent).toBe("A new letter has arrived.");
    expect(elements["letter"].dataset["state"]).toBe("arriving");
    expect(elements["letter"].classList.contains("read")).toBe(false);
    expect(elements["letter"].offsetWidthReads).toBe(readsBefore + 1);
    expect(elements["letter-paper"].getAttribute("aria-hidden")).toBe("true");
    expect(elements["letter-paper"].inert).toBe(true);
    expect(elements["open-letter-btn"].hidden).toBe(false);
    expect(elements["open-letter-btn"].disabled).toBe(true);

    await vi.advanceTimersByTimeAsync(ARRIVE_MS - 1);
    expect(elements["letter"].dataset["state"]).toBe("arriving");

    await vi.advanceTimersByTimeAsync(1);
    expect(elements["letter"].dataset["state"]).toBe("closed");
    expect(elements["open-letter-btn"].hidden).toBe(false);
    expect(elements["open-letter-btn"].disabled).toBe(false);
  });

  it("is a no-op while opening", async () => {
    vi.useFakeTimers();
    const { elements } = setupDom();
    const app = new WorkshopApp();
    app.render();

    const initialChild = elements["child"].textContent;
    const openPromise = app.openLetter();
    expect(elements["letter"].dataset["state"]).toBe("opening");

    const readsBefore = elements["letter"].offsetWidthReads;
    elements["skip-letter"].onclick?.();

    expect(elements["letter"].dataset["state"]).toBe("opening");
    expect(elements["child"].textContent).toBe(initialChild);
    expect(elements["elf-says"].textContent).toBe("");
    expect(elements["letter"].offsetWidthReads).toBe(readsBefore);

    await vi.advanceTimersByTimeAsync(OPEN_MS);
    const letter = await openPromise;
    expect(letter.child).toBe(initialChild);
    expect(elements["letter"].dataset["state"]).toBe("open");
  });

  it("is a no-op while arriving", async () => {
    vi.useFakeTimers();
    const { elements } = setupDom();
    const app = new WorkshopApp();
    app.render();

    elements["skip-letter"].onclick?.();
    expect(elements["letter"].dataset["state"]).toBe("arriving");
    const arrivingChild = elements["child"].textContent;
    const readsAfterFirst = elements["letter"].offsetWidthReads;

    await vi.advanceTimersByTimeAsync(300);
    elements["skip-letter"].onclick?.();

    expect(elements["letter"].dataset["state"]).toBe("arriving");
    expect(elements["child"].textContent).toBe(arrivingChild);
    expect(elements["letter"].offsetWidthReads).toBe(readsAfterFirst);

    // Finishes on the original ARRIVE_MS schedule without restarting.
    await vi.advanceTimersByTimeAsync(ARRIVE_MS - 300);
    expect(elements["letter"].dataset["state"]).toBe("closed");
    expect(elements["child"].textContent).toBe(arrivingChild);
  });

  it("is a no-op while flying", async () => {
    vi.useFakeTimers();
    const { elements } = setupDom();
    const app = new WorkshopApp();
    app.render();

    const letter = await prepareSleigh(app);
    const deliveryPromise = app.loadSleigh(letter.child, letter.chimney);

    await vi.advanceTimersByTimeAsync(FLIGHT_MS / 2);
    expect(elements["sleigh"].classList.contains("flying")).toBe(true);
    const readsBefore = elements["letter"].offsetWidthReads;

    elements["skip-letter"].onclick?.();

    expect(elements["sleigh"].classList.contains("flying")).toBe(true);
    expect(elements["letter"].dataset["state"]).toBe("open");
    expect(elements["child"].textContent).toBe(letter.child);
    expect(elements["elf-says"].textContent).toBe(`Off to ${letter.child}! 🎄`);
    expect(elements["letter"].offsetWidthReads).toBe(readsBefore);

    await vi.advanceTimersByTimeAsync(FLIGHT_MS / 2 + ARRIVE_MS);
    const result = await deliveryPromise;
    expect("error" in result).toBe(false);
    expect(elements["delivered"].textContent).toBe("1");
    expect(elements["letter"].dataset["state"]).toBe("closed");
  });

  it("settles immediately under prefers-reduced-motion: reduce without waiting ARRIVE_MS", async () => {
    vi.useFakeTimers();
    const { elements } = setupDom({ reducedMotion: true });
    const app = new WorkshopApp();
    app.render();

    elements["skip-letter"].onclick?.();
    await Promise.resolve();

    expect(elements["letter"].dataset["state"]).toBe("closed");
    expect(elements["open-letter-btn"].hidden).toBe(false);
    expect(elements["open-letter-btn"].disabled).toBe(false);
    expect(elements["elf-says"].textContent).toBe("A new letter has arrived.");
  });
});
