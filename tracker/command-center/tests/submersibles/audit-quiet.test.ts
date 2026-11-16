import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import * as alerts from "../../src/modules/submersibles/logic/alerts.ts";
import { legacyApi, mulberry32, REF } from "./ref.ts";

// Audit gap (d): quiet hours. Mutants: inQuiet `m >= q.from || m < q.to` -> `m > q.from || m < q.to`
// (wrap-midnight branch) and quietEnd `d.getTime() <= t` -> `< t`. Cases: exactly at the from minute,
// one minute either side, exactly at the to minute, one minute either side, exactly at the quiet-end
// instant and 1 ms either side, from === to, wrap and non-wrap windows, and through the alert plan
// (alerts() with night "quiet"), port vs the frozen legacy push.js (inQuiet/quietEnd extracted from the
// reference copy's own text; the plan compared via legacy PUSH.alerts). TZ per process: UTC,
// America/Los_Angeles, Pacific/Auckland.

const CC = process.cwd();
const LOGIC = join(CC, "src", "modules", "submersibles", "logic");
const SEED = 0x9017e7;
const MIN = 60000;

const legacy = legacyApi();
console.log(
	`audit-quiet seed: ${SEED.toString(16)} tz: ${process.env.TZ || "(system)"}`,
);

// extract inQuiet/quietEnd from the frozen reference push.js (they are internal there)
function extractPushFn(name: string): any {
	const src = readFileSync(join(REF, "push.js"), "utf8");
	const marker = `function ${name}(`;
	const at = src.indexOf(marker);
	if (at < 0) throw new Error(`push.js: ${name} not found`);
	let i = src.indexOf("{", at);
	let depth = 0;
	let end = -1;
	for (; i < src.length; i++) {
		if (src[i] === "{") depth++;
		else if (src[i] === "}") {
			depth--;
			if (depth === 0) {
				end = i + 1;
				break;
			}
		}
	}
	if (end < 0) throw new Error(`push.js: ${name} unterminated`);
	const fnText = src.slice(at, end);
	return new Function(`${fnText}\nreturn ${name};`)();
}
const legacyInQuiet = extractPushFn("inQuiet");
const legacyQuietEnd = extractPushFn("quietEnd");

// local time on a fixed day at h:m
const at = (h: number, m: number, s = 0, ms = 0) =>
	new Date(2026, 5, 15, h, m, s, ms).getTime();

const WRAP = { from: 22 * 60, to: 6 * 60 }; // 22:00 -> 06:00, wraps midnight
const PLAIN = { from: 9 * 60, to: 17 * 60 }; // 09:00 -> 17:00, no wrap
const SAME = { from: 10 * 60, to: 10 * 60 }; // from === to

test("audit quiet: inQuiet port == legacy extracted from reference push.js on boundary minutes", () => {
	const times = [
		at(22, 0),
		at(21, 59),
		at(22, 1), // exactly from, one either side (wrap)
		at(6, 0),
		at(5, 59),
		at(6, 1), // exactly to, one either side (wrap)
		at(0, 0),
		at(12, 0),
		at(23, 59),
		at(9, 0),
		at(8, 59),
		at(9, 1), // exactly from, one either side (plain)
		at(17, 0),
		at(16, 59),
		at(17, 1), // exactly to, one either side (plain)
		at(10, 0),
		at(10, 1),
		at(9, 59), // from === to window
	];
	for (const q of [WRAP, PLAIN, SAME]) {
		for (const t of times) {
			assert.equal(
				alerts.inQuiet(t, q),
				legacyInQuiet(t, q),
				`inQuiet(${new Date(t).toString()}, ${JSON.stringify(q)})`,
			);
		}
	}
	// explicit boundary expectations
	assert.equal(
		alerts.inQuiet(at(22, 0), WRAP),
		true,
		"exactly at from (wrap) is quiet",
	);
	assert.equal(alerts.inQuiet(at(21, 59), WRAP), false);
	assert.equal(alerts.inQuiet(at(22, 1), WRAP), true);
	assert.equal(
		alerts.inQuiet(at(6, 0), WRAP),
		false,
		"exactly at to (wrap) is not quiet",
	);
	assert.equal(alerts.inQuiet(at(5, 59), WRAP), true);
	assert.equal(alerts.inQuiet(at(6, 1), WRAP), false);
	assert.equal(alerts.inQuiet(at(9, 0), PLAIN), true);
	assert.equal(alerts.inQuiet(at(17, 0), PLAIN), false);
	assert.equal(
		alerts.inQuiet(at(10, 0), SAME),
		false,
		"from === to is never quiet",
	);
	assert.equal(alerts.inQuiet(at(10, 0), SAME), legacyInQuiet(at(10, 0), SAME));
});

test("audit quiet: quietEnd port == legacy on the quiet-end instant and 1 ms either side", () => {
	for (const q of [WRAP, PLAIN]) {
		const toH = Math.floor(q.to / 60);
		const toM = q.to % 60;
		const endInstant = at(toH, toM); // today at exactly `to`
		for (const t of [
			endInstant - 1,
			endInstant,
			endInstant + 1,
			at(toH, toM, 0, 500),
			endInstant + MIN,
		]) {
			assert.equal(
				alerts.quietEnd(t, q),
				legacyQuietEnd(t, q),
				`quietEnd(${new Date(t).toString()}, ${JSON.stringify(q)})`,
			);
		}
		// exactly at the quiet-end instant: original `<=` rolls to the next day; 1 ms before, the end
		// is still ahead so it stays today; 1 ms after, it has passed so it rolls over
		assert.equal(
			alerts.quietEnd(endInstant, q),
			endInstant + DAY_FOR(q),
			"end instant rolls over",
		);
		assert.equal(
			alerts.quietEnd(endInstant - 1, q),
			endInstant,
			"1 ms before stays today",
		);
		assert.equal(
			alerts.quietEnd(endInstant + 1, q),
			endInstant + DAY_FOR(q),
			"1 ms after rolls over",
		);
	}
});
function DAY_FOR(q: { from: number; to: number }): number {
	const d0 = at(Math.floor(q.to / 60), q.to % 60);
	const d1 = new Date(d0);
	d1.setDate(d1.getDate() + 1);
	return d1.getTime() - d0;
}

function mkSec(
	returnAts: number[],
	opts: { unlocked?: number; fcName?: string } = {},
): any {
	const subs: any = {};
	returnAts.forEach((r, i) => {
		subs[`s${i}`] = {
			fcId: "fc0",
			slot: i + 1,
			name: `Sub ${i + 1}`,
			voyage: { returnAt: r },
		};
	});
	return {
		fcs: {
			fc0: { name: opts.fcName || "Alpha", unlockedSlots: opts.unlocked ?? 4 },
		},
		subs,
		trips: {},
		settings: {},
	};
}

test("audit quiet: through the alert plan — port alerts() == legacy PUSH.alerts() with quiet hours", () => {
	const now = at(12, 0);
	const base = at(20, 0);
	const cases: [number[], any, any][] = [
		[
			[base + 2 * 60 * MIN, base + 30 * MIN],
			{ night: "quiet", quietHours: WRAP, grouping: "sub" },
			() => "final",
		],
		[
			[at(22, 0), at(6, 0), at(5, 59), at(6, 1)],
			{ night: "quiet", quietHours: WRAP, grouping: "fc" },
			() => "final",
		],
		[
			[at(9, 0), at(17, 0), at(16, 59)],
			{ night: "quiet", quietHours: PLAIN, grouping: "fleet" },
			() => "final",
		],
		[
			[at(10, 0), at(10, 1)],
			{ night: "quiet", quietHours: SAME, grouping: "sub" },
			() => "final",
		],
		[
			[base + 5 * MIN],
			{ night: "loud", quietHours: WRAP, grouping: "sub" },
			() => "final",
		],
		[[base + 5 * MIN], {}, () => "unlock"],
	];
	for (const [ras, prefs, stageOf] of cases) {
		const sec = mkSec(ras);
		assert.equal(
			JSON.stringify(alerts.alerts(sec, prefs, stageOf as any, now)),
			JSON.stringify(legacy.PUSH.alerts(sec, prefs, stageOf, now)),
			`alerts plan ${JSON.stringify(prefs)}`,
		);
	}
	// seeded plans
	const rand = mulberry32(SEED);
	for (let i = 0; i < 1000; i++) {
		const n = 1 + Math.floor(rand() * 5);
		const ras: number[] = [];
		for (let j = 0; j < n; j++) {
			const h = Math.floor(rand() * 24);
			const m = Math.floor(rand() * 60);
			ras.push(at(h, m) + Math.floor(rand() * 3) * DAY_SAFE());
		}
		const q =
			rand() < 0.4
				? WRAP
				: rand() < 0.5
					? PLAIN
					: { from: Math.floor(rand() * 1440), to: Math.floor(rand() * 1440) };
		const prefs = {
			night: rand() < 0.7 ? "quiet" : "loud",
			quietHours: q,
			grouping: ["auto", "sub", "fc", "fleet"][Math.floor(rand() * 4)],
		};
		const stageOf = () => ["unlock", "gil", "final"][Math.floor(rand() * 3)];
		const sec = mkSec(ras, { unlocked: 1 + Math.floor(rand() * 4) });
		assert.equal(
			JSON.stringify(alerts.alerts(sec, prefs, stageOf, now)),
			JSON.stringify(legacy.PUSH.alerts(sec, prefs, stageOf, now)),
			`seeded plan ${i}`,
		);
	}
});
function DAY_SAFE(): number {
	return 24 * 60 * MIN;
}

test("audit quiet: planted inQuiet/quietEnd mutants on temp copies of alerts.ts are caught", async () => {
	const srcPath = join(LOGIC, "alerts.ts");
	const src = readFileSync(srcPath, "utf8");
	const faults: [string, string, string][] = [
		[
			"inQuiet from-minute",
			": m >= q.from || m < q.to;",
			": m > q.from || m < q.to;",
		],
		[
			"quietEnd end-instant",
			"if (d.getTime() <= t) d.setDate(d.getDate() + 1);",
			"if (d.getTime() < t) d.setDate(d.getDate() + 1);",
		],
	];
	for (const [fi, [label, from, to]] of faults.entries()) {
		assert.ok(src.includes(from), `alerts.ts: anchor not found for ${label}`);
		// a distinct temp filename per fault: node caches modules by path, so reusing one name
		// would return the previous mutant
		const tmpName = `alerts.controltmp${fi}.ts`;
		const tmpPath = join(LOGIC, tmpName);
		writeFileSync(tmpPath, src.replace(from, to));
		try {
			const N = await import(`../../src/modules/submersibles/logic/${tmpName}`);
			if (label.startsWith("inQuiet")) {
				// exactly at the from minute of a wrap window: original quiet, mutant not
				assert.notEqual(
					N.inQuiet(at(22, 0), WRAP),
					legacyInQuiet(at(22, 0), WRAP),
					`${label} NOT caught at the from minute`,
				);
				assert.equal(legacyInQuiet(at(22, 0), WRAP), true);
				// and through the alert plan
				const sec = mkSec([at(22, 0)]);
				const prefs = { night: "quiet", quietHours: WRAP, grouping: "sub" };
				assert.notEqual(
					JSON.stringify(N.alerts(sec, prefs, () => "final", at(12, 0))),
					JSON.stringify(
						legacy.PUSH.alerts(sec, prefs, () => "final", at(12, 0)),
					),
					`${label} NOT caught through the alert plan`,
				);
				console.log(
					`audit-quiet: planted ${label} caught (inQuiet at from-minute + through alerts plan)`,
				);
			} else {
				const endInstant = at(6, 0);
				assert.notEqual(
					N.quietEnd(endInstant, WRAP),
					legacyQuietEnd(endInstant, WRAP),
					`${label} NOT caught at the quiet-end instant`,
				);
				// 1 ms either side must NOT differ from legacy (only the exact instant discriminates)
				assert.equal(
					N.quietEnd(endInstant - 1, WRAP),
					legacyQuietEnd(endInstant - 1, WRAP),
				);
				assert.equal(
					N.quietEnd(endInstant + 1, WRAP),
					legacyQuietEnd(endInstant + 1, WRAP),
				);
				assert.equal(
					legacyQuietEnd(endInstant, WRAP),
					endInstant + DAY_FOR(WRAP),
				);
				// through the alert plan: quietEnd(at) only differs from legacy when at is exactly the
				// to-o'clock instant, and inQuiet is false there, so a held alert never hits that case —
				// the plan output must still match legacy, and the direct call above is what catches it
				const sec = mkSec([at(23, 0), at(5, 59), endInstant]);
				const prefs = { night: "quiet", quietHours: WRAP, grouping: "sub" };
				const planN = JSON.stringify(
					N.alerts(sec, prefs, () => "final", at(12, 0)),
				);
				const planL = JSON.stringify(
					legacy.PUSH.alerts(sec, prefs, () => "final", at(12, 0)),
				);
				assert.equal(planN, planL, `${label}: plan disagrees with legacy`);
				console.log(
					`audit-quiet: planted ${label} caught by the direct quietEnd call at the end instant (${N.quietEnd(endInstant, WRAP)} vs legacy ${legacyQuietEnd(endInstant, WRAP)}); through the alert plan the outputs match legacy (${planL}) because inQuiet is false exactly at the to-minute`,
				);
			}
		} finally {
			rmSync(tmpPath, { force: true });
		}
	}
	for (const [fi] of faults.entries())
		assert.throws(
			() => readFileSync(join(LOGIC, `alerts.controltmp${fi}.ts`)),
			"temp copy left behind",
		);
});
