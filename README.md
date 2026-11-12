# WebMCP Santa's Workshop

A small, festive demo of [WebMCP](https://github.com/webmachinelearning/webmcp)
tools that chain: one tool's output is exactly what the next tool needs as
input, and every tool declares an `outputSchema` that says so.

Live at <https://bandarra.me/apps/webmcp-santa-workshop/>.

## The story

A child's letter sits on Santa's desk. It's random every time: a different
child, chimney address and wish list. To answer it:

1. `open_letter()` reads the letter and returns
   `{ child, chimney, wishes: [{ toy, colour }] }`.
2. `build_toy({ toy, colour })` builds one toy and puts it in the sack. Call
   it once for each item in `wishes`.
3. `load_sleigh({ to, address })` delivers the sack. It only leaves when
   `to` is the letter's `child`, `address` is its `chimney`, and the sack holds
   exactly the wished toys. Otherwise it returns `{ error, code }`.
4. `empty_sack()` clears the sack after a mistake.

Nothing in the letter can be typed in ahead of time, so the only way to win is
to feed `open_letter`'s output into the other tools. It's built to be put
together live in [WebMCP Macros](https://github.com/andreban/webmcp-macros):
one call, a *for each* over `wishes`, and one last call that maps `child` to
`to` and `chimney` to `address`.

## Requirements

Chrome with WebMCP enabled: the origin trial on bandarra.me, or
`chrome://flags/#enable-webmcp-testing` locally.

## Development

```bash
npm install
npm run dev     # local server
npm test        # unit tests for the workshop rules
npm run build   # type-check and build into dist/
```

| File | Responsibility |
| --- | --- |
| `src/workshop.ts` | The rules: random letters, the sack, the sleigh's checks. No DOM |
| `src/app.ts` | State and drawing, shared by the tools and the page's buttons |
| `src/tools.ts` | The WebMCP tools and their input and output schemas |

## Deployment

Every push to `main` runs the tests, builds, and syncs `dist/` to Cloud
Storage (`.github/workflows/deploy.yml`). The `production` environment holds
`GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCS_BUCKET` and `GCS_PREFIX`.
