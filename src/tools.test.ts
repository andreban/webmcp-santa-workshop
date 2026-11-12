/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkshopApp } from "./app";
import { describeTools, registerTools } from "./tools";

function fakeApp() {
  const app = {
    openLetter: vi.fn(() => ({ child: "Maya", chimney: "1 Holly Road, Oslo", wishes: [] })),
    buildToys: vi.fn(async () => ({ built: [], sackSize: 0 })),
    loadSleigh: vi.fn(async () => ({ error: "x", code: "WRONG_CHILD", retryable: true })),
    emptySack: vi.fn(() => ({ removed: 0 })),
  };
  // Only the methods the tools call are needed.
  return { app, tools: describeTools(app as unknown as WorkshopApp) };
}

const byName = (tools: WebMCP.ModelContextTool[], name: string) => {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`missing ${name}`);
  return tool;
};

const client = {} as WebMCP.ToolExecuteCallbackOptions;

/** Every `description` in a JSON Schema, at any depth. */
function descriptions(schema: unknown): string[] {
  if (typeof schema !== "object" || schema === null) return [];
  return Object.entries(schema).flatMap(([key, value]) =>
    key === "description" && typeof value === "string" ? [value] : descriptions(value),
  );
}

describe("tool definitions", () => {
  it("stays within the skill's budgets", () => {
    for (const tool of fakeApp().tools) {
      expect(tool.name.length).toBeLessThanOrEqual(30);
      expect(tool.description.length).toBeLessThanOrEqual(500);
      for (const text of [...descriptions(tool.inputSchema), ...descriptions(tool.outputSchema)]) {
        expect(text.length).toBeLessThanOrEqual(150);
      }
    }
  });

  it("declares an outputSchema only where its fields feed other tools", () => {
    const { tools } = fakeApp();
    expect(tools.filter((t) => t.outputSchema).map((t) => t.name)).toEqual(["open_letter"]);
    const letter = byName(tools, "open_letter").outputSchema as { properties: { wishes: { items: unknown } } };
    const build = byName(tools, "build_toys").inputSchema as { properties: { toys: { items: unknown } } };
    expect(letter.properties.wishes.items).toEqual(build.properties.toys.items);
  });

  it("marks only the letter as read-only and declares no false hints", () => {
    const { tools } = fakeApp();
    expect(tools.map((t) => [t.name, t.annotations])).toEqual([
      ["open_letter", { readOnlyHint: true }],
      ["build_toys", undefined],
      ["load_sleigh", undefined],
      ["empty_sack", undefined],
    ]);
  });
});

describe("build_toys", () => {
  it("builds the toys it is given", async () => {
    const { app, tools } = fakeApp();
    const toys = [{ toy: "train", colour: "red" }, { toy: "kite", colour: "gold" }];
    await byName(tools, "build_toys").execute({ toys }, client);
    expect(app.buildToys).toHaveBeenCalledWith(toys);
  });

  it("resolves an actionable error, building nothing, when any toy is unknown", async () => {
    const { app, tools } = fakeApp();
    for (const toys of [[], [{ toy: "pony", colour: "red" }], [{ toy: "train", colour: "red" }, { toy: "train" }], "train"]) {
      const result = await byName(tools, "build_toys").execute({ toys }, client);
      expect(result).toMatchObject({ code: "INVALID_TOY", retryable: true });
    }
    expect(app.buildToys).not.toHaveBeenCalled();
  });
});

describe("load_sleigh", () => {
  it("passes the name and chimney through, treating missing ones as empty", async () => {
    const { app, tools } = fakeApp();
    await byName(tools, "load_sleigh").execute({ to: "Maya", address: "1 Holly Road, Oslo" }, client);
    await byName(tools, "load_sleigh").execute({}, client);
    expect(app.loadSleigh.mock.calls).toEqual([["Maya", "1 Holly Road, Oslo"], ["", ""]]);
  });
});

describe("registerTools", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("registers every tool with the given signal", () => {
    const registerTool = vi.fn(async (_tool: WebMCP.ModelContextTool, _options?: { signal?: AbortSignal }) => {});
    vi.stubGlobal("document", { modelContext: { registerTool } });
    const signal = new AbortController().signal;
    registerTools(fakeApp().app as unknown as WorkshopApp, signal);
    expect(registerTool.mock.calls.map(([tool, options]) => [tool.name, options])).toEqual([
      ["open_letter", { signal }],
      ["build_toys", { signal }],
      ["load_sleigh", { signal }],
      ["empty_sack", { signal }],
    ]);
  });

  it("does nothing without WebMCP", () => {
    vi.stubGlobal("document", {});
    expect(() => registerTools(fakeApp().app as unknown as WorkshopApp)).not.toThrow();
  });
});
