import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import * as time from "../../src/modules/submersibles/logic/time.ts";
import { legacyApi, mulberry32 } from "./ref.ts";

// Audit gap (c): fmtClock's day difference `Math.round((day(d) - day(n)) / DAY)` (day = local midnight).
// Across a DST change the local-day span is 23h or 25h, so round and floor disagree; around local
// midnight the same applies to adjacent days. Run this file per process with TZ=UTC,
// America/Los_Angeles (DST 2026-03-08, 2026-11-01) and Pacific/Auckland (2026-04-05, 2026-09-27).
// In UTC every local-day span is a whole DAY, so round==floor there and the planted mutant is
// indistinguishable — that assertion is gated to the DST zones. Port vs the frozen legacy FLEET.

const CC = process.cwd();
const LOGIC = join(CC, "src", "modules", "submersibles", "logic");
const SEED = 0xc10c4;
const DAY = 24 * 3600000;
const TZ = process.env.TZ || "(system)";

const legacy = legacyApi();
console.log(`audit-clock seed: ${SEED.toString(16)} tz: ${TZ}`);

// local Date on a given calendar day at h:m (in the process zone)
const at = (y: number, mo: number, d: number, h = 0, m = 0, s = 0, ms = 0) =>
	new Date(y, mo, d, h, m, s, ms).getTime();

// the four DST dates named by the audit, as (monthIndex, day) local calendar dates
const DST_DATES = [
	[2, 8], // 2026-03-08 America/Los_Angeles spring forward
	[10, 1], // 2026-11-01 America/Los_Angeles fall back
	[3, 5], // 2026-04-05 Pacific/Auckland fall back
	[8, 27], // 2026-09-27 Pacific/Auckland spring forward
];

function zoneHasTransitionOn(mo: number, d: number): boolean {
	const a = at(2026, mo, d, 0, 0);
	const b = at(2026, mo, d + 1, 0, 0);
	return b - a !== DAY;
}
const hasDST = DST_DATES.some(([mo, d]) => zoneHasTransitionOn(mo, d));
console.log(
	`audit-clock: zone ${TZ} has a DST transition on one of the listed dates: ${hasDST}`,
);

function fixedPairs(): [number, number][] {
	const pairs: [number, number][] = [];
	for (const [mo, d] of DST_DATES) {
		const nows = [
			at(2026, mo, d - 1, 23, 30),
			at(2026, mo, d - 1, 12, 0),
			at(2026, mo, d - 1, 0, 1),
			at(2026, mo, d, 0, 30),
			at(2026, mo, d, 2, 30),
			at(2026, mo, d, 12, 0),
			at(2026, mo, d, 23, 59),
			at(2026, mo, d + 1, 0, 30),
		];
		const targets = [
			at(2026, mo, d, 0, 30),
			at(2026, mo, d, 23, 30),
			at(2026, mo, d - 1, 23, 30),
			at(2026, mo, d + 1, 12, 0),
			at(2026, mo, d + 2, 3, 0),
			at(2026, mo, d - 2, 12, 0),
		];
		for (const n of nows) for (const t of targets) pairs.push([t, n]);
	}
	// around local midnight in general (any day of 2026)
	for (const day of [at(2026, 0, 1), at(2026, 5, 15), at(2026, 11, 31)]) {
		const midnight = new Date(day).getDate();
		const mo = new Date(day).getMonth();
		const y = new Date(day).getFullYear();
		for (const dh of [-1, 0, 1])
			for (const [h, m] of [
				[0, 0],
				[0, 1],
				[23, 59],
				[12, 0],
			] as const)
				pairs.push([
					at(y, mo, midnight + dh, h, m),
					at(y, mo, midnight, 0, 30),
				]);
	}
	return pairs;
}

test("audit clock: fmtClock port == frozen legacy FLEET on fixed DST/midnight pairs and 2000 seeded pairs", () => {
	const pairs = fixedPairs();
	for (const [t, n] of pairs) {
		assert.equal(
			time.fmtClock(t, n),
			legacy.FLEET.fmtClock(t, n),
			`fmtClock(${new Date(t).toString()}, ${new Date(n).toString()})`,
		);
	}
	const rand = mulberry32(SEED);
	for (let i = 0; i < 2000; i++) {
		const n = at(2026, 0, 1) + Math.floor(rand() * 365 * DAY);
		const t = n + Math.floor((rand() - 0.5) * 14 * DAY);
		assert.equal(
			time.fmtClock(t, n),
			legacy.FLEET.fmtClock(t, n),
			`seed case ${i}`,
		);
	}
});

test("audit clock: planted Math.floor on a temp copy of time.ts is caught in DST zones (gated off in UTC)", async () => {
	const srcPath = join(LOGIC, "time.ts");
	const src = readFileSync(srcPath, "utf8");
	const from = "const diff = Math.round((day(d) - day(n)) / DAY);";
	const to = "const diff = Math.floor((day(d) - day(n)) / DAY);";
	assert.ok(src.includes(from), "time.ts: anchor not found");
	const tmpPath = join(LOGIC, "time.controltmp.ts");
	writeFileSync(tmpPath, src.replace(from, to));
	try {
		const tmpMod = "time.controltmp.ts";
		const N = await import(`../../src/modules/submersibles/logic/${tmpMod}`);
		let diffs = 0;
		let example = "";
		for (const [t, n] of fixedPairs()) {
			const mutant = N.fmtClock(t, n);
			const leg = legacy.FLEET.fmtClock(t, n);
			if (mutant !== leg) {
				diffs++;
				if (!example)
					example = `fmtClock(${new Date(t).toISOString()} local ${new Date(t).toString()}, now ${new Date(n).toString()}): legacy ${JSON.stringify(leg)} mutant ${JSON.stringify(mutant)}`;
			}
			// the unmutated port must agree with legacy everywhere
			assert.equal(
				time.fmtClock(t, n),
				leg,
				"unmutated port differs from legacy",
			);
		}
		if (hasDST) {
			assert.ok(diffs > 0, `floor mutant NOT caught in zone ${TZ}`);
			console.log(
				`audit-clock: planted Math.floor caught in ${TZ}: ${diffs} fixed pairs differ; first: ${example}`,
			);
		} else {
			assert.equal(
				diffs,
				0,
				`zone ${TZ} has no DST on the listed dates: floor mutant indistinguishable here (gated)`,
			);
			console.log(
				`audit-clock: zone ${TZ} has no DST transition on the listed dates; floor mutant indistinguishable here, assertion gated to DST zones`,
			);
		}
	} finally {
		rmSync(tmpPath, { force: true });
	}
	assert.throws(() => readFileSync(tmpPath), "temp copy left behind");
});
