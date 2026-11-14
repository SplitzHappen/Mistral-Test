import { hexRgb, rgbHex } from "./color.ts";
import { isDark, type Mode, resolved, sideFor, themeOf } from "./look.ts";
import {
	ACCENTS,
	blankSide,
	defaultLook,
	type Look,
	type Side,
	THEMES,
} from "./themes.ts";

export function esc(s: unknown): string {
	return String(s == null ? "" : s).replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			] as string,
	);
}

function clampInt(v: unknown, lo: number, hi: number, d: number): number {
	const n = Math.floor(+(v as number));
	return Number.isNaN(n) ? d : Math.max(lo, Math.min(hi, n));
}

export interface ThemeState {
	theme: string;
	look: Look;
}

export interface LookUi {
	open: string | null;
	adv?: boolean;
}

export function chip(th: ThemeEntryLike, mode: Mode): string {
	const c = th[mode === "dark" ? 3 : 2];
	return (
		'<span class="aa" style="background:' +
		c[0] +
		";color:" +
		c[2] +
		";box-shadow:inset 0 0 0 1px " +
		c[1] +
		'33">Aa</span>'
	);
}

type ThemeEntryLike = [string, string, string[], string[]];

export function swatchDot(hex: string): string {
	return '<span class="dot" style="background:' + hex + '"></span>';
}

export function themeOpt(
	x: ThemeEntryLike,
	side: Side,
	mode: Mode,
	sideKey: string,
): string {
	return (
		'<button type="button" class="opt' +
		(side.theme === x[0] ? " on" : "") +
		'" role="option" data-look="theme" data-side="' +
		sideKey +
		'" data-v="' +
		x[0] +
		'">' +
		chip(x, mode) +
		esc(x[1]) +
		(side.theme === x[0] ? '<span class="tick">✓</span>' : "") +
		"</button>"
	);
}

export function picker(sideKey: string, key: string, hex: string): string {
	const r = hexRgb(hex) || [0, 0, 0];
	return (
		'<div class="picker" data-side="' +
		sideKey +
		'" data-pick="' +
		key +
		'"><input type="color" value="' +
		hex +
		'" aria-label="' +
		key +
		' colour">' +
		'<span class="codes"><span>HEX</span><input class="inp hx" value="' +
		hex.toUpperCase() +
		'" maxlength="7" aria-label="HEX"><span>R</span><input class="inp c" type="number" min="0" max="255" data-ch="0" value="' +
		r[0] +
		'">' +
		'<span>G</span><input class="inp c" type="number" min="0" max="255" data-ch="1" value="' +
		r[1] +
		'"><span>B</span><input class="inp c" type="number" min="0" max="255" data-ch="2" value="' +
		r[2] +
		'"></span></div>'
	);
}

export function themeBlock(
	st: ThemeState,
	sideKey: "shared" | "light" | "dark",
	mode: Mode,
	ui: LookUi,
): string {
	const side = st.look[sideKey];
	const c = resolved(side, mode);
	const th = themeOf(side.theme);
	const open = ui.open;
	const id = (x: string) => sideKey + ":" + x;
	let h =
		'<div class="look-card">' +
		(st.look.separate
			? '<div class="look-sub">' +
				(mode === "dark" ? "Dark mode" : "Light mode") +
				"</div>"
			: "");
	h +=
		'<div class="look-row"><b>Theme</b><span class="look-ctl"><button type="button" class="icon-btn" data-look="export" data-side="' +
		sideKey +
		'" title="Download theme" aria-label="Download theme">⤓</button>' +
		'<button type="button" class="icon-btn" data-look="copy" data-side="' +
		sideKey +
		'" title="Copy theme" aria-label="Copy theme">⧉</button>' +
		'<button type="button" class="icon-btn" data-look="import" data-side="' +
		sideKey +
		'" title="Paste a theme" aria-label="Paste a theme">⇩</button>' +
		'<button type="button" class="pill" data-look="toggle" data-v="' +
		id("theme") +
		'" aria-expanded="' +
		(open === id("theme")) +
		'">' +
		chip(th, mode) +
		esc(th[1]) +
		' <span class="chev">⌄</span></button></span></div>';
	if (open === id("theme")) {
		h +=
			'<div class="menu" role="listbox">' +
			'<div class="menu-h" style="border-top:0;margin-top:0">FFXIV themes</div>' +
			THEMES.slice()
				.sort((x, y) => x[1].localeCompare(y[1], "en", { sensitivity: "base" }))
				.map((x) => themeOpt(x, side, mode, sideKey))
				.join("") +
			"</div>";
	}
	if (open === id("import"))
		h +=
			'<div class="look-edit"><textarea class="inp" rows="4" data-import="' +
			sideKey +
			'" placeholder="Paste a theme copied from the Atelier"></textarea><button type="button" class="btn sm" data-look="import-go" data-side="' +
			sideKey +
			'">Load theme</button></div>';
	const acName = (ACCENTS.find((a) => a[0] === side.accent) || ACCENTS[0])[1];
	h +=
		'<div class="look-row"><b>Accent</b><span class="look-ctl"><button type="button" class="pill" data-look="toggle" data-v="' +
		id("accent") +
		'">' +
		swatchDot(c[2]) +
		esc(acName) +
		' <span class="chev">⌄</span></button></span></div>';
	if (open === id("accent")) {
		h +=
			'<div class="menu">' +
			ACCENTS.map((a) => {
				const hex =
					a[0] === "default"
						? themeOf(side.theme)[mode === "dark" ? 3 : 2][2]
						: a[0] === "custom"
							? side.accentHex || c[2]
							: (a as [string, string, string, string])[
									mode === "dark" ? 3 : 2
								];
				return (
					'<button type="button" class="opt' +
					(side.accent === a[0] ? " on" : "") +
					'" data-look="accent" data-side="' +
					sideKey +
					'" data-v="' +
					a[0] +
					'">' +
					swatchDot(hex as string) +
					esc(a[1]) +
					(side.accent === a[0] ? '<span class="tick">✓</span>' : "") +
					"</button>"
				);
			}).join("") +
			"</div>";
	}
	if (side.accent === "custom" || open === id("accent-edit"))
		h += picker(sideKey, "accentHex", c[2]);
	(["bg", "fg"] as const).forEach((key, i) => {
		h +=
			'<div class="look-row"><b>' +
			(key === "bg" ? "Background" : "Foreground") +
			'</b><span class="look-ctl">' +
			(side[key]
				? '<button type="button" class="btn sm ghost" data-look="clear" data-side="' +
					sideKey +
					'" data-v="' +
					key +
					'">Theme default</button>'
				: "") +
			'<button type="button" class="pill mono-pill" data-look="toggle" data-v="' +
			id(key) +
			'">' +
			swatchDot(c[i]) +
			c[i].toUpperCase() +
			"</button></span></div>";
		if (open === id(key)) h += picker(sideKey, key, c[i]);
	});
	return h + "</div>";
}

export function appearanceHtml(
	st: ThemeState,
	ui: LookUi,
	mqDark: boolean,
): string {
	const L = st.look;
	const cur: Mode = isDark(st.theme, mqDark) ? "dark" : "light";
	const tile = (v: string, label: string) => {
		const sides = v === "system" ? ["light", "dark"] : [v];
		return (
			'<button type="button" class="mode-tile' +
			(st.theme === v ? " on" : "") +
			'" data-look="mode" data-v="' +
			v +
			'" aria-pressed="' +
			(st.theme === v) +
			'" aria-label="' +
			label +
			'"><span class="prev">' +
			sides
				.map((m) => {
					const c = resolved(sideFor(L, m as Mode), m as Mode);
					return (
						'<span class="half" style="background:' +
						c[0] +
						'"><i style="background:' +
						c[1] +
						'"></i><i style="background:' +
						c[1] +
						';width:46%"></i><i style="background:' +
						c[2] +
						';width:62%;margin-left:auto"></i><i style="background:' +
						c[2] +
						';width:40%;margin-left:auto"></i></span>'
					);
				})
				.join("") +
			'</span><span class="cap">' +
			label +
			"</span></button>"
		);
	};
	let h =
		'<h4 class="look-h">Visual style</h4><div class="look-card"><div class="look-row"><b>Mode</b><span class="look-ctl tiles">' +
		tile("system", "System") +
		tile("light", "Light") +
		tile("dark", "Dark") +
		"</span></div></div>";
	h += L.separate
		? themeBlock(st, "light", "light", ui) + themeBlock(st, "dark", "dark", ui)
		: themeBlock(st, "shared", cur, ui);
	const seg = (key: "motion", opts: [string, string][]) =>
		'<span class="seg2">' +
		opts
			.map(
				(o) =>
					'<button type="button" class="' +
					(String(L[key]) === String(o[0]) ? "on" : "") +
					'" data-look="set" data-k="' +
					key +
					'" data-v="' +
					o[0] +
					'">' +
					o[1] +
					"</button>",
			)
			.join("") +
		"</span>";
	h +=
		'<details class="look-adv"' +
		(ui.adv ? " open" : "") +
		"><summary>Advanced</summary>" +
		'<div class="look-card"><div class="look-row"><span><b>UI font size</b><small>Adjust the base size used for the Atelier</small></span><span class="look-ctl"><input class="inp num" type="number" min="11" max="22" step="0.5" data-lookn="uiFont" value="' +
		L.uiFont +
		'"> px</span></div>' +
		'<div class="look-row"><span><b>Code font size</b><small>Adjust the size used for macro text</small></span><span class="look-ctl"><input class="inp num" type="number" min="9" max="20" step="0.5" data-lookn="codeFont" value="' +
		L.codeFont +
		'"> px</span></div></div>' +
		'<div class="look-card"><div class="look-row"><span><b>Reduce motion</b><small>Reduce animations or match your system</small></span><span class="look-ctl">' +
		seg("motion", [
			["system", "System"],
			["on", "On"],
			["off", "Off"],
		]) +
		"</span></div>" +
		'<div class="look-row"><span><b>Separate light and dark modes</b><small>Choose a theme and colors for each</small></span><span class="look-ctl"><label class="switch"><input type="checkbox" data-look="separate"' +
		(L.separate ? " checked" : "") +
		"><i></i></label></span></div></div>" +
		'<div class="look-card"><div class="look-row"><b>Contrast</b><span class="look-ctl"><input type="range" min="0" max="100" data-lookn="contrast" value="' +
		L.contrast +
		'"><span class="cv">' +
		L.contrast +
		"</span></span></div></div>" +
		'<div class="row"><button type="button" class="btn sm ghost" data-look="reset">Reset appearance</button></div></details>';
	return h;
}

export function clickAction(
	st: ThemeState,
	ui: LookUi,
	a: string,
	v?: string,
	sideKey?: string,
	k?: string,
	importText?: string,
): void {
	const side = sideKey && (st.look as unknown as Record<string, Side>)[sideKey];
	if (a === "import-go" && sideKey) {
		try {
			applyImport(st, sideKey, importText as string);
		} catch {
			return; // legacy: toast('That is not an Atelier theme'), open unchanged
		}
		ui.open = null;
		return;
	}
	if (a === "mode") {
		st.theme = v as string;
	} else if (a === "toggle") {
		ui.open = ui.open === v ? null : (v as string);
	} else if (a === "theme" && side) {
		side.theme = v as string;
		side.bg = side.fg = null;
		if (side.accent === "custom") side.accentHex = null;
		ui.open = null;
	} else if (a === "accent" && side) {
		side.accent = v as string;
		ui.open = null;
	} else if (a === "clear" && side) {
		(side as unknown as Record<string, unknown>)[v as string] = null;
	} else if (a === "set") {
		(st.look as unknown as Record<string, unknown>)[k as string] = v;
	} else if (a === "reset") {
		st.look = defaultLook();
		st.theme = "system";
		ui.open = null;
	} else if (a === "import" && sideKey) {
		ui.open = ui.open === sideKey + ":import" ? null : sideKey + ":import";
	}
}

export function changeSeparate(
	st: ThemeState,
	ui: LookUi,
	checked: boolean,
): void {
	st.look.separate = checked;
	if (st.look.separate) {
		st.look.light = Object.assign({}, st.look.shared);
		st.look.dark = Object.assign({}, st.look.shared);
	}
	ui.adv = true;
}

export function changeLookn(
	st: ThemeState,
	ui: LookUi,
	n: string,
	value: string,
): void {
	const lim: Record<string, [number, number, number]> = {
		uiFont: [11, 22, 15],
		codeFont: [9, 20, 12.5],
		contrast: [0, 100, 50],
	};
	const l = lim[n];
	const v = +value;
	(st.look as unknown as Record<string, unknown>)[n] = Number.isNaN(v)
		? l[2]
		: Math.max(l[0], Math.min(l[1], v));
	ui.adv = true;
}

export function contrastInput(st: ThemeState, value: string): void {
	st.look.contrast = +value;
}

export function pickerInput(
	st: ThemeState,
	sideKey: string,
	key: string,
	curHex: string,
	kind: "color" | "hx" | "ch",
	value: string,
	ch?: string,
): string | null {
	const side = (st.look as unknown as Record<string, Side>)[sideKey];
	let v: string | null = null;
	if (kind === "color") v = value;
	else if (kind === "hx") {
		const r = hexRgb(value);
		if (r) v = rgbHex(r);
	} else {
		const cur = hexRgb(curHex) || [0, 0, 0];
		cur[+ch!] = clampInt(value, 0, 255, 0);
		v = rgbHex(cur);
	}
	if (!v) return null;
	(side as unknown as Record<string, unknown>)[key] = v;
	if (key === "accentHex") side.accent = "custom";
	return v;
}

export function exportThemeJson(side: Side, darkMode: boolean): string {
	const c = resolved(side, darkMode ? "dark" : "light");
	return JSON.stringify(
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
}

export function parseImport(text: string): {
	theme?: string;
	bg?: string;
	fg?: string;
	accentHex?: string;
} {
	const o = JSON.parse(text);
	const out: { theme?: string; bg?: string; fg?: string; accentHex?: string } =
		{};
	if (o.base && themeOf(o.base)[0] === o.base) out.theme = o.base;
	if (hexRgb(o.background)) out.bg = rgbHex(hexRgb(o.background) as number[]);
	if (hexRgb(o.foreground)) out.fg = rgbHex(hexRgb(o.foreground) as number[]);
	if (hexRgb(o.accent)) out.accentHex = rgbHex(hexRgb(o.accent) as number[]);
	return out;
}

export function applyImport(
	st: ThemeState,
	sideKey: string,
	text: string,
): void {
	const o = parseImport(text);
	const side = (st.look as unknown as Record<string, Side>)[sideKey];
	if (o.theme) side.theme = o.theme;
	if (o.bg) side.bg = o.bg;
	if (o.fg) side.fg = o.fg;
	if (o.accentHex) {
		side.accent = "custom";
		side.accentHex = o.accentHex;
	}
}

export { blankSide };
