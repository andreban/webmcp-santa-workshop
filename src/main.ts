/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import "./style.css";
import { WorkshopApp } from "./app";
import { registerTools } from "./tools";

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
