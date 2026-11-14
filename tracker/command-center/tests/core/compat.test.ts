import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";

// The compat layer must set the same globals with the same property names (and order) as the legacy files.
const CC = process.cwd();
const T = join(CC, "..");
const FILES = ["save", "model", "codec", "merge", "cloud", "storage"];

function legacyGlobals(): { CC: string[]; ET: string[] } {
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
		(sandbox as Record<string, unknown>)[k] = (
			globalThis as Record<string, unknown>
		)[k];
	createContext(sandbox);
	for (const f of FILES)
		runInContext(
			readFileSync(join(T, "src", "core", `${f}.js`), "utf8"),
			sandbox,
			{ filename: `${f}.js` },
		);
	return {
		CC: Object.keys(sandbox.CC as object),
		ET: Object.keys(sandbox.ET as object),
	};
}

test("compat: Object.keys of legacy CC/ET equals compat's (names and order)", async () => {
	const legacy = legacyGlobals();
	const compat = await import("../../src/base/core/compat.ts");
	const g = globalThis as Record<string, unknown>;
	assert.deepEqual(Object.keys(g.CC as object), legacy.CC);
	assert.deepEqual(Object.keys(g.ET as object), legacy.ET);
	void compat;
});

test("core.test.js passes UNCHANGED unredirected (76)", () => {
	const r = spawnSync("node", ["tests/core.test.js"], {
		encoding: "utf8",
		cwd: T,
	});
	assert.equal(r.status, 0, r.stderr.slice(-2000));
	assert.ok(!/^not ok /m.test(r.stdout), "a legacy test failed");
});

test("core.test.js passes UNCHANGED through the preload that redirects only the six ported files (76)", () => {
	const preload = join(CC, "tests", "core", "preload.js");
	const r = spawnSync("node", ["--require", preload, "tests/core.test.js"], {
		encoding: "utf8",
		cwd: T,
	});
	assert.equal(r.status, 0, r.stderr.slice(-3000));
	assert.ok(!/^not ok /m.test(r.stdout), "a legacy test failed");
});
