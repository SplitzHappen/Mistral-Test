import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";

// Control script: one planted fault per ported file, applied to a TEMPORARY COPY only (same directory, so its
// relative imports resolve; removed in finally — the tree stays clean), and each fault must be CAUGHT by a
// differential check against the frozen reference copy.
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

// file -> [planted replacement, probe that distinguishes it from correct behaviour]
const FAULTS: Record<
	string,
	[string, string, (L: Record<string, any>, N: Record<string, any>) => boolean]
> = {
	save: [
		"v.length > 20000 ? v.slice(0, 20000) : v",
		"v.length > 20001 ? v.slice(0, 20001) : v",
		(L, N) => {
			const big = "x".repeat(20001);
			return (
				(L.CC.clean(big) as string).length === 20000 &&
				(N.save.clean(big) as string).length === 20001
			);
		},
	],
	model: [
		"Math.floor((1000 * done) / total) / 10",
		"Math.floor((1000 * done) / total) / 100",
		(L, N) => {
			return L.ET.percent(1, 3) === 33.3 && N.model.percent(1, 3) === 3.33;
		},
	],
	codec: [
		'join(".")',
		'join(",")',
		(_L, _N) => {
			return true; // probed async below via transfer codes
		},
	],
	merge: [
		"\t\tif (l !== undefined) merged.set(k, l);\n\t}\n\treturn { merged, conflicts };",
		"\t\tif (r !== undefined) merged.set(k, r);\n\t}\n\treturn { merged, conflicts };",
		(L, N) => {
			const _st = N.model.newState(["A"]);
			const base = {
				chars: [{ id: "c1", name: "Base" }],
				ticks: {},
				excl: {},
				vals: {},
				avail: {},
				settings: {},
			};
			const local = {
				chars: [{ id: "c1", name: "Local" }],
				ticks: {},
				excl: {},
				vals: {},
				avail: {},
				settings: {},
			};
			const remote = {
				chars: [{ id: "c1", name: "Remote" }],
				ticks: {},
				excl: {},
				vals: {},
				avail: {},
				settings: {},
			};
			const rL = L.ET.threeWay(base, local, remote);
			const rN = N.merge.threeWay(base, local, remote);
			return (
				rL.merged.get("n|c1") === "Local" && rN.merged.get("n|c1") === "Remote"
			);
		},
	],
	cloud: [
		"if (r.status === 412)",
		"if (r.status === 413)",
		(_L, _N) => {
			return true; // probed async below via a 412 exchange
		},
	],
	storage: [
		"if (!stored || storedRev === knownRev) return { state: snap, merged: false };",
		"if (!stored || storedRev !== knownRev) return { state: snap, merged: false };",
		(L, N) => {
			const st = N.model.newState(["A"]);
			const doc = N.model.newState(["A"]);
			const rL = L.ET.saveMerge(st, "r1", doc, "r1", null);
			const rN = N.storage.saveMerge(st, "r1", doc, "r1", null);
			return rL.merged === false && rN.merged === true;
		},
	],
};

test("control: one planted fault per ported file, on a temp copy only, each caught", async () => {
	const L = legacyApi();
	for (const f of FILES) {
		const [from, to, probe] = FAULTS[f];
		const srcPath = join(CC, "src", "base", "core", `${f}.ts`);
		const src = readFileSync(srcPath, "utf8");
		assert.ok(src.includes(from), `${f}: fault anchor not found`);
		const tmpPath = join(CC, "src", "base", "core", `${f}.controltmp.ts`);
		writeFileSync(tmpPath, src.replace(from, to));
		try {
			const N = await import(`../../src/base/core/${f}.controltmp.ts`);
			const ns: Record<string, any> = {
				...N,
				model: await import("../../src/base/core/model.ts"),
				merge: await import("../../src/base/core/merge.ts"),
				storage: await import("../../src/base/core/storage.ts"),
				save: await import("../../src/base/core/save.ts"),
			};
			ns[f] = N; // the mutated module itself under test
			if (f === "codec") {
				// fault: packed tick deltas joined with ',' instead of '.' — a round trip must differ
				const st = ns.model.newState(["A"]);
				st.ticks.c1["mounts:5"] = 1;
				st.ticks.c1["mounts:9"] = 1;
				const codeN = await ns.makeTransferCode(st);
				const codeL = await L.ET.makeTransferCode(st);
				assert.notEqual(codeN, codeL, "codec fault not caught");
				const backN = await ns
					.readTransferCode(codeN)
					.catch((e: Error) => e.message);
				const backL = await L.ET.readTransferCode(codeL).then(
					() => "ok",
					(e: Error) => e.message,
				);
				assert.notEqual(
					backN === "ok",
					backL === "ok",
					"codec fault not caught on read",
				);
			} else if (f === "cloud") {
				// fault: 412 no longer recognised as 'changed' — a conflicting upload must behave differently
				const calls: string[] = [];
				const fFetch = async (
					url: string,
					opts?: { method?: string; headers?: Record<string, string> },
				) => {
					calls.push(url);
					if (url.includes("?select"))
						return {
							ok: true,
							status: 200,
							json: async () => ({
								id: "F",
								eTag: '"x"',
								size: 1,
								"@microsoft.graph.downloadUrl": "https://dl/F",
							}),
						};
					if (url === "https://dl/F")
						return {
							ok: true,
							status: 200,
							json: async () =>
								JSON.parse(
									'{"app":"eveniunt-completionist-tracker","v":1,"chars":[{"id":"c1","name":"A","lodestone":null,"cls":null,"gc":null}],"ticks":{"c1":{}},"excl":{"c1":{}},"vals":{"c1":{}},"avail":{},"settings":{}}',
								),
						};
					if (opts?.method === "PUT")
						return { ok: false, status: 412, json: async () => ({}) };
					return { ok: false, status: 404, json: async () => null };
				};
				const st = ns.model.newState(["A"]);
				const rL = await L.ET.cloudSync(
					st,
					"tok",
					fFetch as never,
					undefined,
				).then(
					() => "ok",
					(e: Error) => (e as { code?: string }).code,
				);
				const st2 = ns.model.newState(["A"]);
				const rN = await ns
					.cloudSync(st2, "tok", fFetch as never, undefined)
					.then(
						() => "ok",
						(e: Error) => (e as { code?: string }).code,
					);
				assert.notEqual(rN, rL, "cloud fault not caught");
			} else {
				assert.ok(probe(L, ns), `${f}: fault NOT caught`);
			}
			console.log(`control: fault in ${f}.ts caught`);
		} finally {
			rmSync(tmpPath, { force: true });
		}
	}
	// the tree stays clean: no controltmp files remain
	const leftover = FILES.map((f) => `${f}.controltmp.ts`).filter((n) => {
		try {
			readFileSync(join(CC, "src", "base", "core", n));
			return true;
		} catch {
			return false;
		}
	});
	assert.deepEqual(leftover, []);
});
