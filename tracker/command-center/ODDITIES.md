# Oddities found while porting and testing (stage 1)

Each entry names the file and function. "Both sides" means the frozen legacy reference
(`tests/reference/...`, sha256-pinned to BASE b4d02a3) and the typed port behave the same way —
these are properties of today's code, not port bugs.

1. **Calendar line folding throws on characters outside the basic plane** —
   `src/modules/submersibles/logic/calendar.ts` `fold()` (port of `FLEET.ics`'s `fold` in
   `src/submersibles/fleet.js`). `unescape(encodeURIComponent(ch))` throws `URIError: URI malformed`
   for any astral character (e.g. an emoji in the event title) or lone surrogate, on BOTH the legacy
   and the port (verified: both throw `URIError` for `"A😀B"` and for a lone `"\uD83D"`). The
   differential test compares the thrown errors instead of output
   (`tests/submersibles/differential.test.ts`, calendar family).

2. **The save cleaner's depth cut only bites containers** —
   `src/base/core/save.ts` `clean()` (and its twin `src/base/connector/checkers.ts` `clean()`).
   Scalars (strings/numbers/booleans/null) are returned before the `if (depth > 10) return null;`
   check, so a scalar at depth 11 survives; only an object/array at depth 11 or deeper is cut to
   `null`. The audit-depth tests use marker-carrying containers at depths 9–12 to pin this
   (`tests/core/audit-depth.test.ts`).

3. **The quietEnd `<` vs `<=` boundary is unobservable through the alert plan** —
   `src/modules/submersibles/logic/alerts.ts` `quietEnd()` (port of `push.js`'s `quietEnd`).
   `quietEnd(at)` differs between `d.getTime() <= t` and `< t` only when `at` is exactly the
   to-o'clock instant, and `inQuiet` is false exactly there, so `alerts()` never calls `quietEnd`
   with such an `at` — the mutant is caught only by the direct `quietEnd` call
   (`tests/submersibles/audit-quiet.test.ts`, planted-mutant test prints both outputs).

4. **The advisor's search is not exposed on the legacy ADVISOR global** —
   `src/submersibles/advisor.js` keeps `search` inside its closure; only `advise` reaches it. The
   port's split exposes `search` from `logic/voyage/search.ts` so tests can force score ties with a
   constant/coarse score function (`tests/submersibles/audit-advisor-sort.test.ts`); parity with the
   legacy closure is covered through `advise` in `tests/submersibles/differential.test.ts`.
