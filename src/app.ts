/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Holds the workshop's state and draws it. The WebMCP tools and the page's
 * own buttons both call these methods, so a person and a macro see the same
 * thing happen.
 */

import * as rules from "./workshop";
import type { BuiltToy, Colour, Delivery, Refusal, Toy, Wish } from "./workshop";

const TOY_EMOJI: Record<Toy, string> = {
  train: "🚂",
  teddy: "🧸",
  robot: "🤖",
  kite: "🪁",
  drum: "🥁",
  rocket: "🚀",
  doll: "🪆",
  dinosaur: "🦕",
};

/**
 * How long the envelope takes to open, how long a new letter takes to arrive,
 * how long the elf takes per toy, how long a finished toy stays in the
 * spotlight, and how long the sleigh is away, so an audience can follow along.
 */
export const OPEN_MS = 750;
export const ARRIVE_MS = 650;
export const BUILD_MS = 700;
export const SHOW_MS = 600;
export const FLIGHT_MS = 2400;

type LetterPhase = "closed" | "opening" | "open" | "arriving";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const pause = (ms: number): Promise<void> =>
  prefersReducedMotion() ? Promise.resolve() : wait(ms);

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

function make(tag: string, className: string, text = ""): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function colourWord(colour: Colour): HTMLElement {
  return make("span", `ink ink-${colour}`, colour);
}

function gift(toy: Wish): HTMLElement {
  const node = make("span", `gift gift-${toy.colour}`, TOY_EMOJI[toy.toy]);
  node.title = `${toy.colour} ${toy.toy}`;
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", `${toy.colour} ${toy.toy}`);
  return node;
}

export class WorkshopApp {
  #state = rules.newWorkshop();
  #flying = false;
  #letterPhase: LetterPhase = "closed";
  #opening: Promise<rules.Letter> | null = null;
  #arriving: Promise<void> | null = null;
  #bound = false;
  /** Builds run one after another, even when calls overlap, so every toy gets its own animation. */
  #builds: Promise<unknown> = Promise.resolve();

  render(): void {
    this.#bindControls();
    this.#renderLetter();
    element("letter").classList.remove("read");
    this.#setLetterPhase("closed");
    this.#renderSack();
    element("delivered").textContent = String(this.#state.delivered);
  }

  openLetter(): Promise<rules.Letter> {
    if (this.#arriving) return this.#arriving.then(() => this.openLetter());
    if (this.#opening) return this.#opening;
    this.#log("open_letter", {}, "📜");
    if (this.#letterPhase === "open") {
      const letter = element("letter");
      letter.classList.remove("read");
      void letter.offsetWidth; // Restarts the animation.
      letter.classList.add("read");
      return Promise.resolve(structuredClone(this.#state.letter));
    }
    const opening = (async () => {
      try {
        this.#setLetterPhase("opening");
        await pause(OPEN_MS);
        this.#setLetterPhase("open");
        this.#announce(`Letter from ${this.#state.letter.child} opened.`);
        return structuredClone(this.#state.letter);
      } finally {
        this.#opening = null;
      }
    })();
    this.#opening = opening;
    return opening;
  }

  #bindControls(): void {
    if (this.#bound) return;
    this.#bound = true;
    element<HTMLButtonElement>("empty-sack").onclick = () => void this.emptySack();
    element<HTMLButtonElement>("skip-letter").onclick = () => void this.#skipLetter();
    element<HTMLButtonElement>("open-letter-btn").onclick = () => void this.#openFromButton();
  }

  async #openFromButton(): Promise<void> {
    const button = element<HTMLButtonElement>("open-letter-btn");
    const active = document.activeElement;
    const shouldRestore = active === button || active == null || active === document.body;
    await this.openLetter();
    if (
      button.hidden &&
      shouldRestore &&
      (document.activeElement == null || document.activeElement === document.body || document.activeElement === button)
    ) {
      element("letter").focus({ preventScroll: true });
    }
  }

  #setLetterPhase(phase: LetterPhase): void {
    this.#letterPhase = phase;
    element("letter").dataset["state"] = phase;
    const paper = element("letter-paper");
    const hidden = phase !== "open";
    paper.setAttribute("aria-hidden", String(hidden));
    paper.inert = hidden;
    const button = element<HTMLButtonElement>("open-letter-btn");
    button.hidden = phase === "open";
    button.disabled = phase !== "closed";
  }

  #arriveNewLetter(): Promise<void> {
    const arriving = (async () => {
      try {
        this.#renderLetter();
        const letter = element("letter");
        letter.classList.remove("read");
        this.#setLetterPhase("arriving");
        void letter.offsetWidth; // Restarts the arrival animation.
        await pause(ARRIVE_MS);
        this.#setLetterPhase("closed");
      } finally {
        this.#arriving = null;
      }
    })();
    this.#arriving = arriving;
    return arriving;
  }

  buildToy(wish: Wish): Promise<BuiltToy & { sackSize: number }> {
    this.#log("build_toy", wish, TOY_EMOJI[wish.toy]);
    const build = this.#builds.then(() => this.#build(wish));
    this.#builds = build;
    return build;
  }

  /** Resolves only once the toy has dropped into the sack and the elf has cheered, so the next call can't cut it short. */
  async #build(wish: Wish): Promise<BuiltToy & { sackSize: number }> {
    this.#say(`Building a ${wish.colour} ${wish.toy}…`, "busy");
    await wait(BUILD_MS);
    const { workshop, toy } = rules.buildToy(this.#state, wish);
    this.#state = workshop;
    element("sack").append(gift(toy));
    this.#markNewest();
    this.#say(`One ${wish.colour} ${wish.toy}, coming up!`, "happy");
    await wait(SHOW_MS);
    return { ...toy, sackSize: workshop.sack.length };
  }

  async loadSleigh(to: string, address: string): Promise<Delivery | Refusal> {
    this.#log("load_sleigh", { to, address }, "🛷");
    await this.#builds; // The sleigh waits for toys still on the bench.
    if (this.#flying) return { error: "The sleigh is still out delivering. Try again in a few seconds.", code: "SLEIGH_BUSY", retryable: true };
    const { workshop, result } = rules.loadSleigh(this.#state, to, address);
    if ("error" in result) {
      this.#say(result.error, "sad");
      return result;
    }
    this.#say(`Off to ${result.child}! 🎄`, "happy");
    this.#flying = true;
    const sleigh = element("sleigh");
    try {
      element("sleigh-tag").textContent = `${result.child} · ${result.chimney}`;
      sleigh.classList.add("flying");
      element("sack").replaceChildren();
      await wait(FLIGHT_MS);
      sleigh.classList.remove("flying");
      this.#state = workshop;
      element("delivered").textContent = String(this.#state.delivered);
      this.#renderSack();
      await this.#arriveNewLetter();
      this.#announce(`Delivered to ${result.child}. A new letter has arrived.`);
      return result;
    } finally {
      this.#flying = false;
    }
  }

  emptySack(): { removed: number } {
    const removed = this.#state.sack.length;
    this.#log("empty_sack", {}, "🧺");
    this.#state = rules.emptySack(this.#state);
    this.#renderSack();
    this.#say("Sack emptied. Let's try that again.", "busy");
    return { removed };
  }

  async #skipLetter(): Promise<void> {
    if (this.#flying || this.#arriving !== null || this.#opening !== null) return;
    this.#state = { ...rules.newWorkshop(), delivered: this.#state.delivered };
    this.#renderSack();
    this.#say("A new letter has arrived.", "busy");
    await this.#arriveNewLetter();
  }

  #renderLetter(): void {
    const { child, chimney, wishes } = this.#state.letter;
    const list = element("wishes");
    list.replaceChildren(
      ...wishes.map((wish) => {
        const item = make("li", "");
        item.append("a ", colourWord(wish.colour), ` ${wish.toy} `, gift(wish));
        return item;
      }),
    );
    element("child").textContent = child;
    element("chimney").textContent = chimney;
  }

  #renderSack(): void {
    const sack = element("sack");
    sack.replaceChildren(...this.#state.sack.map(gift));
    this.#markNewest();
  }

  /** Only the newest gift plays the drop, and only once, so earlier gifts sit still. */
  #markNewest(): void {
    const sack = element("sack");
    for (const node of sack.querySelectorAll(".new")) node.classList.remove("new");
    sack.lastElementChild?.classList.add("new");
    element("sack-empty").hidden = this.#state.sack.length > 0;
  }

  #say(text: string, mood: "busy" | "happy" | "sad"): void {
    const bubble = element("elf-says");
    bubble.textContent = text;
    bubble.dataset["mood"] = mood;
    element("elf").dataset["mood"] = mood;
    this.#announce(text);
  }

  #announce(text: string): void {
    element("announcer").textContent = text;
  }

  #log(tool: string, args: object, icon: string): void {
    const entry = make("li", "");
    entry.append(make("span", "log-icon", icon), make("code", "", `${tool}(${JSON.stringify(args)})`));
    const log = element("log");
    log.prepend(entry);
    while (log.children.length > 8) log.lastElementChild?.remove();
  }
}
