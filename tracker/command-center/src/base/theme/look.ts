import { hexRgb, lum, mix, rgbHex } from "./color.ts";
import {
	ACCENTS,
	type Look,
	type Side,
	THEMES,
	type ThemeEntry,
} from "./themes.ts";

export type Mode = "light" | "dark";

export function themeOf(id: string): ThemeEntry {
	return THEMES.find((x) => x[0] === id) || THEMES[0];
}

export function sideFor(look: Look, mode: Mode): Side {
	return look.separate ? look[mode] : look.shared;
}

export function isDark(theme: string, mqDark: boolean): boolean {
	return theme === "dark" || (theme !== "light" && mqDark);
}

export function resolved(side: Side, mode: Mode): string[] {
	const th = themeOf(side.theme)[mode === "dark" ? 3 : 2];
	const acc =
		side.accent === "custom"
			? side.accentHex || th[2]
			: side.accent === "default"
				? th[2]
				: (ACCENTS.find((a) => a[0] === side.accent) || [])[
						mode === "dark" ? 3 : 2
					] || th[2];
	return [side.bg || th[0], side.fg || th[1], acc, th[3]];
}

export interface LookVars {
	vars: Record<string, string>;
	dataTheme: string;
	colorScheme: string;
	zoom: string;
	motion: string | null;
}

// Everything applyLook() sets on the page, as data (the compat layer writes it to the DOM).
export function lookVars(look: Look, theme: string, mqDark: boolean): LookVars {
	const mode: Mode = isDark(theme, mqDark) ? "dark" : "light";
	const c = resolved(sideFor(look, mode), mode);
	const bg = hexRgb(c[0]) as number[];
	const fg = hexRgb(c[1]) as number[];
	const ac = hexRgb(c[2]) as number[];
	const pg = hexRgb(c[3]) as number[];
	const k = 0.55 + (look.contrast / 100) * 0.9;
	const dk = lum(bg) < lum(fg);
	const vars: Record<string, string> = {};
	vars["--paper"] = rgbHex(bg);
	vars["--paper-2"] = mix(bg, fg, 0.05 * k);
	vars["--paper-3"] = mix(bg, fg, 0.1 * k);
	vars["--slip"] = mix(bg, dk ? fg : [255, 255, 255], dk ? 0.07 : 0.6);
	vars["--ink"] = rgbHex(fg);
	vars["--ink-2"] = mix(fg, bg, Math.max(0.08, 0.32 / k));
	vars["--ink-3"] = mix(fg, bg, Math.max(0.2, 0.5 / Math.sqrt(k)));
	vars["--rule"] = mix(bg, fg, Math.min(0.5, 0.18 * k));
	vars["--grid"] = "rgba(" + fg.join(",") + "," + (0.055 * k).toFixed(3) + ")";
	vars["--seal"] = rgbHex(ac);
	vars["--on-seal"] = lum(ac) > 0.42 ? "#111111" : "#ffffff";
	vars["--hi"] = "rgba(" + ac.join(",") + ",.16)";
	vars["--ochre"] = rgbHex(pg);
	vars["color-scheme"] = dk ? "dark" : "light";
	vars["--lb-a"] = dk ? mix(ac, [255, 255, 255], 0.55) : mix(ac, fg, 0.25);
	vars["--lb-b"] = rgbHex(ac);
	vars["--lb-c"] = rgbHex(pg);
	vars["--lb-glow"] = "rgba(" + ac.join(",") + "," + (dk ? ".5" : ".28") + ")";
	vars["--code-size"] = look.codeFont + "px";
	return {
		vars,
		dataTheme: dk ? "dark" : "light",
		colorScheme: dk ? "dark" : "light",
		zoom: look.uiFont === 15 ? "" : String(look.uiFont / 15),
		motion: look.motion === "system" ? null : look.motion,
	};
}
