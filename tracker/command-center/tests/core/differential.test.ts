import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";
import * as cloud from "../../src/base/core/cloud.ts";
import * as codec from "../../src/base/core/codec.ts";
import * as merge from "../../src/base/core/merge.ts";
import * as model from "../../src/base/core/model.ts";
import * as save from "../../src/base/core/save.ts";

// Differential tests: old (frozen reference copies in tests/reference, run in a vm) vs new (the typed port).
// Seeded generators; the seed is printed. At least 50,000 comparisons for checkers and merges, hostile input
// included (__proto__, huge strings, deep nesting, wrong types).

const SEED = 0x5eed1234;
console.log(`differential seed: ${SEED.toString(16)}`);

function mulberry32(a: number) {
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const rng = mulberry32(SEED);
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const rint = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

const CC = process.cwd();
const _T = join(CC, "..");
const FILES = ["save", "model", "codec", "merge", "cloud", "storage"];

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
const LCC = L.CC;
const LET = L.ET;

// ---------------------------------------------------------------- seeded generators
const KEYS = [
	"a",
	"b",
	"c1",
	"f1",
	"__proto__",
	"constructor",
	"x:y",
	"n",
	"ok",
];
function randomValue(depth: number): unknown {
	const r = rng();
	if (depth > 4 || r < 0.3) {
		return pick([
			null,
			true,
			false,
			0,
			-1,
			1.5,
			Number.POSITIVE_INFINITY,
			NaN,
			"",
			"x".repeat(rint(1, 30)),
			"y".repeat(20001 + rint(0, 5000)), // over the 20,000 cut
			"plain",
			"a:1",
			undefined,
		]);
	}
	if (r < 0.65) {
		const n = rint(0, 8);
		const arr: unknown[] = [];
		for (let i = 0; i < n; i++) arr.push(randomValue(depth + 1));
		if (rng() < 0.05) for (let i = 0; i < 5001; i++) arr.push(1); // over the 5,000 cut
		return arr;
	}
	const o: Record<string, unknown> = {};
	const n = rint(0, 6);
	for (let i = 0; i < n; i++)
		o[pick(KEYS) + rint(0, 3)] = randomValue(depth + 1);
	return o;
}
function randomModules(): Record<string, unknown> {
	const mods: Record<string, unknown> = {};
	for (const name of [
		"atelier",
		"submersibles",
		"settings",
		"lists",
		"tracker",
		"weird name",
		"x",
	]) {
		if (rng() < 0.7) mods[name] = randomValue(0);
	}
	return mods;
}
function randomDoc(): unknown {
	return {
		app: rng() < 0.9 ? "eveniunt-command-center" : "other",
		v: pick([1, 1, 1, 2, 0, -1, 1.5, "x"]),
		updated: pick([0, 123, "x", null]),
		chars: Array.isArray(randomValue(0)) ? randomValue(0) : randomValue(0),
		modules: randomModules(),
		device: randomValue(1),
		moved: randomValue(1),
	};
}
function randomState(): model.State {
	const names = Array.from({ length: rint(1, 8) }, (_, i) =>
		pick(["A", `Character ${i + 1}`, "", "  spaced  name ", "x".repeat(50)]),
	);
	const st = model.newState(names);
	for (const c of st.chars) {
		for (let i = 0; i < rint(0, 5); i++)
			st.ticks[c.id][`mounts:${rint(1, 999)}`] = 1;
		for (let i = 0; i < rint(0, 3); i++)
			st.excl[c.id][`quests:${rint(1, 99)}`] = 1;
		for (let i = 0; i < rint(0, 3); i++)
			st.vals[c.id][`jobs:${rint(1, 9)}`] = rint(0, 9999);
		if (rng() < 0.3)
			st.avail[`mounts:${rint(1, 999)}`] = pick(["x", "ok", "bad"]);
	}
	st.settings = {
		countLimited: rng() < 0.5,
		countGone: rng() < 0.5,
		countUnknown: rng() < 0.5,
		links: rng() < 0.5,
		gold: rng() < 0.5,
	};
	if (rng() < 0.5) st.modules = randomModules();
	return model.validateState(JSON.parse(JSON.stringify(st)));
}

const TIME_KEYS = new Set(["updated", "at", "exp", "saved"]);
function norm(v: unknown): unknown {
	if (Array.isArray(v)) return v.map(norm);
	if (v && typeof v === "object") {
		const o: Record<string, unknown> = {};
		for (const [k, x] of Object.entries(v as Record<string, unknown>))
			o[k] = TIME_KEYS.has(k) ? 0 : norm(x);
		return o;
	}
	return v;
}
const j = (v: unknown) => JSON.stringify(norm(v));

function outcome(fn: () => unknown): {
	threw: boolean;
	value?: string;
	code?: unknown;
	message?: string;
} {
	try {
		return { threw: false, value: j(fn()) };
	} catch (e) {
		return {
			threw: true,
			code: (e as { code?: unknown }).code,
			message: (e as Error).message,
		};
	}
}

// ---------------------------------------------------------------- the comparisons
test("differential: checkers (checkDoc/checkModules/clean/checkChars), 25,000 seeded cases incl. hostile input", () => {
	let n = 0;
	for (let i = 0; i < 25000; i++) {
		const doc = randomDoc();
		assert.deepEqual(
			outcome(() => save.checkDoc(doc)),
			outcome(() => LCC.checkDoc(doc)),
			`checkDoc case ${i}`,
		);
		const mods = randomModules();
		assert.deepEqual(
			outcome(() => save.checkModules(mods)),
			outcome(() => LCC.checkModules(mods)),
			`checkModules case ${i}`,
		);
		const v = randomValue(0);
		assert.deepEqual(
			outcome(() => save.clean(v)),
			outcome(() => LCC.clean(v)),
			`clean case ${i}`,
		);
		n += 3;
	}
	console.log(`checkers comparisons: ${n}`);
	assert.ok(n >= 50000 - 25000, "checker count");
});

test("differential: merges (mergeModules/flatModules + threeWay/applyMerge), 25,000 seeded cases", () => {
	let n = 0;
	for (let i = 0; i < 20000; i++) {
		const base = randomModules();
		const local = randomModules();
		const remote = randomModules();
		assert.deepEqual(
			outcome(() => save.mergeModules(base, local, remote)),
			outcome(() => LCC.mergeModules(base, local, remote)),
			`mergeModules case ${i}`,
		);
		n++;
	}
	for (let i = 0; i < 5000; i++) {
		const b = randomState();
		const l = randomState();
		const r = randomState();
		const resL = LET.threeWay(b, l, r);
		const resN = merge.threeWay(b, l, r);
		assert.equal(
			j([...resN.merged].sort()),
			j([...resL.merged].sort()),
			`threeWay merged case ${i}`,
		);
		assert.equal(
			j(resN.conflicts),
			j(resL.conflicts),
			`threeWay conflicts case ${i}`,
		);
		const appliedL = LET.applyMerge(JSON.parse(JSON.stringify(l)), resL, {});
		const appliedN = merge.applyMerge(
			JSON.parse(JSON.stringify(l)) as model.State,
			resN,
			{},
		);
		assert.equal(j(appliedN), j(appliedL), `applyMerge case ${i}`);
		n += 2;
	}
	console.log(`merge comparisons: ${n}`);
	assert.ok(n >= 25000);
});

test("differential: codec round trips and error codes, 2,000 seeded cases", async () => {
	let n = 0;
	for (let i = 0; i < 1000; i++) {
		const st = randomState();
		const fileL = LET.exportFile(st);
		const fileN = codec.exportFile(st);
		// 'saved' timestamp differs; compare after normalising
		assert.equal(
			j(JSON.parse(fileN)),
			j(JSON.parse(fileL)),
			`exportFile case ${i}`,
		);
		const backL = outcome(() => LET.importFile(fileL));
		const backN = outcome(() => codec.importFile(fileN));
		assert.deepEqual(backN, backL, `importFile case ${i}`);
		const codeL = await LET.makeTransferCode(st);
		const codeN = await codec.makeTransferCode(st);
		assert.equal(codeN, codeL, `makeTransferCode case ${i}`);
		const rbL = await outcomeAsync(() => LET.readTransferCode(codeL));
		const rbN = await outcomeAsync(() => codec.readTransferCode(codeN));
		assert.deepEqual(rbN, rbL, `readTransferCode case ${i}`);
		n += 4;
	}
	for (const bad of [
		"hello",
		"EVT1-abc",
		"EVT9-xyz",
		`EVT2-${"A".repeat(100)}`,
	]) {
		assert.deepEqual(
			await outcomeAsync(() => codec.readTransferCode(bad)),
			await outcomeAsync(() => LET.readTransferCode(bad)),
			`damaged code ${bad.slice(0, 12)}`,
		);
		n++;
	}
	console.log(`codec comparisons: ${n}`);
});

async function outcomeAsync(fn: () => Promise<unknown>) {
	try {
		return { threw: false, value: j(await fn()) };
	} catch (e) {
		return {
			threw: true,
			code: (e as { code?: unknown }).code,
			message: (e as Error).message,
		};
	}
}

test("differential: storage scenarios on the memory fallback (transact/read/writeSection/merge)", async () => {
	save.setEnv({ now: () => 1700000000000, random: () => 0.5, id: () => "x" });
	LCC.resetMemory();
	save.resetMemory();
	let n = 0;
	for (let round = 0; round < 200; round++) {
		const name = pick(["submersibles", "atelier", "settings", "lists"]);
		const sec = randomModules()[name] ?? {};
		const wL = await outcomeAsync(() =>
			LCC.writeSection(name, sec, { rev: null, base: null }),
		);
		const wN = await outcomeAsync(() =>
			save.writeSection(name, sec, { rev: null, base: null }),
		);
		const docL = JSON.parse((wL as { value: string }).value as string).doc;
		const docN = JSON.parse((wN as { value: string }).value as string).doc;
		assert.equal(
			j(docN.modules[name]),
			j(docL.modules[name]),
			`writeSection ${name} round ${round}`,
		);
		const rL = await LCC.read();
		const rN = await save.read();
		assert.equal(rN.kind, rL.kind, `kind round ${round}`);
		assert.equal(j(rN.raw), j(rL.raw), `raw round ${round}`);
		n += 3;
	}
	// a second writer between read and write triggers the merge on both sides identically
	await LCC.transact((raw: unknown) =>
		raw ? LCC.checkDoc(raw) : LCC.emptyDoc(),
	);
	await save.transact((raw) => (raw ? save.checkDoc(raw) : save.emptyDoc()));
	const a = await outcomeAsync(() =>
		LCC.writeSection(
			"submersibles",
			{ fcs: { f9: { name: "Nine" } } },
			{ rev: "stale", base: {} },
		),
	);
	const b = await outcomeAsync(() =>
		save.writeSection(
			"submersibles",
			{ fcs: { f9: { name: "Nine" } } },
			{ rev: "stale", base: {} },
		),
	);
	assert.equal(
		j(JSON.parse((b as { value: string }).value).doc),
		j(JSON.parse((a as { value: string }).value).doc),
		"merged writeSection",
	);
	n++;
	console.log(`storage scenario comparisons: ${n}`);
	save.setEnv({
		now: () => Date.now(),
		random: () => Math.random(),
		id: () => "x",
	});
});

test("differential: scripted cloud exchanges against a mock Graph/helper", async () => {
	// a tiny in-memory OneDrive + helper; the same script runs against legacy (vm) and the port
	function makeWorld() {
		const cloudFile: { id: string; eTag: string; body: string } = {
			id: "F1",
			eTag: '"e1"',
			body: "",
		};
		const calls: string[] = [];
		const f = async (
			url: string,
			opts?: {
				method?: string;
				headers?: Record<string, string>;
				body?: string;
			},
		) => {
			calls.push(`${opts?.method || "GET"} ${url}`);
			if (url.includes("/token"))
				return {
					ok: true,
					status: 200,
					json: async () => ({ token: "tok", expires_in: 3600 }),
				};
			if (
				url.includes(
					"/me/drive/special/approot:/eveniunt-command-center.json?select",
				)
			)
				return {
					ok: true,
					status: 200,
					json: async () => ({
						id: cloudFile.id,
						eTag: cloudFile.eTag,
						size: cloudFile.body.length,
						"@microsoft.graph.downloadUrl": `https://dl/${cloudFile.id}`,
					}),
				};
			if (url === `https://dl/${cloudFile.id}`)
				return {
					ok: true,
					status: 200,
					json: async () => JSON.parse(cloudFile.body),
				};
			if (url.includes(":/content") && opts?.method === "PUT") {
				if (
					opts.headers?.["If-Match"] &&
					opts.headers["If-Match"] !== cloudFile.eTag
				)
					return { ok: false, status: 412, json: async () => ({}) };
				cloudFile.body = opts.body as string;
				cloudFile.eTag = `"e${calls.length}"`;
				return {
					ok: true,
					status: 201,
					json: async () => ({ id: cloudFile.id, eTag: cloudFile.eTag }),
				};
			}
			return { ok: false, status: 404, json: async () => null };
		};
		return { f, cloudFile, calls };
	}
	let n = 0;
	for (let i = 0; i < 50; i++) {
		const wL = makeWorld();
		const wN = makeWorld();
		const stL = randomState();
		const stN = JSON.parse(JSON.stringify(stL));
		if (rng() < 0.5) {
			// seed the cloud with a v2 copy made from another state
			const other = randomState();
			wL.cloudFile.body = JSON.stringify(await LET.cloudDoc(other));
			wN.cloudFile.body = JSON.stringify(await cloud.cloudDoc(other));
			const rL = await outcomeAsync(() =>
				LET.cloudSync(stL, "tok", wL.f as never, undefined),
			);
			const rN = await outcomeAsync(() =>
				cloud.cloudSync(stN, "tok", wN.f as never, undefined),
			);
			assert.deepEqual(rN, rL, `cloudSync case ${i}`);
			if ((rL as { value: string }).value.includes('"done":false')) {
				const parsedL = JSON.parse((rL as { value: string }).value as string);
				const parsedN = JSON.parse((rN as { value: string }).value as string);
				const choices: Record<string, string> = {};
				for (const c of parsedL.conflicts)
					choices[c.id] = pick(["local", "remote"]);
				const fL = await outcomeAsync(() =>
					LET.cloudFinish(
						stL,
						"tok",
						parsedL,
						choices,
						wL.f as never,
						undefined,
					),
				);
				const fN = await outcomeAsync(() =>
					cloud.cloudFinish(
						stN,
						"tok",
						parsedN,
						choices,
						wN.f as never,
						undefined,
					),
				);
				assert.deepEqual(fN, fL, `cloudFinish case ${i}`);
			}
			assert.equal(j(stN), j(stL), `state after sync case ${i}`);
			assert.equal(
				wN.cloudFile.body,
				wL.cloudFile.body,
				`cloud copy after case ${i}`,
			);
		} else {
			const rL = await outcomeAsync(() =>
				LET.cloudSync(stL, "tok", wL.f as never, undefined),
			);
			const rN = await outcomeAsync(() =>
				cloud.cloudSync(stN, "tok", wN.f as never, undefined),
			);
			assert.deepEqual(rN, rL, `cloudSync-create case ${i}`);
			assert.equal(j(stN), j(stL), `state after create case ${i}`);
		}
		n += 3;
	}
	console.log(`cloud exchange comparisons: ${n}`);
});
