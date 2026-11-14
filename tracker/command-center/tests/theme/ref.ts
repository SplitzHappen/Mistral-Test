import { readFileSync } from "node:fs";
import { join } from "node:path";

// The reference side of the theme differential tests: the appearance module is a slice of the Atelier's
// atelier.js (the same slice tracker/tools/build.js inlines into the Tracker, plus the same inserted
// 'electrope-skyline' theme = 21), evaluated here against a stand-in page (S, load, window, document, ...).

export const CC = process.cwd();
export const REF = join(CC, "tests", "reference", "theme");

export function lookPlusText(): string {
	const atelier = readFileSync(join(REF, "atelier.js"), "utf8");
	const a0 = atelier.indexOf("  // ── appearance (laid out like ChatGPT");
	const a1 = atelier.indexOf("  function renderHeader()");
	if (a0 < 0 || a1 < a0) throw new Error("Atelier appearance module not found");
	const look = atelier.slice(a0, a1);
	const SOLUTION_NINE =
		"    ['electrope-skyline', \"Electrope Skyline\", ['#e3ebf7', '#0a1230', '#0a6c94', '#c2187a'], ['#070a20', '#e6f4ff', '#38dcff', '#ff4fb8']]";
	const plus = look.replace(
		/\]\n {2}\];\n {2}var ACCENTS/,
		"]" + ",\n" + SOLUTION_NINE + "\n  ];\n  var ACCENTS",
	);
	if (plus === look || (plus.match(/^\s+\['[a-z-]+', "/gm) || []).length !== 21)
		throw new Error("could not build the 21-theme slice");
	return plus;
}

export interface RecordedDom {
	vars: Record<string, string>;
	attrs: Record<string, string>;
	zoom: string;
}

export function makeDom(): { document: any; rec: RecordedDom } {
	const rec: RecordedDom = { vars: {}, attrs: {}, zoom: "" };
	const document = {
		documentElement: {
			style: {
				setProperty(n: string, v: string) {
					rec.vars[n] = v;
				},
			},
			setAttribute(n: string, v: string) {
				rec.attrs[n] = v;
			},
			removeAttribute(n: string) {
				delete rec.attrs[n];
			},
		},
		body: {
			style: {
				set zoom(v: string) {
					rec.zoom = v;
				},
				get zoom() {
					return rec.zoom;
				},
			},
			appendChild() {},
		},
		createElement: () => ({ click() {}, remove() {}, href: "", download: "" }),
	};
	return { document, rec };
}

export function esc(s: unknown): string {
	return String(s == null ? "" : s).replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			] as string,
	);
}

export function clampInt(
	v: unknown,
	lo: number,
	hi: number,
	d: number,
): number {
	const n = Math.floor(+(v as number));
	return Number.isNaN(n) ? d : Math.max(lo, Math.min(hi, n));
}

// Evaluates the legacy appearance slice against a stand-in page and returns its inner functions.
export function legacyLook(opts: { mqDark: boolean; doc?: any }): any {
	const { document } = makeDom();
	const doc = opts.doc || document;
	const S: any = { theme: "system", look: null };
	const window: any = {
		matchMedia: () => ({ matches: opts.mqDark, addEventListener() {} }),
	};
	const box: any = {
		innerHTML: "",
		listeners: {} as Record<string, any>,
		addEventListener(n: string, fn: any) {
			this.listeners[n] = fn;
		},
		onclick: null,
		onchange: null,
		oninput: null,
	};
	const scope: Record<string, any> = {
		S,
		load: () => null,
		window,
		document: doc,
		esc,
		$: () => box,
		persist: () => {},
		copyText: () => {},
		toast: () => {},
		clampInt,
		URL,
		Blob,
		setTimeout,
	};
	const names = [
		"THEMES",
		"ACCENTS",
		"blankSide",
		"defaultLook",
		"isDark",
		"hexRgb",
		"rgbHex",
		"lum",
		"mix",
		"sideFor",
		"themeOf",
		"resolved",
		"applyLook",
		"applyColors",
		"chip",
		"swatchDot",
		"themeBlock",
		"themeOpt",
		"picker",
		"appearanceHtml",
		"bindAppearance",
		"lookUi",
	];
	const keys = Object.keys(scope);
	const factory = new Function(
		...keys,
		lookPlusText() + "\n  return { " + names.join(", ") + ", S: S };",
	) as (...a: any[]) => any;
	const out = factory(...keys.map((k) => scope[k]));
	out.box = box;
	return out;
}

export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
