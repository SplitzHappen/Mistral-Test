import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CC, legacyLook, lookPlusText, REF } from "./ref.ts";

const BASE = "b4d02a3";

test("reference: frozen atelier.js sha256 equals git show BASE:crafting/atelier/src/atelier.js", () => {
	const fromGit = execFileSync(
		"git",
		[
			"-C",
			join(CC, "..", ".."),
			"show",
			`${BASE}:crafting/atelier/src/atelier.js`,
		],
		{ encoding: "utf8" },
	);
	const onDisk = readFileSync(join(REF, "atelier.js"), "utf8");
	const h = (b: string) => createHash("sha256").update(b).digest("hex");
	assert.equal(h(onDisk), h(fromGit));
});

test("reference slice: 21 themes after the same insertion build.js makes, THEMES data equals the port's", async () => {
	const L = legacyLook({ mqDark: false });
	assert.equal(L.THEMES.length, 21);
	const { THEMES, ACCENTS } = await import("../../src/base/theme/themes.ts");
	assert.deepEqual(THEMES, L.THEMES, "THEMES data differs");
	assert.deepEqual(ACCENTS, L.ACCENTS, "ACCENTS data differs");
	assert.equal(lookPlusText().length > 0, true);
});
