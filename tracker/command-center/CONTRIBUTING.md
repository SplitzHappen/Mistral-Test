# Contributing (Stage 1 rules)

1. Read `ARCHITECTURE.md`, `PROGRESS.md` (phase log, ODDITIES, ASSUMPTIONS), and `docs/TESTING.md`.
2. Never modify legacy tracked files (`src/shell.js`, `src/settings.js`, `src/submersibles/*.js`,
   `tracker/src/**`, `crafting/**`). All new work goes under `tracker/command-center/` in the new
   folders (`src/base`, `src/modules`, `build`, `tests`, `docs`) plus `package.json`, lockfile,
   config files, `.gitignore`.
3. After each phase: `git status --short | grep -v '^??'` and
   `git diff --name-status b4d02a3 | grep -v '^A'` must print nothing (run after committing).
4. Never run build or format tools over legacy files: tsconfig/biome are scoped to the new folders.
   Never add a `"type"` field to `package.json` (it breaks every existing CommonJS `.js` file).
5. Ports are call-for-call (arithmetic, rounding, tie-breaking, texts, fallbacks, error codes, key
   order). Record weaknesses under ODDITIES in `PROGRESS.md`; never fix them in a port.
6. Every ported legacy file gets a byte-for-byte copy in `tests/reference/` with a sha256 test against
   `git show b4d02a3:<path>`; differential tests use that frozen copy as the reference side.
7. One planted fault per module on a temporary copy, caught, tree clean (`tests/**/control.test.ts`).
8. Tests are `.ts` with explicit `.ts` import extensions; no network, no sleeps; seeded generators
   print their seed.
9. Commit after each phase with the test summary line in the message; update `PROGRESS.md` so a new
   session can resume. Stop at a phase boundary if you cannot continue honestly.
10. `./VERIFY.sh` from the repo root must pass before any stage is called done.
