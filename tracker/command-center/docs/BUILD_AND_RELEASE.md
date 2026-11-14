# Build and release

The published site is `tracker/command-center/site/`, built by `tracker/command-center/build.js`
from `src/` (shell, settings, submersibles pages, icons, `sw.js`) — run from the repo root:

```
node tracker/command-center/build.js
```

`build.js` REWRITES tracked files (`site/`, `evidence/`). After every run:

```
git checkout -- tracker/command-center/site tracker/command-center/evidence
```

The repo's build expects the Atelier at `../ffxiv-cosmic-crafting-solver`; in this repo it lives in
`crafting/`, so at the repo root:

```
ln -s crafting ffxiv-cosmic-crafting-solver
echo ffxiv-cosmic-crafting-solver >> .git/info/exclude
```

`node tracker/command-center/check.js` is the Playwright smoke (needs Chromium; `PORT` is preset in
some sandboxes, e.g. run with `PORT=8418`). It also rewrites `site/`/`evidence/` — restore them as above.

## The typed base's own build

From `tracker/command-center/`:

```
npm ci                 # exact pins from package-lock.json (preact 11.2.0; dev: vite 8.3.8,
                       # typescript 7.0.2, @biomejs/biome 2.6.7, pixelmatch 8.0.0, pngjs 7.0.0,
                       # preact-render-to-string 6.8.3)
npm run build          # vite build → dist/ (build-only; not part of the published site yet)
npm run check          # typecheck + lint + tests
```

## Release gate for Stage 1 work

1. `./VERIFY.sh` from the repo root passes (installs, `npm run check`, legacy suites redirected and
   unredirected, differential suites in three time zones, controls, additive checks).
2. `git status --short | grep -v '^??'` prints nothing after committing.
3. `git diff --name-status b4d02a3 | grep -v '^A'` prints nothing (strictly additive vs BASE).
4. `node tracker/command-center/build.js` leaves `git status --short` empty (after restoring
   `site/`/`evidence/` if check.js ran).
