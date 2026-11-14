import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CC, legacyApi, REF } from "./ref.ts";

const BASE = "b4d02a3";
const FILES = ["fleet", "advisor", "push", "earn", "subs"];

test("reference: each frozen copy's sha256 equals git show BASE:<path>", () => {
	for (const f of FILES) {
		const rel = `tracker/command-center/src/submersibles/${f}.js`;
		const fromGit = execFileSync(
			"git",
			["-C", join(CC, "..", ".."), "show", `${BASE}:${rel}`],
			{ encoding: "utf8" },
		);
		const onDisk = readFileSync(join(REF, `${f}.js`), "utf8");
		const h = (b: string) => createHash("sha256").update(b).digest("hex");
		assert.equal(h(onDisk), h(fromGit), `${f}.js differs from BASE`);
	}
});

test("compat: Object.keys of legacy FLEET/ADVISOR/PUSH/EARN equals compat's", async () => {
	const legacy = legacyApi();
	await import("../../src/modules/submersibles/logic/compat.ts");
	const g = globalThis as Record<string, any>;
	for (const k of ["FLEET", "ADVISOR", "PUSH", "EARN"]) {
		assert.deepEqual(
			Object.keys(g[k]),
			Object.keys(legacy[k]),
			`${k} key order differs`,
		);
	}
});
