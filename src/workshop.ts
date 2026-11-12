/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The workshop's rules, kept free of the DOM so they can be tested on their
 * own. The page and the WebMCP tools both go through these functions.
 *
 * Every letter is random, so nothing in it can be typed into a macro ahead of
 * time: a macro has to read the letter and pass its fields on.
 */

export const TOYS = ["train", "teddy", "robot", "kite", "drum", "rocket", "doll", "dinosaur"] as const;
export const COLOURS = ["red", "green", "blue", "gold", "purple"] as const;

export type Toy = (typeof TOYS)[number];
export type Colour = (typeof COLOURS)[number];

export interface Wish {
  toy: Toy;
  colour: Colour;
}

export interface Letter {
  child: string;
  chimney: string;
  wishes: Wish[];
}

export interface BuiltToy extends Wish {
  toyId: string;
}

export interface Workshop {
  letter: Letter;
  sack: BuiltToy[];
  delivered: number;
}

/** Why the sleigh refused to leave. */
export interface Refusal {
  error: string;
  code: "WRONG_CHILD" | "WRONG_CHIMNEY" | "MISSING_TOY" | "UNWANTED_TOY" | "SLEIGH_BUSY";
}

export interface Delivery {
  delivered: true;
  child: string;
  chimney: string;
  toys: Wish[];
  /** How many letters have been answered since the page loaded. */
  deliveredCount: number;
}

const CHILDREN = ["Maya", "Oskar", "Priya", "Tomás", "Aiko", "Lena", "Kofi", "Isla", "Mateo", "Freya"];
const STREETS = ["Snowdrop Lane", "Holly Road", "Pinecone Street", "Mistletoe Close", "Frosty Avenue", "Candle Row"];
const TOWNS = ["Oslo", "Lisbon", "Kyoto", "Accra", "Edinburgh", "Valparaíso", "Reykjavík", "Montreal"];

/** A random number source in [0, 1), injectable for tests. */
export type Random = () => number;

function pick<T>(items: readonly T[], random: Random): T {
  // The index is always in range for a non-empty list.
  return items[Math.floor(random() * items.length)] as T;
}

export function writeLetter(random: Random = Math.random): Letter {
  const count = 2 + Math.floor(random() * 2);
  const wishes: Wish[] = [];
  while (wishes.length < count) {
    const wish = { toy: pick(TOYS, random), colour: pick(COLOURS, random) };
    // Two of the same toy would make the letter ambiguous to check.
    if (!wishes.some((w) => w.toy === wish.toy)) wishes.push(wish);
  }
  const number = 1 + Math.floor(random() * 99);
  return {
    child: pick(CHILDREN, random),
    chimney: `${number} ${pick(STREETS, random)}, ${pick(TOWNS, random)}`,
    wishes,
  };
}

export function newWorkshop(random: Random = Math.random): Workshop {
  return { letter: writeLetter(random), sack: [], delivered: 0 };
}

export function isToy(value: unknown): value is Toy {
  return (TOYS as readonly unknown[]).includes(value);
}

export function isColour(value: unknown): value is Colour {
  return (COLOURS as readonly unknown[]).includes(value);
}

let nextToyId = 1;

/** Adds a toy to the sack. The elves build anything; the sleigh checks it. */
export function buildToy(workshop: Workshop, wish: Wish): { workshop: Workshop; toy: BuiltToy } {
  const toy = { ...wish, toyId: `toy-${nextToyId++}` };
  return { workshop: { ...workshop, sack: [...workshop.sack, toy] }, toy };
}

export function emptySack(workshop: Workshop): Workshop {
  return { ...workshop, sack: [] };
}

const describe = (wish: Wish) => `a ${wish.colour} ${wish.toy}`;

/**
 * Checks the sack against the letter. On success the letter is answered and
 * the next one arrives; on refusal nothing changes.
 */
export function loadSleigh(
  workshop: Workshop,
  to: string,
  address: string,
  random: Random = Math.random,
): { workshop: Workshop; result: Delivery | Refusal } {
  const { letter, sack } = workshop;
  const refuse = (code: Refusal["code"], error: string) => ({ workshop, result: { error, code } });

  if (to.trim().toLowerCase() !== letter.child.toLowerCase()) {
    return refuse("WRONG_CHILD", `This letter is from ${letter.child}, not ${to || "nobody"}.`);
  }
  if (address.trim() !== letter.chimney) {
    return refuse("WRONG_CHIMNEY", `The reindeer can't find "${address}". ${letter.child} lives at ${letter.chimney}.`);
  }
  const remaining = [...sack];
  for (const wish of letter.wishes) {
    const index = remaining.findIndex((toy) => toy.toy === wish.toy && toy.colour === wish.colour);
    if (index === -1) return refuse("MISSING_TOY", `${letter.child} asked for ${describe(wish)}, but it isn't in the sack.`);
    remaining.splice(index, 1);
  }
  const extra = remaining[0];
  if (extra) return refuse("UNWANTED_TOY", `${letter.child} didn't ask for ${describe(extra)}. Empty the sack and try again.`);

  const delivered = workshop.delivered + 1;
  return {
    workshop: { letter: writeLetter(random), sack: [], delivered },
    result: {
      delivered: true,
      child: letter.child,
      chimney: letter.chimney,
      toys: letter.wishes,
      deliveredCount: delivered,
    },
  };
}
