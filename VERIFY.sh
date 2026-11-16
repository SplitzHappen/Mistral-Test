#!/usr/bin/env bash
# Stage 1 acceptance: from a clean checkout of the stage1 branch, rerun every acceptance command.
# Exits non-zero on any failure. Run from the repo root: ./VERIFY.sh
set -u
cd "$(dirname "$0")"
ROOT="$PWD"
BASE=b4d02a3
CC=tracker/command-center
T=tracker
fail=0
step() { echo; echo "=== $*"; }
check() { if [ "$1" -ne 0 ]; then echo "FAILED: $2"; fail=1; fi }

step "repo setup (Atelier symlink)"
[ -e ffxiv-cosmic-crafting-solver ] || ln -s crafting ffxiv-cosmic-crafting-solver
grep -q '^ffxiv-cosmic-crafting-solver$' .git/info/exclude 2>/dev/null || echo ffxiv-cosmic-crafting-solver >> .git/info/exclude
(cd "$T" && node command-center/restore-build-inputs.js) ; check $? "restore-build-inputs"

step "npm ci + npm run check (typecheck + lint + tests)"
(cd "$CC" && npm ci) ; check $? "npm ci"
(cd "$CC" && npm run check) ; check $? "npm run check"

step "submersibles differential suites, three time zones"
for tz in UTC America/Los_Angeles Pacific/Auckland; do
  (cd "$CC" && TZ=$tz node --test "tests/submersibles/differential.test.ts") ; check $? "TZ=$tz differential"
done

step "audit control tests (planted mutants); time-mattering ones in three time zones"
for tz in UTC America/Los_Angeles Pacific/Auckland; do
  (cd "$CC" && TZ=$tz node --test --test-timeout=300000 tests/submersibles/audit-clock.test.ts tests/submersibles/audit-quiet.test.ts tests/shell/shell-differential.test.ts) ; check $? "TZ=$tz audit clock/quiet/shell-differential"
done
(cd "$CC" && node --test --test-timeout=300000 tests/core/audit-depth.test.ts tests/submersibles/audit-advisor-sort.test.ts tests/shell/reference.test.ts) ; check $? "audit depth/advisor-sort/shell reference"

step "legacy suites (unredirected and via preload)"
(cd "$T" && node tests/core.test.js) ; check $? "core"
(cd "$T" && node tests/helper.test.js) ; check $? "helper"
(cd "$T" && node tests/submarines.test.js) ; check $? "submarines"
(cd "$T" && node tests/earn.test.js) ; check $? "earn"
(cd "$T" && node --require ./command-center/tests/core/preload.js tests/core.test.js) ; check $? "core via preload"
(cd "$T" && node --require ./command-center/tests/submersibles/preload.js tests/earn.test.js) ; check $? "earn via preload"

step "additive checks"
out=$(git status --short | grep -v '^??' || true)
[ -z "$out" ] ; check $? "git status --short | grep -v '^??' printed: $out"
out=$(git diff --name-status "$BASE" | grep -v '^A' || true)
[ -z "$out" ] ; check $? "git diff --name-status $BASE | grep -v '^A' printed: $out"

step "legacy build leaves a clean tree"
node "$CC/build.js" ; check $? "build.js"
out=$(git status --short | grep -v '^??' || true)
[ -z "$out" ] ; check $? "build.js dirtied tree: $out"
git checkout -- "$CC/site" "$CC/evidence" 2>/dev/null || true

echo
if [ "$fail" -ne 0 ]; then echo "VERIFY: FAILURES above"; exit 1; fi
echo "VERIFY: all green"
