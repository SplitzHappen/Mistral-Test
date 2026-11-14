import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Every legacy file that gets ported is copied byte for byte here (excluded from lint), and this test proves
// each copy's sha256 equals `git show BASE:<path>` — the reference side of every differential test is this
// frozen copy, never the new code.
const BASE = "b4d02a3";
const FILES = ["save", "model", "codec", "merge", "cloud", "storage"];
const CC = process.cwd();

test("reference copies are byte-identical to BASE (sha256 vs git show)", () => {
	for (const f of FILES) {
		const legacyPath = `tracker/src/core/${f}.js`;
		const fromGit = execFileSync("git", ["show", `${BASE}:${legacyPath}`], {
			encoding: "utf8",
			cwd: join(CC, ".."),
		});
		const copy = readFileSync(
			join(CC, "tests", "reference", "core", `${f}.js`),
			"utf8",
		);
		const sha = (s: string) => createHash("sha256").update(s).digest("hex");
		assert.equal(
			sha(copy),
			sha(fromGit),
			`${f}.js reference copy differs from BASE`,
		);
		assert.equal(
			copy,
			fromGit,
			`${f}.js reference copy is not byte-identical to BASE`,
		);
	}
});
