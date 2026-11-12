/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The WebMCP tools, written to the build-webmcp-tools skill
 * (.agents/skills/build-webmcp-tools):
 *
 * - Only `open_letter` declares an `outputSchema`, because its fields are
 *   what the other tools take as input (the skill's chaining payoff). The
 *   other tools' results are terminal, so they omit it.
 * - Failures resolve `{ error, code, retryable }` instead of throwing, since
 *   a rejected `execute()` reaches the agent as a bare `UnknownError`.
 * - Tools resolve only after the page has drawn the change.
 */

import type { WorkshopApp } from "./app";
import { COLOURS, TOYS, isColour, isToy, type Wish } from "./workshop";

const WISH_SCHEMA = {
  type: "object",
  properties: {
    toy: { type: "string", enum: TOYS, description: "The kind of toy." },
    colour: { type: "string", enum: COLOURS, description: "The colour to paint it." },
  },
  required: ["toy", "colour"],
} as const;

export function describeTools(app: WorkshopApp): WebMCP.ModelContextTool[] {
  return [
    {
      name: "open_letter",
      description:
        "Reads the child's letter waiting on Santa's desk. Use first, to learn which toys to build and where the sleigh must deliver them. A new letter arrives after each delivery.",
      annotations: { readOnlyHint: true },
      outputSchema: {
        type: "object",
        properties: {
          child: { type: "string", description: "The name the letter is signed with. Pass it to load_sleigh." },
          chimney: { type: "string", description: "Where the child lives, exactly as load_sleigh needs it." },
          wishes: { type: "array", items: WISH_SCHEMA, description: "The toys asked for. Pass them to build_toys." },
        },
        required: ["child", "chimney", "wishes"],
      },
      execute: () => app.openLetter(),
    },
    {
      name: "build_toys",
      description:
        "Has the elves build toys and put them in Santa's sack. Use after reading a letter, with the toys it asks for; a wrong toy can be cleared with empty_sack.",
      inputSchema: {
        type: "object",
        properties: {
          toys: { type: "array", items: WISH_SCHEMA, minItems: 1, description: "The toys to build, as listed in the letter." },
        },
        required: ["toys"],
      },
      execute: (input: Record<string, unknown>) => {
        const toys = Array.isArray(input.toys) ? input.toys : [];
        const wishes = toys.filter((t): t is Wish => typeof t === "object" && t !== null && isToy(t.toy) && isColour(t.colour));
        if (wishes.length === 0 || wishes.length !== toys.length) {
          return {
            error: `Every toy needs a toy (${TOYS.join(", ")}) and a colour (${COLOURS.join(", ")}). Nothing was built.`,
            code: "INVALID_TOY",
            retryable: true,
          };
        }
        return app.buildToys(wishes);
      },
    },
    {
      name: "load_sleigh",
      description:
        "Loads Santa's sack onto the sleigh and delivers it. Use once the sack holds exactly the toys in the letter. The sleigh refuses to leave, and says why, if the child, chimney or toys don't match.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "The child's name, as signed on the letter." },
          address: { type: "string", description: "The chimney from the letter." },
        },
        required: ["to", "address"],
      },
      execute: (input: Record<string, unknown>) =>
        app.loadSleigh(typeof input.to === "string" ? input.to : "", typeof input.address === "string" ? input.address : ""),
    },
    {
      name: "empty_sack",
      description: "Takes every toy back out of Santa's sack. Use to start a letter again after building a wrong toy.",
      execute: () => app.emptySack(),
    },
  ];
}

/** Registers the tools until `signal` aborts. Does nothing where WebMCP is unavailable. */
export function registerTools(app: WorkshopApp, signal?: AbortSignal): void {
  const context = document.modelContext;
  if (!context) return;
  for (const tool of describeTools(app)) {
    context.registerTool(tool, { signal }).catch((error: unknown) => {
      console.error(`Failed to register WebMCP tool "${tool.name}":`, error);
    });
  }
}
