import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { test } from "node:test";

// Modules may not import each other or base internals: from a file under src/modules/<name>/, every relative
// import must stay inside that module's folder or resolve into src/base/connector/ (the public API only).
const CC = process.cwd(); // tests run with the command-center folder as cwd (npm run test)
const MODULES = join(CC, "src", "modules");
const CONNECTOR = join(CC, "src", "base", "connector") + sep;

function listTs(dir: string): string[] {
	const out: string[] = [];
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) out.push(...listTs(p));
		else if (e.name.endsWith(".ts")) out.push(p);
	}
	return out;
}

const IMPORT_RE =
	/(?:import|export)[^'"]*?from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/g;

test("import boundary: modules import only their own folder or the connector public API", () => {
	const files = listTs(MODULES);
	assert.ok(files.length >= 4, "expected the module manifests to exist");
	const violations: string[] = [];
	for (const file of files) {
		const src = readFileSync(file, "utf8");
		const moduleDir = join(
			MODULES,
			relative(MODULES, dirname(file)).split(sep)[0],
		);
		let m: RegExpExecArray | null;
		IMPORT_RE.lastIndex = 0;
		while ((m = IMPORT_RE.exec(src))) {
			const spec = m[1] || m[2];
			if (!spec.startsWith(".")) continue; // packages (preact etc.) are fine
			const target = resolve(dirname(file), spec);
			if (target.startsWith(moduleDir + sep) || target === moduleDir) continue; // own folder
			if (target.startsWith(CONNECTOR)) continue; // the public connector API
			violations.push(`${relative(CC, file)} -> ${spec}`);
		}
	}
	assert.deepEqual(violations, []);
});

test("import boundary: no module imports another module", () => {
	const files = listTs(MODULES);
	for (const file of files) {
		const src = readFileSync(file, "utf8");
		const moduleDir = join(
			MODULES,
			relative(MODULES, dirname(file)).split(sep)[0],
		);
		let m: RegExpExecArray | null;
		IMPORT_RE.lastIndex = 0;
		while ((m = IMPORT_RE.exec(src))) {
			const spec = m[1] || m[2];
			if (!spec.startsWith(".")) continue;
			const target = resolve(dirname(file), spec);
			if (
				target.startsWith(MODULES + sep) &&
				!target.startsWith(moduleDir + sep)
			) {
				assert.fail(`${relative(CC, file)} imports another module via ${spec}`);
			}
		}
	}
});

test("import boundary: statSync sanity on the scanned tree", () => {
	assert.ok(statSync(MODULES).isDirectory());
});
