/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The WebMCP tools. Each one declares an `outputSchema`, so a client knows
 * before calling `open_letter` that its result has `child`, `chimney` and a
 * `wishes` list whose items match `build_toy`'s input.
 */

import { COLOURS, TOYS, isColour, isToy } from "./workshop";
import type { WorkshopApp } from "./app";

const wish = {
  type: "object",
  properties: {
    toy: { type: "string", enum: TOYS, description: "The kind of toy." },
    colour: { type: "string", enum: COLOURS, description: "The colour to paint it." },
  },
  required: ["toy", "colour"],
  additionalProperties: false,
} as const;

const OPEN_LETTER_OUTPUT = {
  type: "object",
  properties: {
    child: { type: "string", description: "The name the child signed the letter with." },
    chimney: { type: "string", description: "The child's address, exactly as the sleigh needs it." },
    wishes: { type: "array", items: wish, description: "The toys the child asked for." },
  },
  required: ["child", "chimney", "wishes"],
} as const;

const BUILD_TOY_OUTPUT = {
  type: "object",
  properties: {
    toyId: { type: "string" },
    toy: wish.properties.toy,
    colour: wish.properties.colour,
    sackSize: { type: "integer", description: "How many toys are in the sack now." },
  },
  required: ["toyId", "toy", "colour", "sackSize"],
} as const;

const LOAD_SLEIGH_INPUT = {
  type: "object",
  properties: {
    to: { type: "string", description: "The child's name, as signed on the letter." },
    address: { type: "string", description: "The chimney address from the letter." },
  },
  required: ["to", "address"],
  additionalProperties: false,
} as const;

const LOAD_SLEIGH_OUTPUT = {
  oneOf: [
    {
      type: "object",
      properties: {
        delivered: { const: true },
        child: { type: "string" },
        chimney: { type: "string" },
        toys: { type: "array", items: wish },
        deliveredCount: { type: "integer", description: "Letters answered so far." },
      },
      required: ["delivered", "child", "chimney", "toys", "deliveredCount"],
    },
    {
      type: "object",
      properties: {
        error: { type: "string" },
        code: { type: "string", enum: ["WRONG_CHILD", "WRONG_CHIMNEY", "MISSING_TOY", "UNWANTED_TOY", "SLEIGH_BUSY"] },
      },
      required: ["error", "code"],
    },
  ],
} as const;

function register(tool: WebMCP.ModelContextTool): void {
  document.modelContext?.registerTool(tool).catch((error: unknown) => {
    console.error(`Failed to register WebMCP tool "${tool.name}":`, error);
  });
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function registerTools(workshop: WorkshopApp): void {
  register({
    name: "open_letter",
    description:
      "Reads the child's letter on Santa's desk: who wrote it, their chimney address and the toys they wish for. A new letter arrives after each delivery.",
    annotations: { readOnlyHint: true },
    outputSchema: OPEN_LETTER_OUTPUT,
    execute: () => workshop.openLetter(),
  });

  register({
    name: "build_toy",
    description: "Has an elf build one toy in one colour and put it in Santa's sack.",
    inputSchema: wish,
    outputSchema: BUILD_TOY_OUTPUT,
    execute: async (input: Record<string, unknown>) => {
      const { toy, colour } = input;
      if (!isToy(toy) || !isColour(colour)) {
        return { error: `The elves can build a ${TOYS.join(", ")} in ${COLOURS.join(", ")}.`, code: "INVALID_INPUT" };
      }
      return workshop.buildToy({ toy, colour });
    },
  });

  register({
    name: "load_sleigh",
    description:
      "Loads the sack onto the sleigh and delivers it. The sleigh only leaves when the name and chimney match the letter and the sack holds exactly the wished toys.",
    inputSchema: LOAD_SLEIGH_INPUT,
    outputSchema: LOAD_SLEIGH_OUTPUT,
    execute: (input: Record<string, unknown>) => workshop.loadSleigh(text(input.to), text(input.address)),
  });

  register({
    name: "empty_sack",
    description: "Takes every toy out of the sack, to start the letter again.",
    outputSchema: {
      type: "object",
      properties: { removed: { type: "integer" } },
      required: ["removed"],
    },
    execute: () => workshop.emptySack(),
  });
}
