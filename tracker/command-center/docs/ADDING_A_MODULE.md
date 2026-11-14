# Adding a module

A module is a folder under `src/modules/` with a `manifest.ts` (data and pure functions only) plus its
logic. The connector (`src/base/connector/`) is the only way a module touches the save.

## Manifest contract

`connect(manifest)` (in `src/base/connector/connect.ts`) validates and refuses anything unknown:

- `contract: 1` (must be exactly 1)
- `id` — also the module's save section name (`modules.<id>`)
- `title`, `path`, `order: { menu, home }`
- `page: { isolated, ownWorker }`
- optional `home: { kicker, text, go, glyph }`
- save section: either `{ empty, check, describeUnit?, label? }` or `{ raw: true }` (Tracker only)
- `summary(doc, now)`, `characterBadge`, `characterFields`, `alerts: { due, link }`,
  `notifications: { describe }`, `credits`

Unknown manifest fields (including unknown save sub-fields) are refused.

## Registry

`src/base/connector/registry.ts` lists modules: `submersibles` real; `tracker` and `atelier`
manifest-only; `example` is built and tested but never published.

## What connect() gives a module

- `section`: `get`, merged `set`, `subscribe`
- `characters`: read-only
- `settings`: the base owns the shared settings section; its checker sits in the same table as the modules'
- device `storage`, `notify`, `nav` (site root and addresses worked out from the page's known place,
  never from a script address), `env`

## Rules

- Modules may not import each other or base internals (enforced by `tests/connector/import-boundary.test.ts`).
- Logic modules take `now` and an id maker as parameters: no `document`, `window`, storage,
  `Date.now()`, argument-less `new Date()`, or `Math.random()`.
- Tests are `.ts` files with explicit `.ts` import extensions; the reference side of differential tests
  is a frozen copy in `tests/reference/`, never the new code.
- Run `npm run check` (typecheck + lint + tests) from `tracker/command-center/`.
