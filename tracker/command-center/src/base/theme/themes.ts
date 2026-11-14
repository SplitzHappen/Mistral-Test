export type ThemeEntry = [string, string, string[], string[]];

export const THEMES: ThemeEntry[] = [
	[
		"crystarium-dawnglass",
		"Crystarium Dawnglass",
		["#d9e8f5", "#0d2133", "#b5476b", "#2f6fae"],
		["#0f2234", "#e0eefb", "#ffadc4", "#9ad4ff"],
	],
	[
		"ishgard-hoarfrost",
		"Ishgard Hoarfrost",
		["#dbe2e9", "#1b2128", "#3d6c96", "#8a6a1f"],
		["#1e2836", "#e6edf3", "#a9d3f5", "#e4c27a"],
	],
	[
		"limsa-brineward",
		"Limsa Brineward",
		["#d8e0ec", "#0f1b2b", "#c8202c", "#9a6c12"],
		["#0f1b2b", "#e3ebf5", "#ff4b4b", "#e3b04b"],
	],
	[
		"uldah-sultanate-gilt",
		"Ul'dah Sultanate Gilt",
		["#efe0b0", "#2a1f07", "#8f2236", "#7a5a00"],
		["#271c06", "#f7ecd2", "#ff6b82", "#ffc53d"],
	],
	[
		"twelveswood-verdure",
		"Twelveswood Verdure",
		["#dfeacd", "#16220f", "#3f7d18", "#8a5a00"],
		["#16220f", "#e4efd8", "#a6d65a", "#e8b84a"],
	],
	[
		"allagan-circuitry",
		"Allagan Circuitry",
		["#dde3e2", "#121818", "#a35f00", "#0f7f8c"],
		["#132020", "#dfe9e7", "#ffad2e", "#46d9ea"],
	],
	[
		"magitek-steel",
		"Magitek Steel",
		["#dcdfe2", "#16191c", "#0a7cc2", "#7a1f1f"],
		["#14171a", "#e6e9ec", "#3fc6ff", "#ff6b5b"],
	],
	[
		"umbral-astral",
		"Umbral Ice, Astral Fire",
		["#e4dcf0", "#170d26", "#c2410c", "#1f6fb2"],
		["#170d26", "#efe8fa", "#ff6a3d", "#7fd4ff"],
	],
	[
		"lily-of-thaliak",
		"Lily of the Healer",
		["#ece2e4", "#231a1c", "#2a7f50", "#c8283c"],
		["#221a1d", "#f3eaec", "#9fe3b8", "#ff8a9a"],
	],
	[
		"azure-dragoon",
		"Azure Dragoon",
		["#cfdcf7", "#0a1840", "#1846c8", "#56657f"],
		["#0e2257", "#e4ecfb", "#6ea2ff", "#d0dbee"],
	],
	[
		"abyssal-oath",
		"Abyssal Oath",
		["#efd8de", "#2a0b14", "#a8102c", "#5b3db0"],
		["#1f0a10", "#f2e0e5", "#ff3452", "#a98bff"],
	],
	[
		"moonfire-faire",
		"Moonfire Faire",
		["#f3d6ef", "#2a0d2a", "#b8128f", "#0b8a80"],
		["#2a0d2a", "#fbe6f8", "#ff4fd8", "#3cf0d0"],
	],
	[
		"starlight-celebration",
		"Starlight Celebration",
		["#e3eef0", "#0c2116", "#c21f35", "#1d7a43"],
		["#0c2116", "#e8f5ee", "#ffd166", "#ff4d5e"],
	],
	[
		"aetheryte-glow",
		"Aetheryte Glow",
		["#d2eff0", "#06292c", "#007c8a", "#9a6b00"],
		["#052628", "#d6f7f5", "#2ff0e0", "#ffd166"],
	],
	[
		"first-world-twilight",
		"First World Twilight",
		["#e3ddf6", "#1d1838", "#5a45c4", "#a07a00"],
		["#251b48", "#ece7ff", "#ffe08a", "#b9a8ff"],
	],
	[
		"ascian-crimson",
		"Ascian Crimson",
		["#e2dfdf", "#111111", "#c0080f", "#4d4d4d"],
		["#1a1213", "#efebeb", "#ff2424", "#bdbdbd"],
	],
	[
		"sharlayan-lore",
		"Sharlayan Lore",
		["#dfe1ea", "#181a26", "#7f5d0a", "#2d4f9e"],
		["#181a26", "#e6e8f2", "#e2bd52", "#86b8ea"],
	],
	[
		"radz-at-han-jewel",
		"Radz-at-Han Jewel",
		["#f6dcd6", "#2d0f1f", "#0a7a76", "#8f5600"],
		["#3a1624", "#fbe7f0", "#3fe0d6", "#ffc23d"],
	],
	[
		"doman-sakura",
		"Doman Sakura",
		["#f8dbe8", "#2b1424", "#c02d6c", "#3a4aa8"],
		["#2b1626", "#f8e6ef", "#ff9cc6", "#8ea2ff"],
	],
	[
		"ultima-thule",
		"Ultima Thule",
		["#dcdcef", "#0b0a1f", "#5a35d6", "#007f99"],
		["#100c26", "#e9e8ff", "#b07cff", "#4fe3ff"],
	],
	[
		"electrope-skyline",
		"Electrope Skyline",
		["#e3ebf7", "#0a1230", "#0a6c94", "#c2187a"],
		["#070a20", "#e6f4ff", "#38dcff", "#ff4fb8"],
	],
];

export type AccentEntry = [string, string] | [string, string, string, string];

export const ACCENTS: AccentEntry[] = [
	["default", "Default"],
	["blue", "Blue", "#0a6cff", "#4aa3ff"],
	["green", "Green", "#13864d", "#43c97f"],
	["yellow", "Yellow", "#a77b00", "#f2c94c"],
	["pink", "Pink", "#c8286f", "#ff6fae"],
	["orange", "Orange", "#c9531a", "#ff8a4c"],
	["purple", "Purple", "#7b4bd6", "#b18cff"],
	["neutral", "Black / White", "#111417", "#f0f0f0"],
	["custom", "Custom"],
];

export interface Side {
	theme: string;
	accent: string;
	accentHex: string | null;
	bg: string | null;
	fg: string | null;
}

export interface Look {
	separate: boolean;
	shared: Side;
	light: Side;
	dark: Side;
	uiFont: number;
	codeFont: number;
	motion: string;
	contrast: number;
}

export function blankSide(): Side {
	return {
		theme: "crystarium-dawnglass",
		accent: "default",
		accentHex: null,
		bg: null,
		fg: null,
	};
}

export function defaultLook(): Look {
	return {
		separate: false,
		shared: blankSide(),
		light: blankSide(),
		dark: blankSide(),
		uiFont: 15,
		codeFont: 12.5,
		motion: "system",
		contrast: 50,
	};
}

export function lookFromDoc(
	d: { look?: Partial<Look> } | null | undefined,
): Look {
	const l = defaultLook();
	if (d && d.look) {
		Object.assign(l, d.look);
		(["shared", "light", "dark"] as const).forEach((k) => {
			l[k] = Object.assign(blankSide(), (d.look as Look)[k] || {});
			if (!THEMES.some((x) => x[0] === l[k].theme))
				l[k].theme = "crystarium-dawnglass";
		});
	}
	return l;
}
