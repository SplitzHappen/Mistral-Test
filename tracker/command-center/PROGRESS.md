# Stage 1 progress

BASE = b4d02a3 (branch `stage1`). T = tracker/, CC = tracker/command-center/.

## Environment notes (this sandbox)
- node v22.23.4, npm 10.9.8, git 2.47.3.
- Symlink done: repo root `ffxiv-cosmic-crafting-solver -> crafting`, added to `.git/info/exclude`.
- `node CC/restore-build-inputs.js` ran once (gitignored outputs only).
- `PORT` is preset to 3030 by the sandbox and collides with the sandbox executor: run check.js with `PORT=8418`.
- Playwright installed at repo root with `npm install --no-save --no-package-lock playwright`; Chromium headless shell needs libs fetched as debs into /tmp/chromium-libs plus fontconfig: run with
  `LD_LIBRARY_PATH=/tmp/chromium-libs/usr/lib/x86_64-linux-gnu:/tmp/chromium-libs/usr/lib FONTCONFIG_PATH=/tmp/chromium-libs/etc/fonts FONTCONFIG_FILE=fonts.conf XDG_DATA_HOME=/tmp/chromium-libs/usr/share`
  (without fontconfig Chromium dies with `FATAL: SkFontMgr_FontConfigInterface.cpp:163`).

## Baseline (raw, at BASE)
- `node tests/core.test.js` from T: `# tests 76 # pass 76 # fail 0`
- `node tests/helper.test.js`: `# tests 7 # pass 7 # fail 0`
- `node tests/submarines.test.js`: `# tests 15 # pass 15 # fail 0`
- `node tests/earn.test.js`: `# tests 5 # pass 5 # fail 0`
- `node tracker/command-center/build.js` from root: rc=0, `git status --short` empty afterwards.
- `node tracker/command-center/check.js` (chromium, PORT=8418): `33/34 passed, 1 not run; evidence/checks.json written` — 33 PASS, 1 SKIP (C26b push service unreachable, expected), 1 FAIL C16 because `crafting/tools/publish-public.sh` (i.e. `ffxiv-cosmic-crafting-solver/tools/publish-public.sh`) does not exist in this repo at BASE or in its history; environmental, not caused by stage 1. After every build.js/check.js run: `git checkout -- tracker/command-center/site tracker/command-center/evidence`.

## Phase 1 — DONE
- Toolchain under CC: package.json (NO "type" field), package-lock.json, tsconfig.json (strict, erasableSyntaxOnly, allowImportingTsExtensions, NodeNext, includes only src/base, src/modules, build, tests, vite.config.ts; excludes tests/reference), biome.json (includes only new folders, `!tests/reference/**`), vite.config.ts (build-only; Vite 8 is rolldown-based so JSX is `oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } }`, NOT esbuild.jsx), CC/.gitignore.
- Pins: preact 11.2.0; dev vite 8.3.8, typescript 7.0.2 (tsc bin works, v7.0.2), @biomejs/biome 2.6.7, pixelmatch 8.0.0, pngjs 7.0.0, preact-render-to-string 6.8.3 (newest; peer `>=10 || >= 11.0.0-0` accepts preact 11.2.0).
- `npm run check` = typecheck + lint + `node --test "tests/**/*.test.ts"` (Node 22.23 strips types by default; ESM syntax auto-detected). Smoke: src/base/env.ts + tests/env.test.ts (2 tests: env injectability, preact render-to-string). `# pass 2 # fail 0`.
- `npm ci` from clean node_modules: ok. `npm run build` (vite build): `dist/env.js` built.
- Additive checks after phase: `git status --short | grep -v '^??'` empty; `git diff --name-status b4d02a3 | grep -v '^A'` empty.

## Next
Phase 2: CC/src/base/connector/ (manifest contract, registry, connect()).
