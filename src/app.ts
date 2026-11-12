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

/** How long the elf takes per toy and the sleigh per flight, so an audience can follow along. */
const BUILD_MS = 700;
const FLIGHT_MS = 2400;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  render(): void {
    this.#renderLetter();
    this.#renderSack();
    element("delivered").textContent = String(this.#state.delivered);
    element<HTMLButtonElement>("empty-sack").onclick = () => void this.emptySack();
    element<HTMLButtonElement>("skip-letter").onclick = () => this.#skipLetter();
  }

  openLetter(): rules.Letter {
    this.#log("open_letter", {}, "📜");
    const letter = element("letter");
    letter.classList.remove("read");
    void letter.offsetWidth; // Restarts the animation.
    letter.classList.add("read");
    return structuredClone(this.#state.letter);
  }

  /** Builds the toys one by one, so each lands in the sack where people can see it. */
  async buildToys(wishes: readonly Wish[]): Promise<{ built: BuiltToy[]; sackSize: number }> {
    this.#log("build_toys", { toys: wishes }, "🔨");
    const built: BuiltToy[] = [];
    for (const wish of wishes) {
      this.#say(`Building a ${wish.colour} ${wish.toy} ${TOY_EMOJI[wish.toy]}…`, "busy");
      await wait(BUILD_MS);
      const { workshop, toy } = rules.buildToy(this.#state, wish);
      this.#state = workshop;
      this.#renderSack();
      built.push(toy);
    }
    this.#say(built.length === 1 ? "One toy, coming up!" : `${built.length} toys, coming up!`, "happy");
    return { built, sackSize: this.#state.sack.length };
  }

  async loadSleigh(to: string, address: string): Promise<Delivery | Refusal> {
    this.#log("load_sleigh", { to, address }, "🛷");
    if (this.#flying) return { error: "The sleigh is still out delivering. Try again in a few seconds.", code: "SLEIGH_BUSY", retryable: true };
    const { workshop, result } = rules.loadSleigh(this.#state, to, address);
    if ("error" in result) {
      this.#say(result.error, "sad");
      return result;
    }
    this.#say(`Off to ${result.child}! 🎄`, "happy");
    this.#flying = true;
    const sleigh = element("sleigh");
    element("sleigh-tag").textContent = `${result.child} · ${result.chimney}`;
    sleigh.classList.add("flying");
    element("sack").replaceChildren();
    await wait(FLIGHT_MS);
    sleigh.classList.remove("flying");
    this.#flying = false;
    this.#state = workshop;
    this.render();
    this.#announce(`Delivered to ${result.child}. A new letter has arrived.`);
    return result;
  }

  emptySack(): { removed: number } {
    const removed = this.#state.sack.length;
    this.#log("empty_sack", {}, "🧺");
    this.#state = rules.emptySack(this.#state);
    this.#renderSack();
    this.#say("Sack emptied. Let's try that again.", "busy");
    return { removed };
  }

  #skipLetter(): void {
    this.#state = { ...rules.newWorkshop(), delivered: this.#state.delivered };
    this.render();
    this.#say("A new letter has arrived.", "busy");
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
