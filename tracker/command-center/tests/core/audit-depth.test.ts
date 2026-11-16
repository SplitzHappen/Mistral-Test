import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";
import * as conn from "../../src/base/connector/checkers.ts";
import * as save from "../../src/base/core/save.ts";

// Audit gap (a): the generic cleaning's depth cut. `if (depth > 10) return null;` in BOTH clean()
// ports (src/base/core/save.ts and src/base/connector/checkers.ts) must be pinned by tests that use
// nested objects AND arrays with a marker at depth 9, 10, 11 and 12, through clean() itself and through
// every checker that calls it (checkModules, checkDoc(device/moved)), port vs the frozen legacy reference.
// A planted `depth > 11` on a temp copy of each file must be caught.

const CC = process.cwd();
const FILES = ["save", "model", "codec", "merge", "cloud", "storage"];
const SEED = 0xa11ce5;

function legacyApi(): Record<string, any> {
	const sandbox: Record<string, unknown> = {};
	sandbox.globalThis = sandbox;
	for (const k of [
		"CompressionStream",
		"DecompressionStream",
		"Blob",
		"TextEncoder",
		"TextDecoder",
		"btoa",
		"atob",
		"URL",
		"URLSearchParams",
		"crypto",
		"BroadcastChannel",
		"console",
	])
		sandbox[k] = (globalThis as Record<string, unknown>)[k];
	createContext(sandbox);
	for (const f of FILES)
		runInContext(
			readFileSync(join(CC, "tests", "reference", "core", `${f}.js`), "utf8"),
			sandbox,
			{ filename: f },
		);
	return sandbox as Record<string, any>;
}

const L = legacyApi();
console.log(
	`audit-depth seed: ${SEED.toString(16)} tz: ${process.env.TZ || "(system)"}`,
);

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// A chain of n containers; the container at depth d carries its own marker M<d>, so the cleaned
// result shows exactly which container depths survived. Scalars are returned before the depth cut,
// so the cut only bites containers: a container at depth 11 is null under `depth > 10`.
// n = 13 gives containers at depths 0..12, covering 9, 10, 11 and 12.
function objChain(n: number): unknown {
	let v: unknown = "LEAF";
	for (let d = n - 1; d >= 0; d--) v = { k: v, [`d${d}`]: `M${d}` };
	return v;
}
function arrChain(n: number): unknown {
	let v: unknown = "LEAF";
	for (let d = n - 1; d >= 0; d--) v = [v, `M${d}`];
	return v;
}
function mixedChain(n: number, seed: () => number): unknown {
	let v: unknown = "LEAF";
	for (let d = n - 1; d >= 0; d--)
		v = seed() < 0.5 ? { k: v, [`d${d}`]: `M${d}` } : [v, `M${d}`];
	return v;
}

const CHAIN_N = 13; // containers at depths 0..12, covering 9, 10, 11 and 12

function checkDepthCut(
	label: string,
	portClean: (v: unknown) => unknown,
): void {
	for (const chain of [
		objChain(CHAIN_N),
		arrChain(CHAIN_N),
		mixedChain(CHAIN_N, mulberry32(SEED)),
	]) {
		const p = JSON.stringify(portClean(chain));
		const l = JSON.stringify(L.CC.clean(chain));
		assert.equal(p, l, `${label}: port ${p} != legacy ${l}`);
		// containers at depths 9 and 10 survive (their markers M9/M10 are present)...
		assert.ok(
			p.includes('"d9":"M9"') || p.includes('"M9"'),
			`${label}: depth 9 container kept`,
		);
		assert.ok(
			p.includes('"d10":"M10"') || p.includes('"M10"'),
			`${label}: depth 10 container kept`,
		);
		// ...the container at depth 11 is cut to null, so M11/M12 are gone
		assert.ok(
			!p.includes("M11") && !p.includes("M12"),
			`${label}: depth 11/12 containers null`,
		);
	}
}

test("audit depth: clean() keeps depth <= 10 and nulls depth 11/12, port == legacy (core and connector)", () => {
	checkDepthCut("core.save.clean", (v) => save.clean(v, 0));
	checkDepthCut("connector.checkers.clean", (v) => conn.clean(v, 0));
});

test("audit depth: through checkModules and checkDoc (device/moved), port == legacy", () => {
	for (const chain of [
		objChain(CHAIN_N),
		arrChain(CHAIN_N),
		mixedChain(CHAIN_N, mulberry32(SEED + 1)),
	]) {
		const arr = chain;
		const mods = { depthprobe: chain, other: arr };
		assert.equal(
			JSON.stringify(save.checkModules(mods)),
			JSON.stringify(L.CC.checkModules(mods)),
			`core checkModules chain`,
		);
		assert.equal(
			JSON.stringify(conn.checkModules(mods)),
			JSON.stringify(L.CC.checkModules(mods)),
			`connector checkModules chain`,
		);
		const doc = {
			app: save.APP,
			v: 1,
			updated: 5,
			chars: [],
			modules: {},
			device: chain,
			moved: arr,
		};
		assert.equal(
			JSON.stringify(save.checkDoc(doc)),
			JSON.stringify(L.CC.checkDoc(doc)),
			`core checkDoc chain`,
		);
		assert.equal(
			JSON.stringify(conn.checkDoc(doc)),
			JSON.stringify(L.CC.checkDoc(doc)),
			`connector checkDoc chain`,
		);
	}
});

// seeded random nested structures through clean + checkModules + checkDoc, port vs legacy
const rand = mulberry32(SEED);
const rint = (n: number) => Math.floor(rand() * n);
const KEYS = [
	"k",
	"j",
	"__proto__",
	"constructor",
	"a-b.c:d",
	"x".repeat(70),
	"ok",
];

function randNested(depth: number): unknown {
	if (depth <= 0 || rand() < 0.25) return rand() < 0.5 ? "MARK" : rint(1000);
	if (rand() < 0.5) {
		const o: Record<string, unknown> = {};
		const n = 1 + rint(3);
		for (let i = 0; i < n; i++)
			o[KEYS[rint(KEYS.length)] + i] = randNested(depth - 1);
		return o;
	}
	const a: unknown[] = [];
	const n = 1 + rint(3);
	for (let i = 0; i < n; i++) a.push(randNested(depth - 1));
	return a;
}

test("audit depth: 2000 seeded nested structures through clean/checkModules/checkDoc, port == legacy", () => {
	for (let i = 0; i < 2000; i++) {
		const v = randNested(6 + rint(10)); // depths 6..15, crossing the cut at 10/11
		assert.equal(
			JSON.stringify(save.clean(v, 0)),
			JSON.stringify(L.CC.clean(v)),
			`core clean seed case ${i}`,
		);
		assert.equal(
			JSON.stringify(conn.clean(v, 0)),
			JSON.stringify(L.CC.clean(v)),
			`connector clean seed case ${i}`,
		);
		const mods = {
			depthprobe: v,
			submersibles: { fcs: {}, subs: {}, trips: {}, settings: {} },
		};
		assert.equal(
			JSON.stringify(save.checkModules(mods)),
			JSON.stringify(L.CC.checkModules(mods)),
			`core checkModules seed case ${i}`,
		);
		assert.equal(
			JSON.stringify(conn.checkModules(mods)),
			JSON.stringify(L.CC.checkModules(mods)),
			`connector checkModules seed case ${i}`,
		);
		const doc = {
			app: save.APP,
			v: 1,
			updated: i,
			chars: [],
			modules: { depthprobe: v },
			device: v,
			moved: v,
		};
		assert.equal(
			JSON.stringify(save.checkDoc(doc)),
			JSON.stringify(L.CC.checkDoc(doc)),
			`core checkDoc seed case ${i}`,
		);
		assert.equal(
			JSON.stringify(conn.checkDoc(doc)),
			JSON.stringify(L.CC.checkDoc(doc)),
			`connector checkDoc seed case ${i}`,
		);
	}
});

test("audit depth: planted `depth > 11` on temp copies of BOTH clean() ports is caught", async () => {
	const targets = [
		{ dir: join(CC, "src", "base", "core"), file: "save.ts", mod: "save" },
		{
			dir: join(CC, "src", "base", "connector"),
			file: "checkers.ts",
			mod: "checkers",
		},
	];
	for (const t of targets) {
		const srcPath = join(t.dir, t.file);
		const src = readFileSync(srcPath, "utf8");
		const from = "if (depth > 10) return null;";
		const to = "if (depth > 11) return null;";
		assert.ok(src.includes(from), `${t.file}: anchor not found`);
		const tmpPath = join(t.dir, t.file.replace(/\.ts$/, ".controltmp.ts"));
		writeFileSync(tmpPath, src.replace(from, to));
		try {
			const N = await import(
				t.mod === "save"
					? "../../src/base/core/save.controltmp.ts"
					: "../../src/base/connector/checkers.controltmp.ts"
			);
			// the depth-11 marker survives under the mutant but is null in legacy -> caught
			const chain = objChain(CHAIN_N);
			const mutantClean = JSON.stringify(N.clean(chain, 0));
			const legacyClean = JSON.stringify(L.CC.clean(chain));
			assert.notEqual(
				mutantClean,
				legacyClean,
				`${t.file}: depth mutant NOT caught by clean()`,
			);
			assert.ok(
				mutantClean.includes("M11"),
				`${t.file}: mutant keeps the depth-11 container`,
			);
			assert.ok(
				!legacyClean.includes("M11"),
				`${t.file}: legacy cuts the depth-11 container`,
			);
			// through the checkers that call clean()
			const mods = { depthprobe: chain };
			assert.notEqual(
				JSON.stringify(N.checkModules(mods)),
				JSON.stringify(L.CC.checkModules(mods)),
				`${t.file}: depth mutant NOT caught by checkModules()`,
			);
			const doc = {
				app: save.APP,
				v: 1,
				updated: 1,
				chars: [],
				modules: {},
				device: chain,
				moved: arrChain(CHAIN_N),
			};
			assert.notEqual(
				JSON.stringify(N.checkDoc(doc)),
				JSON.stringify(L.CC.checkDoc(doc)),
				`${t.file}: depth mutant NOT caught by checkDoc()`,
			);
			// and the array chain at depth 11/12
			for (const chain2 of [
				objChain(CHAIN_N),
				arrChain(CHAIN_N),
				mixedChain(CHAIN_N, mulberry32(SEED + 2)),
			]) {
				assert.notEqual(
					JSON.stringify(N.clean(chain2, 0)),
					JSON.stringify(L.CC.clean(chain2)),
					`${t.file}: depth mutant NOT caught by chain`,
				);
			}
			console.log(
				`audit-depth: planted depth>11 in ${t.file} caught (clean, checkModules, checkDoc, obj/arr/mixed chains with containers at depths 9-12)`,
			);
		} finally {
			rmSync(tmpPath, { force: true });
		}
	}
	for (const t of targets) {
		const leftover = join(t.dir, t.file.replace(/\.ts$/, ".controltmp.ts"));
		assert.throws(() => readFileSync(leftover), "temp copy left behind");
	}
});
