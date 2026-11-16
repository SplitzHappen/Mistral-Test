import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const CC = process.cwd();
const BASE = "b4d02a3";

test("reference: the shell.js copy's sha256 equals git show BASE:tracker/command-center/src/shell.js", () => {
	const rel = "tracker/command-center/src/shell.js";
	const fromGit = execFileSync(
		"git",
		["-C", join(CC, "..", ".."), "show", `${BASE}:${rel}`],
		{
			encoding: "utf8",
		},
	);
	const onDisk = readFileSync(
		join(CC, "tests", "reference", "shell", "shell.js"),
		"utf8",
	);
	const h = (b: string) => createHash("sha256").update(b).digest("hex");
	assert.equal(h(onDisk), h(fromGit), "shell.js differs from BASE");
});
