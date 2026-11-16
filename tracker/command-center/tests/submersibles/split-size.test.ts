import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Stage 1 fix, Task 1: no file under src/modules/submersibles/logic/ may exceed 320 lines.
const CC = process.cwd();
const LOGIC = join(CC, "src", "modules", "submersibles", "logic");
const LIMIT = 320;

function listTs(dir: string): string[] {
	const out: string[] = [];
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) out.push(...listTs(p));
		else if (e.name.endsWith(".ts")) out.push(p);
	}
	return out.sort();
}

test("logic size: every file in logic/ is at most 320 lines", () => {
	const files = listTs(LOGIC);
	assert.ok(files.length >= 9, "logic files missing");
	const over: string[] = [];
	for (const f of files) {
		const n = readFileSync(f, "utf8").split("\n").length - 1;
		console.log(`size: ${f.slice(LOGIC.length + 1)} ${n} lines`);
		if (n > LIMIT) over.push(`${f.slice(LOGIC.length + 1)}: ${n} lines`);
	}
	assert.deepEqual(over, [], `files over ${LIMIT} lines: ${over.join(", ")}`);
	assert.ok(statSync(LOGIC).isDirectory());
});
