import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { search } from "../../src/modules/submersibles/logic/voyage/search.ts";
import { createAdvisor } from "../../src/modules/submersibles/logic/voyage.ts";
import { legacyApi, loadData, mulberry32 } from "./ref.ts";

// Audit gap (b): the advisor search's FINAL ordering `b.score - a.score || a.ev.seconds - b.ev.seconds`.
// Real scores are floats and rarely tie, so these tests call the ported search() directly with constant
// and coarse score functions to force ties: equal scores with different seconds (the tie-break decides)
// and equal scores with equal seconds (insertion order must be kept). A planted flipped tie-break
// (`b.ev.seconds - a.ev.seconds`) on a temp copy must be caught. Port advise() vs the frozen legacy
// ADVISOR is also compared on seeded inputs (the legacy search itself is not exposed on ADVISOR).

const CC = process.cwd();
const SEED = 0xb0a12d;
const LOGIC = join(CC, "src", "modules", "submersibles", "logic");

const legacy = legacyApi();
const D = loadData();
legacy.ADVISOR.init(D);
const adv = createAdvisor(D);
const st = adv.stats(
	145,
	[0, 1, 2, 3].map((i) => D.parts[i].id),
) as any;
assert.ok(st, "stats for rank 145 must be computable");

console.log(
	`audit-advisor-sort seed: ${SEED.toString(16)} tz: ${process.env.TZ || "(system)"}`,
);

const pool = D.sectors.filter((s: any) => s.sea === D.seas[0].id);

function orderingOk(res: any[]): void {
	for (let i = 1; i < res.length; i++) {
		const a = res[i - 1];
		const b = res[i];
		assert.ok(
			a.score > b.score ||
				(a.score === b.score && a.ev.seconds <= b.ev.seconds),
			`order violated at ${i}: ${JSON.stringify({ a: a.score, as: a.ev.seconds, b: b.score, bs: b.ev.seconds })}`,
		);
	}
}

test("audit advisor sort: constant score forces ties; order is score desc, then seconds ASC, stable", () => {
	const res = search(pool as any, st as any, () => 42) as any[];
	assert.ok(res.length > 5, "expected several candidates");
	assert.ok(
		res.every((c) => c.score === 42),
		"all scores tie",
	);
	orderingOk(res);
	// with all scores tied the result must be sorted by seconds ascending
	const secs = res.map((c) => c.ev.seconds);
	assert.deepEqual(
		secs,
		secs.slice().sort((x, y) => x - y),
		"seconds not ascending",
	);
	// a stable re-sort with the same comparator is a fixed point (equal scores + equal seconds keep order)
	const again = res
		.slice()
		.sort((a, b) => b.score - a.score || a.ev.seconds - b.ev.seconds);
	assert.deepEqual(again, res, "not a stable-sort fixed point");
	// equal-seconds candidates exist and keep their relative order (no reordering among full ties)
	const groups = new Map<number, number>();
	for (const c of res)
		groups.set(c.ev.seconds, (groups.get(c.ev.seconds) || 0) + 1);
	const tied = [...groups.values()].some((n) => n > 1);
	assert.ok(
		tied,
		"expected at least one pair of candidates with equal score AND equal seconds",
	);
});

test("audit advisor sort: coarse score creates many ties; ordering property holds on seeded pools", () => {
	const rand = mulberry32(SEED);
	for (let i = 0; i < 500; i++) {
		const seaId = D.seas[Math.floor(rand() * D.seas.length)].id;
		let p = D.sectors.filter((s: any) => s.sea === seaId);
		const keep = 1 + Math.floor(rand() * p.length);
		p = p.slice(0, keep);
		if (!p.length) continue;
		const coarse =
			rand() < 0.5
				? () => 7
				: (_r: number[], ev: any) => Math.round(ev.exp / 100);
		const res = search(p as any, st as any, coarse as any) as any[];
		orderingOk(res);
	}
});

test("audit advisor sort: seeded advise() port == frozen legacy ADVISOR", () => {
	const rand = mulberry32(SEED ^ 0x5eed);
	for (let i = 0; i < 500; i++) {
		const discovered: number[] = [];
		const n = 1 + Math.floor(rand() * 20);
		for (let j = 0; j < n; j++) {
			const s = D.sectors[Math.floor(rand() * D.sectors.length)];
			if (!discovered.includes(s.id)) discovered.push(s.id);
		}
		const input = {
			sub: {
				fcId: "fc0",
				slot: 1 + Math.floor(rand() * 4),
				rank: [1, 30, 80, 145][Math.floor(rand() * 4)],
				parts: [0, 1, 2, 3].map((k) =>
					rand() < 0.8 ? D.parts[Math.floor(rand() * D.parts.length)].id : null,
				),
			},
			fc: {
				unlockedSlots: 1 + Math.floor(rand() * 4),
				discovered,
			},
			slotsFilled: Math.floor(rand() * 5),
			pending: discovered.filter(() => rand() < 0.2),
		};
		const a = JSON.stringify(adv.advise(input as any));
		const b = JSON.stringify(legacy.ADVISOR.advise(input));
		assert.equal(a, b, `advise seed case ${i}`);
	}
});

test("audit advisor sort: planted flipped tie-break on a temp copy of search is caught", async () => {
	const srcPath = join(LOGIC, "voyage", "search.ts");
	const src = readFileSync(srcPath, "utf8");
	const from =
		"out.sort((a, b) => b.score - a.score || a.ev.seconds - b.ev.seconds);";
	const to =
		"out.sort((a, b) => b.score - a.score || b.ev.seconds - a.ev.seconds);";
	assert.ok(src.includes(from), "search.ts: anchor not found");
	// plant at logic/ root (outside the voyage/ subfolder) with the import path adjusted, so the
	// split-proof test's file list is never racing this temp copy
	const tmpPath = join(LOGIC, "search.controltmp.ts");
	writeFileSync(
		tmpPath,
		src.replaceAll('"../voyage.ts"', '"./voyage.ts"').replace(from, to),
	);
	try {
		const tmpMod = "search.controltmp.ts";
		const N = await import(`../../src/modules/submersibles/logic/${tmpMod}`);
		const good = search(pool as any, st as any, () => 42) as any[];
		const bad = N.search(pool as any, st as any, () => 42) as any[];
		assert.ok(
			good.length > 5 && bad.length === good.length,
			"same candidate set",
		);
		assert.notEqual(
			JSON.stringify(bad),
			JSON.stringify(good),
			"flipped tie-break NOT caught: equal-score different-seconds order identical",
		);
		// the mutant sorts seconds DESCENDING on ties
		const badSecs = bad.map((c: any) => c.ev.seconds);
		assert.deepEqual(
			badSecs,
			badSecs.slice().sort((x: number, y: number) => y - x),
			"mutant shape",
		);
		console.log(
			`audit-advisor-sort: planted flipped tie-break caught (first good seconds ${good[0].ev.seconds}, mutant ${bad[0].ev.seconds})`,
		);
	} finally {
		rmSync(tmpPath, { force: true });
	}
	assert.throws(() => readFileSync(tmpPath), "temp copy left behind");
});
