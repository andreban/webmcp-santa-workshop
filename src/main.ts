/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import "./style.css";
import { WorkshopApp } from "./app";
import { registerTools } from "./tools";

/** Decorations only: a garland of bulbs and drifting snowflakes, hidden from assistive tech. */
function decorate(): void {
  const lights = document.getElementById("lights");
  const bulbs = Math.ceil(window.innerWidth / 48);
  lights?.replaceChildren(...Array.from({ length: bulbs }, () => document.createElement("li")));
  const snow = document.getElementById("snow");
  snow?.replaceChildren(
    ...Array.from({ length: 36 }, (_, i) => {
      const flake = document.createElement("span");
      flake.textContent = i % 3 === 0 ? "❅" : "❄";
      flake.style.left = `${(i * 37) % 100}%`;
      flake.style.fontSize = `${10 + ((i * 7) % 14)}px`;
      flake.style.animationDuration = `${9 + ((i * 5) % 11)}s`;
      flake.style.animationDelay = `-${(i * 13) % 20}s`;
      return flake;
    }),
  );
}

decorate();
const app = new WorkshopApp();
app.render();

if (document.modelContext) {
  // The page lives as long as its tools, so this is never aborted today; it is
  // here so a future view change can unregister them.
  const tools = new AbortController();
  registerTools(app, tools.signal);
} else {
  document.getElementById("no-webmcp")!.hidden = false;
}
