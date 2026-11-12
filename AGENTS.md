# AGENTS.md

A festive WebMCP demo for bandarra.me/apps. Plain TypeScript and Vite, no framework.

- Run `npm test && npm run build` before every push. Pushes to `main` deploy.
- Write and review WebMCP tools with the `build-webmcp-tools` skill in
  `.agents/skills/` (`.claude/skills` links to it): budgets, "What + When"
  descriptions, opt-in annotations, `outputSchema` only where it pays off,
  and errors resolved as `{ error, code, retryable }`, never thrown.
- Keep the rules in `src/workshop.ts` free of the DOM so they stay testable.
