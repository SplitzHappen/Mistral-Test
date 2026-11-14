# Testing

All from `tracker/command-center/` unless said otherwise. Node 22+ (type stripping), `npm ci` first.

## The typed base

```
npm run check          # typecheck (tsc) + lint (biome) + node --test "tests/**/*.test.ts"
npm run typecheck      # tsc --noEmit -p tsconfig.json
npm run lint           # biome check .
npm run test           # node --test "tests/**/*.test.ts"
npm run build          # vite build (build-only)
```

Suites:

- `tests/env.test.ts` — env injectability, preact render smoke.
- `tests/connector/` — manifest contract, pinned checker table, connect(), registry, import boundary.
- `tests/core/` — reference sha256, compat key order, differential (seeded, printed), controls;
  `tests/core/preload.js` redirects the six ported core files to `compat.ts` for legacy-suite runs.
- `tests/submersibles/` — same shape for the Submersibles logic; run the differential suite per
  process with `TZ=UTC`, `TZ=America/Los_Angeles`, `TZ=Pacific/Auckland`.
- `tests/theme/` — theme differential (every theme × modes × options) and controls.

## Legacy suites (from `tracker/`)

```
node tests/core.test.js                                        # 76
node tests/helper.test.js                                      # 7
node tests/submarines.test.js                                  # 15
node tests/earn.test.js                                        # 5
node --require ./command-center/tests/core/preload.js tests/core.test.js        # 76, via compat
node --require ./command-center/tests/submersibles/preload.js tests/earn.test.js # 5, via compat
```

## Controls

`tests/core/control.test.ts`, `tests/submersibles/control.test.ts`, `tests/theme/control.test.ts`
plant one fault per ported module on a temporary copy (same directory, removed in `finally`, tree
verified clean) and require a differential check to catch it.

## Repo-level acceptance

From the repo root: `./VERIFY.sh` reruns everything above plus the additive checks and exits
non-zero on any failure. Legacy build/check: `node tracker/command-center/build.js` and
`node tracker/command-center/check.js` (Playwright; after each run
`git checkout -- tracker/command-center/site tracker/command-center/evidence`).
