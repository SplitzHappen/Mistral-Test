import assert from "node:assert/strict";
import { test } from "node:test";

import {
	CHECK_ORDER,
	checkChars,
	checkDoc,
	checkModules,
	clean,
	emptyDoc,
	mergeModules,
} from "../../src/base/connector/index.ts";

// Saved example documents: fixed inputs, exact expected outputs, pinned before the phase-3 core port.

test("pinned: the checker table order is atelier, submersibles, settings", () => {
	assert.deepEqual([...CHECK_ORDER], ["atelier", "submersibles", "settings"]);
});

test("pinned: generic cleaning runs before each checker and for unknown sections", () => {
	// hostile input: __proto__ key, a 30k string, a 6k array, depth 12, wrong types
	const hostile = JSON.parse(
		'{"atelier":' +
			JSON.stringify({
				chars: {
					c1: {
						stats: { j0: { level: 999, craftsmanship: -5 } },
						food: { id: 1 },
					},
					__proto__: { polluted: true },
				},
				saved: { m1: { name: "x".repeat(30000) } },
				prefs: { solver: 5, bogus: 1 },
			}) +
			',"unknown-mod":{"big":"' +
			"y".repeat(30000) +
			'","arr":' +
			JSON.stringify(new Array(6000).fill(1)) +
			',"deep":' +
			JSON.stringify({
				a: {
					b: {
						c: { d: { e: { f: { g: { h: { i: { j: { k: { l: 1 } } } } } } } } },
					},
				},
			}) +
			'},"tracker":{"kept":"raw"}}',
	);
	const out = checkModules(hostile);
	assert.equal(
		(out.atelier as { saved: Record<string, { name: string }> }).saved.m1.name
			.length,
		20000,
	); // cut at 20,000
	assert.equal((out["unknown-mod"] as { big: string }).big.length, 20000);
	assert.equal((out["unknown-mod"] as { arr: number[] }).arr.length, 5000); // arrays cut at 5,000
	{
		const keys = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
		let cur = (out["unknown-mod"] as { deep: Record<string, unknown> }).deep;
		for (const k of keys) cur = cur[k] as Record<string, unknown>;
		assert.equal(cur.j, null); // a value deeper than 10 levels is nulled
	}
	assert.equal(
		(out.atelier as { prefs: Record<string, unknown> }).prefs.solver,
		5,
	);
	assert.equal(
		"bogus" in (out.atelier as { prefs: Record<string, unknown> }).prefs,
		false,
	); // PREFS whitelist
	// biome-ignore lint/suspicious/noProto: testing that the __proto__ key is dropped
	assert.equal(
		Object.hasOwn(
			(out.atelier as { chars: Record<string, unknown> }).chars,
			"__proto__",
		),
		false,
	);
	assert.equal(
		(Object.prototype as Record<string, unknown>).polluted,
		undefined,
	); // no prototype pollution
	assert.equal("tracker" in out, false); // the Tracker's section never enters checkModules
	// the checker ran on the CLEANED value: level clamped to 100, craftsmanship floored at 1
	const c1 = (
		out.atelier as {
			chars: Record<
				string,
				{ stats: { j0: { level: number; craftsmanship: number } } }
			>;
		}
	).chars.c1;
	assert.equal(c1.stats.j0.level, 100);
	assert.equal(c1.stats.j0.craftsmanship, 1);
});

test("pinned: the Tracker pass-through keeps its section raw, unchecked, uncleaned", () => {
	const doc = {
		app: "eveniunt-command-center",
		v: 1,
		updated: 123,
		chars: [{ id: "c1", name: "Ann" }],
		modules: {
			tracker: {
				v: 1,
				chars: [{ id: "c1", name: "Ann" }],
				ticks: { c1: { "a:1": 1 } },
				weird: { deep: { __proto__: 1 } },
				long: "z".repeat(50000),
			},
			submersibles: {
				fcs: { f1: { name: "My FC", charId: "c1", unlockedSlots: 2 } },
			},
		},
		device: {},
		moved: {},
	};
	const out = checkDoc(doc);
	assert.deepEqual(out.modules.tracker, doc.modules.tracker); // byte-for-byte the same object, never cleaned
	assert.equal((out.modules.tracker as { long: string }).long.length, 50000); // not cut: pass-through
	assert.deepEqual(out.chars, [
		{ id: "c1", name: "Ann", lodestone: null, gc: null },
	]);
	assert.ok(out.modules.submersibles);
});

test("pinned: checkDoc throws on foreign saves and flags newer versions", () => {
	assert.throws(() => checkDoc({ app: "other" }), /not a Command Center save/);
	assert.throws(
		() => checkDoc({ app: "eveniunt-command-center", v: 0 }),
		/unknown save version/,
	);
	let err: unknown = null;
	try {
		checkDoc({ app: "eveniunt-command-center", v: 99 });
	} catch (e) {
		err = e;
	}
	assert.equal((err as { code?: string }).code, "newer");
});

test("pinned: characters are checked as every module sees them", () => {
	const out = checkChars([
		{ id: "c1", name: "  Ann   Lee ", lodestone: "12345", cls: "gla", gc: 2 },
		{ id: "c1", name: "dup" }, // duplicate id dropped
		{ id: "c9", name: "bad id" }, // not c1..c8
		{ id: "c2", name: "", city: "lim" }, // empty name -> id; city kept when no cls
	]);
	assert.deepEqual(out, [
		{ id: "c1", name: "Ann Lee", lodestone: "12345", cls: "gla", gc: 2 },
		{ id: "c2", name: "c2", lodestone: null, city: "lim", gc: null },
	]);
});

test("pinned: saved example submersibles section checks to the exact shape", () => {
	const raw = {
		fcs: {
			f1: {
				name: "  My   FC ",
				world: "Moogle",
				charId: "c1",
				order: 3,
				unlockedSlots: 4,
				discovered: [1, 2, 2, 999, 31],
			},
		},
		subs: {
			s1: {
				fcId: "f1",
				slot: 1,
				name: "The Whale",
				rank: 10,
				expIntoRank: 500,
				parts: [3, 4, 1, 2],
				voyage: {
					sentAt: 1000,
					route: [1, 2, 3, 4, 5, 6],
					returnAt: 2000,
					calcAt: 1999,
					gameSaid: "ok",
				},
			},
			bad: { slot: 1 }, // no fcId: dropped, never guessed
		},
		trips: {
			t1: {
				s: "s1",
				t: 1000,
				r: [1, 2],
				back: 2000,
				items: [
					[5, 2],
					["x", 1],
				],
				newSectors: [7],
				rankAfter: 11,
				rankCalc: 10,
			},
		},
		settings: {
			prefs: {
				sort: "fc",
				grouping: "auto",
				night: "quiet",
				quietHours: { from: 1320, to: 480 },
				window: { from: 0, to: 60 },
				priceWorld: "Moogle",
			},
		},
	};
	const out = checkModules({ submersibles: raw }).submersibles as {
		fcs: Record<string, Record<string, unknown>>;
		subs: Record<string, Record<string, unknown>>;
		trips: Record<string, { items: unknown[] }>;
	};
	assert.deepEqual(out.fcs.f1, {
		name: "My FC",
		world: "Moogle",
		charId: "c1",
		order: 3,
		unlockedSlots: 4,
		discovered: [1, 2],
	});
	assert.deepEqual(out.subs.s1, {
		fcId: "f1",
		slot: 1,
		name: "The Whale",
		rank: 10,
		expIntoRank: 500,
		parts: [3, 4, 1, 2],
		voyage: {
			sentAt: 1000,
			route: [1, 2, 3, 4, 5],
			returnAt: 2000,
			calcAt: 1999,
			gameSaid: "ok",
		},
	});
	assert.equal("bad" in out.subs, false);
	assert.deepEqual(out.trips.t1.items, [[5, 2]]); // the malformed item is dropped
});

test("pinned: unit merge keeps clashes local and takes one-sided changes", () => {
	const base = {
		submersibles: { fcs: { f1: { name: "A" }, f2: { name: "B" } } },
	};
	const local = {
		submersibles: { fcs: { f1: { name: "A-local" }, f2: { name: "B" } } },
	}; // whole section written; f1 changed locally
	const remote = {
		submersibles: {
			fcs: { f1: { name: "A-remote" }, f2: { name: "B" }, f3: { name: "C" } },
		},
	}; // f1 changed remotely (clash), f3 new
	const merged = mergeModules(base, local, remote) as {
		submersibles: { fcs: Record<string, { name: string }> };
	};
	assert.equal(merged.submersibles.fcs.f1.name, "A-local"); // clash: local wins
	assert.equal(merged.submersibles.fcs.f2.name, "B"); // unchanged locally: kept
	assert.equal(merged.submersibles.fcs.f3.name, "C"); // only remote: taken
	assert.equal("tracker" in merged.submersibles, false);
});

test("pinned: clean limits are exactly strings 20,000, arrays 5,000, depth 10", () => {
	assert.equal((clean("x".repeat(20001)) as string).length, 20000);
	assert.equal((clean("x".repeat(20000)) as string).length, 20000);
	assert.equal((clean(new Array(5001).fill(0)) as unknown[]).length, 5000);
	let deep: unknown = 1;
	for (let i = 0; i < 12; i++) deep = { a: deep };
	let deepExpected: unknown = { a: null }; // a value deeper than 10 levels is nulled
	for (let i = 0; i < 10; i++) deepExpected = { a: deepExpected };
	assert.deepEqual(clean(deep), deepExpected);
	let ok: unknown = 1;
	for (let i = 0; i < 10; i++) ok = { a: ok };
	assert.deepEqual(clean(ok), ok);
	assert.equal(clean(Number.POSITIVE_INFINITY), null);
	assert.equal(clean(undefined), null);
});

test("pinned: emptyDoc shape", () => {
	assert.deepEqual(emptyDoc(), {
		app: "eveniunt-command-center",
		v: 1,
		updated: 0,
		chars: [],
		modules: {},
		device: {},
		moved: {},
	});
});
