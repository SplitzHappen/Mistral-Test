import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import * as look from "../../src/base/theme/look.ts";
import * as panel from "../../src/base/theme/panel.ts";
import { defaultLook, THEMES } from "../../src/base/theme/themes.ts";
import { CC, legacyLook } from "./ref.ts";

// Control: one planted fault per theme module on a temp copy only (removed in finally; tree verified clean),
// each caught against the frozen legacy slice.

const FAULTS: Record<
	string,
	{ from: string; to: string; probe: (N: any) => boolean }
> = {
	"themes.ts": {
		from: '["#070a20", "#e6f4ff", "#38dcff", "#ff4fb8"]',
		to: '["#070a20", "#e6f4ff", "#38dcff", "#ff4fb9"]',
		probe: (N) =>
			JSON.stringify(N.THEMES) ===
			JSON.stringify(legacyLook({ mqDark: false }).THEMES),
	},
	"color.ts": {
		from: "return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];",
		to: "return 0.2126 * c[0] + 0.7152 * c[1] + 0.0723 * c[2];",
		probe: (N) =>
			N.lum([100, 150, 200]) ===
			legacyLook({ mqDark: false }).lum([100, 150, 200]),
	},
	"look.ts": {
		from: "const k = 0.55 + (look.contrast / 100) * 0.9;",
		to: "const k = 0.55 + (look.contrast / 100) * 0.91;",
		probe: (N) => {
			const lk = defaultLook();
			lk.contrast = 100;
			return (
				JSON.stringify(N.lookVars(lk, "system", false).vars) ===
				JSON.stringify(look.lookVars(lk, "system", false).vars)
			);
		},
	},
	"panel.ts": {
		from: "'<span class=\"tick\">✓</span>'",
		to: "'<span class=\"tick\">✔</span>'",
		probe: (N) => {
			const L = legacyLook({ mqDark: false });
			L.S.look = JSON.parse(JSON.stringify(defaultLook()));
			L.lookUi.open = "shared:theme";
			const st = { theme: "system", look: defaultLook() };
			return (
				N.appearanceHtml(st, { open: "shared:theme" }, false) ===
				L.appearanceHtml()
			);
		},
	},
};

test("control: one planted fault per theme module, on a temp copy only, each caught", async () => {
	const DIR = join(CC, "src", "base", "theme");
	for (const f of Object.keys(FAULTS)) {
		const { from, to, probe } = FAULTS[f];
		const srcPath = join(DIR, f);
		const src = readFileSync(srcPath, "utf8");
		assert.ok(src.includes(from), `${f}: fault anchor not found`);
		const tmpPath = join(DIR, f.replace(/\.ts$/, ".controltmp.ts"));
		writeFileSync(tmpPath, src.replace(from, to));
		try {
			const N = await import(
				`../../src/base/theme/${f.replace(/\.ts$/, ".controltmp.ts")}`
			);
			assert.ok(!probe(N), `${f}: fault NOT caught`);
			console.log(`control: fault in theme/${f} caught`);
		} finally {
			rmSync(tmpPath, { force: true });
		}
	}
	const leftover = Object.keys(FAULTS)
		.map((f) => f.replace(/\.ts$/, ".controltmp.ts"))
		.filter((n) => {
			try {
				readFileSync(join(DIR, n));
				return true;
			} catch {
				return false;
			}
		});
	assert.deepEqual(leftover, []);
});
