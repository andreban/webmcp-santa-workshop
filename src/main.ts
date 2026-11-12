/**
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import "./style.css";
import { WorkshopApp } from "./app";
import { registerTools } from "./tools";

const app = new WorkshopApp();
app.render();
registerTools(app);

if (!document.modelContext) document.getElementById("no-webmcp")!.hidden = false;
