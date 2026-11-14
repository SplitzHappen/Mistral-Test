# Command Center — architecture (Stage 1)

The Eveniunt Command Center is a static, offline-first site (`site/`, built by `build.js` from `src/`).
Legacy plain-script pages (`src/shell.js`, `src/settings.js`, `src/submersibles/*.js`) share global
names (`CC`, `ET`, `FLEET`, `ADVISOR`, `PUSH`, `EARN`) and keep running unchanged. Stage 1 adds a small
typed base under this folder; nothing a user sees or hears changes.

## Layout

```
tracker/command-center/
  src/
    base/
      env.ts               injectable clock/randomness for tests
      connector/           module connector: manifest contract, registry, connect()
        manifest.ts        contract validation (unknown fields refused)
        checkers.ts        pinned checker table + generic cleaning
        store.ts           SaveStore iface + MemoryStore
        connect.ts         section/characters/settings/storage/notify/nav/env
        registry.ts        submersibles (real), tracker + atelier (manifest-only), example (never listed)
      core/                typed port of tracker/src/core/{save,model,codec,merge,cloud,storage}.js
        compat.ts          installs the same globalThis.CC/ET with the same key order
      theme/               the 21 themes as data, look applier, appearance panel logic
    modules/
      submersibles/        manifest.ts + logic/ (pure typed port of src/submersibles/*)
      tracker/, atelier/   manifest-only
      example/             example module, built and tested, never published
    shell.js, settings.js, submersibles/   legacy page code, frozen
  tests/
    reference/           byte-for-byte copies of the ported legacy files (sha256-checked vs BASE)
    core/ submersibles/ theme/ connector/   differential + control + reference tests
  package.json           exact pins, NO "type" field (keeps legacy CommonJS .js working)
  tsconfig.json          strict, erasableSyntaxOnly, scoped to the new folders only
  biome.json             lint/format scoped to the new folders only (tests/reference excluded)
  vite.config.ts         build-only (Vite's built-in JSX transform, preact import source)
```

## Rules that keep users unaffected

- Strictly additive: no tracked legacy file is modified; all new work lives under this folder.
- No new stored field; no change to any storage name, save format, published address, manifest id or scope.
- Ports are call-for-call: same arithmetic order, rounding, tie-breaking, texts, fallbacks, error codes,
  and object key creation order. Weaknesses found are recorded in PROGRESS.md under ODDITIES, never fixed.
- The two merges stay two; generic cleaning (strings 20,000 chars, arrays 5,000 items, depth 10) and every
  checker stay idempotent; storage fallbacks stay IndexedDB → localStorage → memory.
- Differential tests compare the new code against frozen reference copies (`tests/reference/`), never
  against itself; control tests plant one fault per module on a temporary copy and require it to be caught.

See `docs/ADDING_A_MODULE.md`, `docs/SAVE_FORMAT.md`, `docs/TESTING.md`, `docs/BUILD_AND_RELEASE.md`,
`CONTRIBUTING.md`, and `PROGRESS.md` (phase log, ODDITIES, ASSUMPTIONS).
