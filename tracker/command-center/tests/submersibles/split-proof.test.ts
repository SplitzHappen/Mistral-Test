import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Stage 1 fix, Task 1: proof that voyage.ts / earn.ts / compat.ts were only SPLIT, not edited.
// Each original file at START is compared, as a whitespace-token multiset (import statements and
// `export ... from "..."` re-exports stripped, bare `export` tokens dropped), with the concatenation
// of its entry file plus the new files in its subfolder. The only tolerated differences are the
// disclosed hoists: the closure variable `let D = data;` had to become a module-level
// `let D: SubData;` (the `data` parameter only exists inside createAdvisor/createEarn, and init()
// assigns D before any use), and in compat.ts the module-level `let audio` moved to compat/sound.ts
// (same tokens, different file). Everything else must match exactly.
const CC = process.cwd();
const START = "ac6ae6491e515e54db54878b1dc684e2a7c1c058";
const LOGIC = join(CC, "src", "modules", "submersibles", "logic");

function stripStatements(text: string): string {
	return text
		.replace(/^[ \t]*import[\s\S]*?from\s*"[^"]*";[ \t]*$/gm, "")
		.replace(/^[ \t]*export[\s\S]*?from\s*"[^"]*";[ \t]*$/gm, "");
}

// A reflow-invariant tokenizer: import/export-from statements are stripped, then the text is lexed
// into comments, string/template literals, words, numbers and single punctuation characters, so that
// only real code tokens count (biome re-wraps lines when the moved code is de-indented; that must not
// change the multiset).
const TOKEN_RE =
	/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|[A-Za-z_$][A-Za-z0-9_$]*|0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\s+|./gs;

function tokens(text: string): string[] {
	const raw = stripStatements(text)
		.match(TOKEN_RE)!
		.filter((t) => !/^\s+$/.test(t))
		.map((t) => t.replace(/\s+/g, ""))
		.filter((t) => t.length > 0 && t !== "export");
	// biome re-wraps lines when the moved code is de-indented and adds/drops trailing commas
	// before ) ] } — formatting only, same JS semantics, so those commas are normalized away
	return raw.filter(
		(t, i) =>
			!(
				t === "," &&
				(raw[i + 1] === ")" || raw[i + 1] === "]" || raw[i + 1] === "}")
			),
	);
}

function multiset(toks: string[]): Map<string, number> {
	const m = new Map<string, number>();
	for (const t of toks) m.set(t, (m.get(t) || 0) + 1);
	return m;
}

function listTs(dir: string): string[] {
	const out: string[] = [];
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) out.push(...listTs(p));
		else if (e.name.endsWith(".ts")) out.push(p);
	}
	return out.sort();
}

// positive = present in the START original only, negative = present in the new files only:
// `let D = data;` (inside the factory) became the hoisted module-level `let D: SubData;`
const HOIST_DELTA = { "=": 1, data: 1, ":": -1, SubData: -1 };

const GROUPS: {
	name: string;
	entry: string;
	subdir: string;
	allowedDelta: Record<string, number>;
}[] = [
	{
		name: "voyage",
		entry: "voyage.ts",
		subdir: "voyage",
		allowedDelta: HOIST_DELTA,
	},
	{ name: "earn", entry: "earn.ts", subdir: "earn", allowedDelta: HOIST_DELTA },
	{ name: "compat", entry: "compat.ts", subdir: "compat", allowedDelta: {} },
];

for (const g of GROUPS) {
	test(`split proof: ${g.name}.ts equals the START original plus its new sub-files, token for token (hoists disclosed)`, () => {
		const rel = `tracker/command-center/src/modules/submersibles/logic/${g.entry}`;
		const orig = stripStatements(
			execFileSync(
				"git",
				["-C", join(CC, "..", ".."), "show", `${START}:${rel}`],
				{
					encoding: "utf8",
				},
			),
		);
		const parts = [join(LOGIC, g.entry), ...listTs(join(LOGIC, g.subdir))];
		// strip statements per file, then concatenate, so a strip regex can never span a file boundary
		const combined = parts
			.map((p) => stripStatements(readFileSync(p, "utf8")))
			.join("\n");
		const a = multiset(tokens(orig));
		const b = multiset(tokens(combined));
		const delta = new Map<string, number>();
		for (const [t, n] of a) {
			const d = n - (b.get(t) || 0);
			if (d !== 0) delta.set(t, d);
			b.delete(t);
		}
		for (const [t, n] of b) delta.set(t, (delta.get(t) || 0) + n);
		console.log(
			`split proof ${g.name}: original ${tokens(orig).length} tokens, new ${tokens(combined).length} tokens, delta ${JSON.stringify([...delta.entries()])}`,
		);
		assert.deepEqual(
			Object.fromEntries(delta),
			g.allowedDelta,
			`${g.name}: token multiset differs beyond the disclosed hoists: ${JSON.stringify([...delta.entries()])}`,
		);
	});
}
