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
- `node tracker/command-center/check.js` (chromium, PORT=8418) re-run on stage1-fix (2026-11-16, this sandbox; playwright + chromium headless shell installed at repo root, trixie debs fetched with apt into /tmp/chromium-libs, run with `LD_LIBRARY_PATH=/tmp/chromium-libs/usr/lib/x86_64-linux-gnu:/tmp/chromium-libs/lib FONTCONFIG_PATH=/tmp/chromium-libs FONTCONFIG_FILE=fonts.conf XDG_DATA_HOME=/tmp/chromium-libs/usr/share`): RAW RESULT — two runs, each printed exactly `PASS C1 The shell is not cross-origin isolated ...` then aborted at check.js:174 (`atelierState`, check C2) with `page.waitForLoadState: Target page, context or browser has been closed`; a diagnostic run showed the browser process exiting with `signal=SIGTRAP` when the Atelier page loads. So of the 34 checks: 1 passed (C1), 0 failed, 33 not run (the suite aborts on the browser crash), rc=1 both times. NOT VERIFIED here: Chromium launches and the shell page works, but the browser dies on the Atelier page in this sandbox, so the earlier session's `33/34 passed, 1 not run` (33 PASS, 1 SKIP C26b push service unreachable, 1 FAIL C16 because `crafting/tools/publish-public.sh` does not exist in this repo at BASE or in its history — environmental, not caused by stage 1) could not be reproduced. After every build.js/check.js run: `git checkout -- tracker/command-center/site tracker/command-center/evidence`.

## Phase 1 — DONE
- Toolchain under CC: package.json (NO "type" field), package-lock.json, tsconfig.json (strict, erasableSyntaxOnly, allowImportingTsExtensions, NodeNext, includes only src/base, src/modules, build, tests, vite.config.ts; excludes tests/reference), biome.json (includes only new folders, `!tests/reference/**`), vite.config.ts (build-only; Vite 8 is rolldown-based so JSX is `oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } }`, NOT esbuild.jsx), CC/.gitignore.
- Pins: preact 11.2.0; dev vite 8.3.8, typescript 7.0.2 (tsc bin works, v7.0.2), @biomejs/biome 2.6.7, pixelmatch 8.0.0, pngjs 7.0.0, preact-render-to-string 6.8.3 (newest; peer `>=10 || >= 11.0.0-0` accepts preact 11.2.0).
- `npm run check` = typecheck + lint + `node --test "tests/**/*.test.ts"` (Node 22.23 strips types by default; ESM syntax auto-detected). Smoke: src/base/env.ts + tests/env.test.ts (2 tests: env injectability, preact render-to-string). `# pass 2 # fail 0`.
- `npm ci` from clean node_modules: ok. `npm run build` (vite build): `dist/env.js` built.
- Additive checks after phase: `git status --short | grep -v '^??'` empty; `git diff --name-status b4d02a3 | grep -v '^A'` empty.

## Next
Phase 2: CC/src/base/connector/ (manifest contract, registry, connect()).

## Phase 2 — DONE
- CC/src/base/connector/: manifest.ts (contract validation: unknown fields refused incl. save sub-fields; raw only for tracker; contract must be 1), checkers.ts (PINNED table order atelier→submersibles→settings; clean() before each checker; tracker pass-through raw in checkDoc; ports of checkChars/checkAtelier/checkSubmersibles/checkSettings/checkModules/checkDoc/flatModules/unflatModules/mergeModules), store.ts (SaveStore iface + MemoryStore with writeSection merge semantics), connect.ts (section get/merged-set/subscribe, read-only characters, base-owned settings section, device storage on 'eveniunt-command-center-device', notify, nav from the page's known place, env), registry.ts (tracker+atelier manifest-only, submersibles real, example never listed), index.ts (public API).
- CC/src/modules/{submersibles,tracker,atelier,example}/manifest.ts. Submersibles summary/alerts/badge are small initial pure functions — phase 4 differential-tests them against legacy FLEET (legacy wins).
- Tests: tests/connector/{manifest,checkers,connect,registry,import-boundary}.test.ts = 30 tests. Import boundary: modules may only import their own folder or src/base/connector/.
- `npm run check`: rc=0, `# tests 30 # pass 30 # fail 0` (typecheck tsc 7.0.2 + biome + node --test). Biome: 1 warning 1 info, 0 errors.
- Legacy suites unchanged: core 76/7/15/5 pass 0 fail (76/7/15/5).
- Additive: `git diff --name-status b4d02a3 | grep -v '^A'` empty; tracked tree clean after commit.

## Phase 3 — DONE
- CC/src/base/core/: typed transliterations of tracker/src/core/{save,model,codec,merge,cloud,storage}.js as {util,save,model,codec,merge,cloud,storage,compat,index}.ts. Explicit imports replace the CC/ET globals; clock/randomness via env (setEnv); mutable legacy props exposed via setters (save.setKind, storage.set*, cloud.limits.CLOUD_MAX_BYTES, ...).
- compat.ts installs globalThis.CC/ET with the exact legacy key order (captured empirically via vm: CC 43 keys, ET 87 keys), defineProperty accessors for mutables, CLOUD_BASE non-enumerable at load.
- Reference copies: CC/tests/reference/core/{save,model,codec,merge,cloud,storage}.js byte-for-byte; tests/core/reference.test.ts verifies sha256 == `git show b4d02a3:tracker/src/core/<f>.js`.
- tests/core/preload.js (CJS) redirects Module._resolveFilename for the six legacy paths to compat.ts. `node --require tests/core/preload.js tests/core.test.js` from T: 76/76; unredirected: 76/76. ffxivcollect.js and links.js stay legacy.
- Tests: tests/core/{reference,compat,differential,control}.test.ts. Differential seed printed: 5eed1234 — checkers 25,000 + merges 25,000 seeded cases (hostile input incl. __proto__, huge strings, deep nesting, wrong types), codec 2,000 round trips/error codes, storage scenarios, scripted cloud exchanges; all equal old-vs-new by value and JSON text.
- Control: one planted fault per ported file on a temp copy (`<f>.controltmp.ts`, removed in finally; tree verified clean): save 20000->20001 cut, model percent /10->/100, codec join(".")->join(","), merge clash local->remote wins, cloud 412->413, storage storedRev === -> !==. All six caught.
- `npm run check`: rc=0, `# tests 40 # pass 40 # fail 0` (typecheck + biome 0 errors + node --test).
- Legacy suites from T: core 76/76, helper 7/7, submarines 15/15, earn 5/5; core via preload 76/76.
- Additive after commit: `git status --short | grep -v '^??'` empty; `git diff --name-status b4d02a3 | grep -v '^A'` empty.

## Next
Phase 4: CC/src/modules/submersibles/logic/ pure port of tracker/src/submersibles/{fleet,advisor,push,earn}.js + pure helpers of subs.js; differential >=2,000 seeded cases per family in TZ=UTC/America/Los_Angeles/Pacific/Auckland; calendar file byte-equal; controls; submarines 15 + earn 5 + core 76 via compat.

## Phase 4 — DONE
- CC/src/modules/submersibles/logic/: data.ts (types), time.ts (parseDuration/parseBackAt/localInput/status/fmtDur/fmtClock/fleet/summary/subLabel/newId(injected random)/tripId), calendar.ts (ics byte-for-byte/fileName), voyage.ts (createAdvisor: stats/evalRoute/rankAfter/afterVoyage/children/sectorName/routeText/STEPS/advise), alerts.ts (GROUPINGS/modes/alerts/inQuiet/quietEnd/hm), earn.ts (createEarn: name/merchant/tradable/routeLoot/history/unitValue/tripValue/totals/csv/archive(now param)/restore), page.ts (subs.js pure helpers: classCode/partsCode/partsTitle/sectorShort/routeText/startSectors/slotUnlock/sectorLabel/minutes/hhmm/fmtGil/fcList/subsOf/pendingFor(now)/slotsFilled/stageOf/confirmation/applyFinds/logTrip). No document/window/storage/Date.now()/argument-less new Date()/Math.random() in logic/ — now and id maker are parameters; toLocaleString('en') and local-hour reads kept call for call. compat.ts installs FLEET/ADVISOR/PUSH/EARN globals in the exact legacy key order (captured via vm); impure keys (startAlerts/download/chime/device*, PUSH helper calls, EARN cached/fetchPrices) ported in compat.ts, not in logic/.
- Reference: CC/tests/reference/submersibles/{fleet,advisor,push,earn,subs}.js byte-for-byte; tests/submersibles/reference.test.ts sha256 == `git show b4d02a3:...` (5 files) + Object.keys(FLEET/ADVISOR/PUSH/EARN) equality legacy-vm vs compat.
- tests/submersibles/preload.js redirects the four legacy script paths to logic/compat.ts: `node --require ... tests/earn.test.js` from T: 5/5 (plain also 5/5); core.test.js via phase-3 preload 76/76; submarines 15/15; helper 7/7.
- tests/submersibles/differential.test.ts: seed 5eed5ab5, printed with TZ; per family 2,000 seeded cases (time, calendar, voyage, advisor, alerts, earn, page) + fixed cases for every branch; equal by JSON text and deep (JSON-normalized, vm prototypes differ); run per process TZ=UTC / America/Los_Angeles / Pacific/Auckland: 9/9 each. Calendar .ics compared byte-for-byte (astral chars make fold() throw URIError on BOTH sides — compared as thrown errors; ODDITY). Mutating helpers (applyFinds/logTrip) compared as resulting document JSON text, key order included. subs.js helpers compared by extracting each function's own text from the frozen subs.js and evaluating against a stand-in scope (method printed per function in the test output).
- tests/submersibles/control.test.ts: one planted fault per logic module on a temp copy (time fmtDur ceil->floor, calendar fold 74->75, voyage distanceFactor floor->round, alerts STRAGGLER 30->31, earn tax floor->round, page discovered sort reversed), all 6 caught, tree verified clean.
- `npm run check`: rc=0, `# tests 52 # pass 52 # fail 0` (tsc + biome 0 errors + node --test).
- Additive after commit: `git status --short | grep -v '^??'` empty; `git diff --name-status b4d02a3 | grep -v '^A'` empty.

## Next
Phase 5: CC/src/base/theme/ — the 21 themes as data, look-applier, appearance panel logic; differential vs legacy look.js for every theme x both modes x every option; Atelier keeps its own 20 themes/key.

## Phase 5 — DONE
- CC/src/base/theme/: themes.ts (THEMES = the Atelier's 20 + the tracker's inserted 'electrope-skyline' = 21, ACCENTS, blankSide/defaultLook/lookFromDoc), color.ts (hexRgb/rgbHex/lum/mix), look.ts (themeOf/sideFor/isDark/resolved/lookVars = everything applyLook() sets: CSS vars, data-theme, zoom, data-motion), panel.ts (esc/chip/swatchDot/themeOpt/picker/themeBlock/appearanceHtml + pure action logic clickAction/changeSeparate/changeLookn/contrastInput/pickerInput/exportThemeJson/parseImport/applyImport). The Atelier keeps its own 20 themes and key — not unified.
- Reference: CC/tests/reference/theme/atelier.js byte-for-byte (sha256 == `git show b4d02a3:crafting/atelier/src/atelier.js`); tests/theme/ref.ts rebuilds the exact slice tracker/tools/build.js inlines (same markers, same SOLUTION_NINE insertion, asserts 21 themes) and evaluates it against a stand-in page (S/load/window/document/box).
- tests/theme/differential.test.ts: seed 7e5e11 printed. look values: all 21 themes x {system,light,dark} x mqDark{false,true} with default options, plus 5,000 seeded option cases (accent incl. custom hex, bg/fg overrides incl. invalid hex — both sides throw, compared; contrast/fonts/motion/separate) compared as the exact var map applyLook sets + data-theme + zoom + data-motion. Panel HTML: 2,000 seeded states x open menus, appearanceHtml compared as text. Panel actions: 2,000 sequences x 6 actions driven through legacy bindAppearance handlers vs clickAction & co, state compared by JSON text after every step. Export/import theme JSON: 500 cases. All equal by JSON text and deep.
- tests/theme/control.test.ts: one planted fault per theme module on a temp copy (electrope-skyline progress colour off by one, lum coefficient 0.0722->0.0723, contrast k 0.9->0.91, tick glyph) — all 4 caught, tree clean.
- `npm run check`: rc=0, `# tests 61 # pass 61 # fail 0`.
- Additive after commit: `git status --short | grep -v '^??'` empty; `git diff --name-status b4d02a3 | grep -v '^A'` empty.

## Next
Phase 6: docs — ARCHITECTURE.md, docs/ADDING_A_MODULE.md, docs/SAVE_FORMAT.md (table of every storage name), docs/TESTING.md, docs/BUILD_AND_RELEASE.md, CONTRIBUTING.md. Every command and path must exist. Then VERIFY.sh at repo root.

## Phase 6 — DONE
- Docs under CC: ARCHITECTURE.md, docs/ADDING_A_MODULE.md, docs/SAVE_FORMAT.md (table of every storage
  name: IDB eveniunt-command-center/save/main + main-rev, LS eveniunt-command-center-save, legacy
  eveniunt-tracker/state/main + eveniunt-tracker-state (read-only), eveniunt-tracker-ui,
  eveniunt-in-app, eveniunt-tracker-fired, eveniunt-cloud-device, eveniunt-command-center-device,
  eveniunt-subs-prices, sessionStorage eveniunt-subs-ui/-push/-reloaded; save doc shape, EVT1/EVT2
  codes, error codes), docs/TESTING.md, docs/BUILD_AND_RELEASE.md, CONTRIBUTING.md. Every command and
  path in them verified to exist.
- VERIFY.sh at repo root: npm ci, npm run check, submersibles differential x 3 TZs, legacy suites
  (unredirected + both preloads), additive checks, build.js clean-tree check; exits non-zero on
  failure. Raw result: rc=0, "VERIFY: all green" (npm run check 61/61; differential 9/9 x 3 TZs;
  legacy 76/7/15/5 and 76/5 via preload).

## Next
Phase 7 (stretch, only with Playwright working): throwaway copy of the repo, rebuild shell +
Submersibles screens in Preact under lib/, check.js 33/34 + pixel/DOM comparison. Otherwise stop here
honestly.

## Phase 7 (stretch) — ATTEMPTED IN THROWAWAY COPY ONLY, NOT COMPLETED
- Gate was met: VERIFY.sh green; Playwright Chromium installed this session (`npx playwright install chromium --only-shell`); `PORT=8418 node tracker/command-center/check.js` with the /tmp/chromium-libs env: `33/34 passed, 1 not run` (matches baseline; tree restored after).
- Rehearsal in /tmp/stage1-rehearsal (full copy of the repo, never committed): Preact component `lib/home.tsx` for the home screen, built with the pinned Vite (automatic JSX runtime, preact import source) + preact-render-to-string 6.8.3. Markup vs legacy `src/index.html` home block: equal after tag-whitespace normalization (only difference: `<rect/>` vs `<rect></rect>` serialization — same parsed DOM).
- Browser proof (chromium headless shell, throwaway site served on 127.0.0.1): screenshot byte-equal legacy vs Preact-home at 390/768/1920 (`pixels equal = true` at all three widths; DOM outerHTML differs only in whitespace/dynamic fills).
- NOT DONE: rebuilding the main menu, main Settings and the Submersibles screens; swapping the served site; deterministic build into site/ with the sw.js FILES line intact; check.js 33/34 against the new output; pixel+DOM comparison in several save states with a planted-difference proof. Stopped here honestly — the remaining screens are large (subs.js 926 lines of page code) and the zero-pixel bar across save states was not reached.

## Stage 1 fix (branch stage1-fix, tasks 1-4, 2026-11-16)
- Task 1 (file size): logic/voyage.ts, earn.ts, compat.ts split by responsibility into logic/voyage/{types,rank,search,advise}.ts, logic/earn/{types,items,report,archive}.ts, logic/compat/{device,sound,dom,start-alerts,fleet,advisor,push,earn}.ts; the three entry files stay and re-export everything they exported before (same compat globals, same key order). Disclosed hoists: the createAdvisor/createEarn closure variable `let D = data;` became module-level `let D: SubData;` (init assigns before any use), and compat.ts's `let audio` moved to compat/sound.ts. Proof: tests/submersibles/split-proof.test.ts (token-multiset comparison vs `git show ac6ae64:`; compat delta empty, voyage/earn delta exactly the D hoist) + tests/submersibles/split-size.test.ts (any file in logic/ > 320 lines fails; max is 282). `npm run check` 65/65 at that point.
- Task 2 (test gaps): new control tests killing the audit's four mutants, all planted on temp copies only: tests/core/audit-depth.test.ts (depth>11 in BOTH clean() ports, objects/arrays/mixed chains with containers at depths 9-12 through clean/checkModules/checkDoc, 2000 seeded, port vs legacy), tests/submersibles/audit-advisor-sort.test.ts (flipped tie-break in the search's final sort; search called with constant/coarse scores to force ties, 500 seeded pools + 500 seeded advise vs legacy), tests/submersibles/audit-clock.test.ts (Math.floor in fmtClock; DST days 2026-03-08/2026-11-01 LA and 2026-04-05/2026-09-27 Auckland + local-midnight grids + 2000 seeded, run per process in TZ=UTC/America/Los_Angeles/Pacific/Auckland; mutant caught in the DST zones — 13 fixed pairs differ — and gated off in UTC where round==floor), tests/submersibles/audit-quiet.test.ts (inQuiet from-minute and quietEnd end-instant mutants; boundary minutes, exact end instant +/-1ms, from===to, wrap/non-wrap, 1000 seeded alert plans vs legacy PUSH.alerts, 3 TZs). `npm run check` 82/82 with Task 3 included.
- Task 3 (manifest parity): new logic/shell.ts ports shell.js/fleet.js's pure pieces (esc, homeTileLine, fcOf, dueBanners = startAlerts' tick as a pure function of now/opened/shown-marks, bannerText); manifest summary/characterBadge/alerts.due call them, no duplicated logic; summary returns the same escaped tile HTML incl. "No free company yet". tests/reference/shell/shell.js sha256-pinned to BASE; tests/shell/shell-differential.test.ts runs legacy shell.js + startAlerts in a vm on a stand-in page (fake DOM/storage/timers/clock, cleared in an after hook) over 2000 seeded saves + fixed branches in 3 TZs, comparing tile line, character badges, banner texts, device marks and due by JSON text: all equal, no FOUND DEFECTS. Manifest contract tests stay green.
- Task 4 (report hygiene): baseline browser checks re-run raw result recorded in the Baseline section above (C1 PASS then browser SIGTRAP on the Atelier page; NOT VERIFIED in this sandbox). CC/ODDITIES.md lists the oddities (calendar fold URIError on astral chars on both sides; clean()'s depth cut only bites containers; quietEnd's <= boundary unobservable through the alert plan; legacy search not exposed on ADVISOR). package.json test script gained `--test-timeout=300000`; VERIFY.sh runs the new audit/shell suites (time-mattering ones in the three TZs).
