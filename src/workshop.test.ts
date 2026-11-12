/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import { buildToy, emptySack, loadSleigh, newWorkshop, writeLetter, type Workshop } from "./workshop";

/** A repeatable random source. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function withSack(workshop: Workshop): Workshop {
  return workshop.letter.wishes.reduce((w, wish) => buildToy(w, wish).workshop, workshop);
}

describe("writeLetter", () => {
  it("asks for two or three different toys", () => {
    for (let seed = 1; seed < 200; seed++) {
      const { wishes } = writeLetter(seeded(seed));
      expect(wishes.length).toBeGreaterThanOrEqual(2);
      expect(wishes.length).toBeLessThanOrEqual(3);
      expect(new Set(wishes.map((w) => w.toy)).size).toBe(wishes.length);
    }
  });

  it("varies between letters", () => {
    const random = seeded(7);
    const letters = new Set(Array.from({ length: 10 }, () => JSON.stringify(writeLetter(random))));
    expect(letters.size).toBeGreaterThan(1);
  });
});

describe("loadSleigh", () => {
  it("delivers the wished toys and opens the next letter", () => {
    const random = seeded(3);
    const workshop = withSack(newWorkshop(random));
    const { letter } = workshop;
    const { workshop: after, result } = loadSleigh(workshop, letter.child, letter.chimney, random);
    expect(result).toEqual({
      delivered: true,
      child: letter.child,
      chimney: letter.chimney,
      toys: letter.wishes,
      deliveredCount: 1,
    });
    expect(after.sack).toEqual([]);
    expect(after.letter).not.toBe(letter);
  });

  it("accepts the toys in any order and the name in any case", () => {
    const workshop = newWorkshop(seeded(5));
    const reversed = workshop.letter.wishes.toReversed().reduce((w, wish) => buildToy(w, wish).workshop, workshop);
    const { result } = loadSleigh(reversed, workshop.letter.child.toUpperCase(), workshop.letter.chimney);
    expect(result).toMatchObject({ delivered: true });
  });

  it("refuses the wrong child or chimney without changing anything", () => {
    const workshop = withSack(newWorkshop(seeded(9)));
    expect(loadSleigh(workshop, "Rudolph", workshop.letter.chimney)).toMatchObject({
      workshop,
      result: { code: "WRONG_CHILD" },
    });
    expect(loadSleigh(workshop, workshop.letter.child, "North Pole")).toMatchObject({
      workshop,
      result: { code: "WRONG_CHIMNEY" },
    });
  });

  it("refuses a missing toy, a wrong colour or an extra toy", () => {
    const workshop = newWorkshop(seeded(11));
    const { child, chimney, wishes } = workshop.letter;
    const [first, ...rest] = wishes;
    if (!first) throw new Error("letters always have wishes");

    const missing = rest.reduce((w, wish) => buildToy(w, wish).workshop, workshop);
    expect(loadSleigh(missing, child, chimney).result).toMatchObject({ code: "MISSING_TOY" });

    const otherColour = first.colour === "red" ? "blue" : "red";
    const recoloured = buildToy(missing, { ...first, colour: otherColour }).workshop;
    expect(loadSleigh(recoloured, child, chimney).result).toMatchObject({ code: "MISSING_TOY" });

    const extra = buildToy(withSack(workshop), first).workshop;
    expect(loadSleigh(extra, child, chimney).result).toMatchObject({ code: "UNWANTED_TOY" });
    expect(loadSleigh(withSack(emptySack(extra)), child, chimney).result).toMatchObject({ delivered: true });
  });
});
