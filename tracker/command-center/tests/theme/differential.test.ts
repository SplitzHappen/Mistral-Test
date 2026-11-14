import assert from "node:assert/strict";
import { test } from "node:test";
import * as color from "../../src/base/theme/color.ts";
import * as look from "../../src/base/theme/look.ts";
import * as panel from "../../src/base/theme/panel.ts";
import {
	ACCENTS,
	defaultLook,
	type Look,
	lookFromDoc,
	THEMES,
} from "../../src/base/theme/themes.ts";
import { legacyLook, makeDom, mulberry32 } from "./ref.ts";

// Differential tests, theme: legacy appearance slice (evaluated from the frozen atelier.js copy against a
// stand-in page) vs src/base/theme/*. Every theme x both modes x every option, plus the panel HTML and the
// panel action logic. Seed printed below.

const SEED = 0x7e5e11;
const rand = mulberry32(SEED);
console.log(`theme differential seed: ${SEED.toString(16)}`);

const pick = (arr: any[]): any => arr[Math.floor(rand() * arr.length)];
const rint = (n: number) => Math.floor(rand() * n);

function run(fn: () => unknown): unknown {
	try {
		return { v: fn() };
	} catch (e) {
		return { e: (e as Error).name };
	}
}

function eq(a: unknown, b: unknown, label: string): void {
	const norm = (x: unknown) => {
		const s = JSON.stringify(x);
		return s === undefined ? "<<undef>>" : s;
	};
	const ja = norm(a);
	const jb = norm(b);
	assert.equal(ja, jb, label + " (json text)");
	if (ja !== "<<undef>>" && jb !== "<<undef>>")
		assert.deepEqual(JSON.parse(ja), JSON.parse(jb), label + " (deep)");
}

test("color helpers: hexRgb/rgbHex/lum/mix over seeded and fixed inputs", () => {
	const L = legacyLook({ mqDark: false });
	const hexes = [
		"#ffffff",
		"#000000",
		"#0a6cff",
		"abc",
		"#abc",
		"#aabbcc",
		"#AABBCC",
		"zzz",
		"",
		"#12345",
		"#1234567",
		" #ff4fb8 ",
		"0x12ab",
		null,
		undefined,
		123,
	];
	for (const h of hexes)
		eq(color.hexRgb(h), L.hexRgb(h), "hexRgb " + String(h));
	for (let i = 0; i < 2000; i++) {
		const h = "#" + rint(0xffffff).toString(16).padStart(6, "0");
		eq(color.hexRgb(h), L.hexRgb(h), "hexRgb " + h);
		const r = [rint(256), rint(256), rint(256)];
		eq(color.rgbHex(r), L.rgbHex(r), "rgbHex");
		const r2 = [rint(256), rint(256), rint(256)];
		const t = rand();
		eq(color.lum(r), L.lum(r), "lum");
		eq(color.mix(r, r2, t), L.mix(r, r2, t), "mix");
	}
});

test("look: every theme x mode x mq x options vs the values applyLook sets", () => {
	for (const mqDark of [false, true]) {
		const { document, rec } = makeDom();
		const L = legacyLook({ mqDark, doc: document });
		for (const th of THEMES) {
			for (const theme of ["system", "light", "dark"]) {
				const lk = defaultLook();
				lk.shared.theme = th[0];
				L.S.look = JSON.parse(JSON.stringify(lk));
				L.S.theme = theme;
				L.applyLook();
				const mine = look.lookVars(lk, theme, mqDark);
				eq(mine.vars, rec.vars, `vars ${th[0]} ${theme} mq=${mqDark}`);
				eq(
					mine.dataTheme,
					rec.attrs["data-theme"],
					`data-theme ${th[0]} ${theme}`,
				);
				eq(mine.motion ?? undefined, rec.attrs["data-motion"], "motion attr");
				eq(mine.zoom, rec.zoom, "zoom");
			}
		}
	}
});

test(`look options: seeded accent/bg/fg/contrast/fonts/motion/separate matrix, 5,000 cases`, () => {
	for (let i = 0; i < 5000; i++) {
		const mqDark = rand() < 0.5;
		const { document, rec } = makeDom();
		const L = legacyLook({ mqDark, doc: document });
		const lk: Look = lookFromDoc(null);
		const sideKey = pick(["shared", "light", "dark"]);
		lk.separate = rand() < 0.4;
		(lk as any)[sideKey].theme = pick(THEMES)[0];
		if (rand() < 0.7) (lk as any)[sideKey].accent = pick(ACCENTS)[0];
		if (rand() < 0.3)
			(lk as any)[sideKey].accentHex =
				"#" + rint(0xffffff).toString(16).padStart(6, "0");
		if (rand() < 0.3)
			(lk as any)[sideKey].bg = pick(["#010203", "#fedcba", "zzz", null]);
		if (rand() < 0.3)
			(lk as any)[sideKey].fg = pick(["#101010", "#abcdef", "nope", null]);
		lk.contrast = pick([0, 25, 50, 75, 100, rint(101)]);
		lk.uiFont = pick([11, 15, 22, 13.5, rint(30)]);
		lk.codeFont = pick([9, 12.5, 20, 11.5]);
		lk.motion = pick(["system", "on", "off"]);
		const theme = pick(["system", "light", "dark"]);
		L.S.look = JSON.parse(JSON.stringify(lk));
		L.S.theme = theme;
		// invalid bg/fg hex makes BOTH sides throw inside the colour math; compare that too
		const lr = run(() => {
			L.applyLook();
			return {
				vars: rec.vars,
				dataTheme: rec.attrs["data-theme"],
				zoom: rec.zoom,
				motion:
					rec.attrs["data-motion"] === undefined
						? null
						: rec.attrs["data-motion"],
			};
		});
		const mr = run(() => {
			const v = look.lookVars(lk, theme, mqDark);
			return {
				vars: v.vars,
				dataTheme: v.dataTheme,
				zoom: v.zoom,
				motion: v.motion,
			};
		});
		eq(mr, lr, `look case ${i}`);
	}
});

test(`panel HTML: appearanceHtml/themeBlock over seeded states, 2,000 cases`, () => {
	for (let i = 0; i < 2000; i++) {
		const mqDark = rand() < 0.5;
		const L = legacyLook({ mqDark });
		const lk: Look = lookFromDoc(null);
		lk.separate = rand() < 0.5;
		for (const sk of ["shared", "light", "dark"] as const) {
			(lk as any)[sk].theme = pick(THEMES)[0];
			(lk as any)[sk].accent = pick(ACCENTS)[0];
			if (rand() < 0.4)
				(lk as any)[sk].accentHex =
					"#" + rint(0xffffff).toString(16).padStart(6, "0");
			if (rand() < 0.4) (lk as any)[sk].bg = pick(["#010203", null]);
			if (rand() < 0.4) (lk as any)[sk].fg = pick(["#f0e0d0", null]);
		}
		lk.uiFont = pick([11, 15, 22]);
		lk.codeFont = pick([9, 12.5, 20]);
		lk.motion = pick(["system", "on", "off"]);
		lk.contrast = pick([0, 50, 100]);
		const theme = pick(["system", "light", "dark"]);
		L.S.look = JSON.parse(JSON.stringify(lk));
		L.S.theme = theme;
		L.lookUi.open = pick([
			null,
			"shared:theme",
			"shared:accent",
			"shared:bg",
			"shared:fg",
			"shared:import",
			"light:theme",
			"dark:accent-edit",
			"x:y",
		]);
		L.lookUi.adv = rand() < 0.5;
		const st = { theme, look: lk };
		const ui = { open: L.lookUi.open, adv: L.lookUi.adv };
		assert.equal(
			panel.appearanceHtml(st, ui, mqDark),
			L.appearanceHtml(),
			`appearanceHtml case ${i}`,
		);
	}
});

test(`panel actions: seeded click/change/input sequences vs legacy bindAppearance handlers, 2,000 actions`, () => {
	for (let i = 0; i < 2000; i++) {
		const mqDark = rand() < 0.5;
		const L = legacyLook({ mqDark });
		L.bindAppearance({}); // wires box.onclick/onchange/oninput against the stand-in
		L.S.look = JSON.parse(JSON.stringify(defaultLook()));
		L.S.theme = "system";
		const st: panel.ThemeState = { theme: "system", look: defaultLook() };
		const ui: panel.LookUi = { open: null };
		const box = L.box;
		box.querySelector = () => null;
		box.value = pick([
			undefined,
			'{"base":"limsa-brineward","background":"#112233","foreground":"#ddeeff","accent":"#ff8800"}',
			"not json",
		]);
		for (let step = 0; step < 6; step++) {
			const kind = pick(["click", "click", "click", "change", "input"]);
			if (kind === "click") {
				const a = pick([
					"mode",
					"toggle",
					"theme",
					"accent",
					"clear",
					"set",
					"reset",
					"import",
					"import-go",
					"export",
				]);
				const btn: any = {
					tagName: "BUTTON",
					dataset: {
						look: a,
						side: pick(["shared", "light", "dark"]),
						v: pick([
							"system",
							"light",
							"dark",
							...THEMES.map((t) => t[0]),
							"bogus",
							...ACCENTS.map((a2) => a2[0]),
							"bg",
							"fg",
							"on",
							"off",
							"shared:theme",
						]),
						k: pick(["motion"]),
					},
				};
				const target: any = {
					closest: (s: string) => (s === "[data-look]" ? btn : null),
				};
				box.onclick({ target });
				panel.clickAction(
					st,
					ui,
					a,
					btn.dataset.v,
					btn.dataset.side,
					btn.dataset.k,
					box.value,
				);
			} else if (kind === "change") {
				if (rand() < 0.5) {
					const checked = rand() < 0.5;
					box.onchange({ target: { dataset: { look: "separate" }, checked } });
					panel.changeSeparate(st, ui, checked);
				} else {
					const n = pick(["uiFont", "codeFont", "contrast"]);
					const value = pick(["11", "22", "99", "abc", "13.5", "-3"]);
					box.onchange({ target: { dataset: { lookn: n }, value } });
					panel.changeLookn(st, ui, n, value);
				}
			} else {
				if (rand() < 0.3) {
					const value = String(rint(101));
					box.oninput({
						target: {
							dataset: { lookn: "contrast" },
							value,
							parentNode: { querySelector: () => ({ textContent: "" }) },
						},
					});
					panel.contrastInput(st, value);
				} else {
					const sideKey = pick(["shared", "light", "dark"]);
					const key = pick(["bg", "fg", "accentHex"]);
					const k2 = pick(["color", "hx", "ch"]);
					const value =
						k2 === "hx"
							? pick(["#aabbcc", "zz", "#123"])
							: k2 === "ch"
								? String(rint(300))
								: "#" + rint(0xffffff).toString(16).padStart(6, "0");
					const ch = String(rint(3));
					const pk: any = {
						dataset: { side: sideKey, pick: key },
						querySelector: () => ({ value: "#445566" }),
						querySelectorAll: () => [],
					};
					const target: any = {
						dataset: { ch: k2 === "ch" ? ch : undefined },
						type: k2 === "color" ? "color" : "text",
						classList: { contains: (c: string) => c === "hx" && k2 === "hx" },
						value,
						closest: (s: string) => (s === "[data-pick]" ? pk : null),
					};
					box.oninput({ target });
					panel.pickerInput(st, sideKey, key, "#445566", k2 as any, value, ch);
				}
			}
			eq(
				{ theme: st.theme, look: st.look, open: ui.open },
				{ theme: L.S.theme, look: L.S.look, open: L.lookUi.open },
				`action case ${i} step ${step}`,
			);
		}
	}
});

test("export/import theme JSON round trip matches legacy", () => {
	for (let i = 0; i < 500; i++) {
		const L = legacyLook({ mqDark: rand() < 0.5 });
		const side = panel.blankSide();
		side.theme = pick(THEMES)[0];
		side.accent = pick(ACCENTS)[0];
		if (rand() < 0.5)
			side.accentHex = "#" + rint(0xffffff).toString(16).padStart(6, "0");
		if (rand() < 0.5) side.bg = "#0a0b0c";
		if (rand() < 0.5) side.fg = "#e0e1e2";
		const dark = rand() < 0.5;
		L.S.look.shared = JSON.parse(JSON.stringify(side));
		const mine = panel.exportThemeJson(side, dark);
		const c = L.resolved(side, dark ? "dark" : "light");
		const legacyJson = JSON.stringify(
			{
				atelierTheme: 1,
				base: side.theme,
				accent: c[2],
				background: c[0],
				foreground: c[1],
			},
			null,
			2,
		);
		assert.equal(mine, legacyJson, "export json");
		const parsed = panel.parseImport(mine);
		const o = JSON.parse(mine);
		eq(
			parsed,
			{
				theme: L.themeOf(o.base)[0] === o.base ? o.base : undefined,
				bg: L.hexRgb(o.background)
					? L.rgbHex(L.hexRgb(o.background))
					: undefined,
				fg: L.hexRgb(o.foreground)
					? L.rgbHex(L.hexRgb(o.foreground))
					: undefined,
				accentHex: L.hexRgb(o.accent)
					? L.rgbHex(L.hexRgb(o.accent))
					: undefined,
			},
			"parseImport",
		);
	}
});
