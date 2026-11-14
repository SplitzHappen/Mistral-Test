// The pinned checker table of the one save (gate 1C): the order of the checkers, the generic cleaning applied
// before every checker, and the Tracker pass-through, exactly as tracker/src/core/save.js does them today.
// Pinned here BEFORE the core port (phase 3), with saved example documents in tests/connector/checkers.test.ts.

export const APP = "eveniunt-command-center";
export const VERSION = 1;
export const MAX_CHARS = 8;
export const MODULE = /^[a-z][a-z0-9-]{0,31}$/;

const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
export const safeKey = (k: unknown): k is string =>
	typeof k === "string" &&
	k.length > 0 &&
	k.length <= 64 &&
	/^[A-Za-z0-9_.:-]+$/.test(k) &&
	!BAD_KEYS.has(k);

const plain = (o: unknown): o is Record<string, unknown> =>
	!!o && typeof o === "object" && !Array.isArray(o);

export interface Char {
	id: string;
	name: string;
	lodestone: string | null;
	cls?: string | null;
	city?: string;
	gc: number | null;
}

export interface Doc {
	app: string;
	v: number;
	updated: number;
	chars: Char[];
	modules: Record<string, unknown>;
	device: Record<string, unknown>;
	moved: Record<string, unknown>;
}

// A JSON-safe copy with limits: plain objects with safe keys, arrays, finite numbers, short strings, booleans, null.
export function clean(v: unknown, depth = 0): unknown {
	if (v === null || typeof v === "boolean") return v;
	if (typeof v === "number") return Number.isFinite(v) ? v : null;
	if (typeof v === "string") return v.length > 20000 ? v.slice(0, 20000) : v;
	if (depth > 10) return null;
	if (Array.isArray(v)) return v.slice(0, 5000).map((x) => clean(x, depth + 1));
	if (plain(v)) {
		const o: Record<string, unknown> = {};
		for (const [k, x] of Object.entries(v))
			if (safeKey(k) && x !== undefined) o[k] = clean(x, depth + 1);
		return o;
	}
	return null;
}

const cleanName = (s: unknown): string =>
	String(s == null ? "" : s)
		.replace(/[\u0000-\u001f\u007f]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 40);

// Characters as every module sees them (the Tracker checks them fully with its own rules).
export function checkChars(chars: unknown): Char[] {
	const out: Char[] = [];
	const ids = new Set<string>();
	for (const c of Array.isArray(chars) ? chars.slice(0, MAX_CHARS) : []) {
		if (
			!plain(c) ||
			typeof c.id !== "string" ||
			!/^c[1-8]$/.test(c.id) ||
			ids.has(c.id)
		)
			continue;
		ids.add(c.id);
		const o: Char = {
			id: c.id,
			name: cleanName(c.name) || c.id,
			lodestone: /^\d{3,12}$/.test(String(c.lodestone || ""))
				? String(c.lodestone)
				: null,
			gc: [1, 2, 3].includes(Number(c.gc)) ? Number(c.gc) : null,
		};
		if (typeof c.cls === "string" && /^[a-z]{3}$/.test(c.cls)) o.cls = c.cls;
		else if (typeof c.city === "string" && /^[a-z]{3}$/.test(c.city))
			o.city = c.city;
		out.push(o);
	}
	return out;
}

// ---------------------------------------------------------------- the pinned checker table
// The Atelier's section: one crafter profile per character, the unassigned one, saved macros by id, and the prefs.
const int = (v: unknown, lo: number, hi: number, d: number): number => {
	const n = Math.round(Number(v));
	return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};
function statRow(s: Record<string, unknown>) {
	return {
		level: int(s.level, 1, 100, 100),
		craftsmanship: int(s.craftsmanship, 1, 99999, 4900),
		control: int(s.control, 1, 99999, 4800),
		cp: int(s.cp, 1, 9999, 620),
		manipulation: s.manipulation !== false,
		heartAndSoul: s.heartAndSoul === true,
		quickInnovation: s.quickInnovation === true,
	};
}
const item = (x: unknown) =>
	plain(x) && Number.isInteger(x.id) && (x.id as number) > 0
		? { id: x.id as number, hq: x.hq !== false }
		: null;
export function checkProfile(p: unknown): unknown {
	if (!plain(p)) return null;
	const stats: Record<string, unknown> = {};
	for (let j = 0; j < 8; j++) {
		const s = plain(p.stats) ? p.stats[`j${j}`] : null;
		if (plain(s)) stats[`j${j}`] = statRow(s);
	}
	return {
		stats,
		food: item(p.food),
		potion: item(p.potion),
		cosmicTool: p.cosmicTool !== false,
	};
}
const PREFS = [
	"macro",
	"savedCfg",
	"guideMs",
	"condModel",
	"mmSecPerStep",
	"solver",
	"target",
];
export function checkAtelier(sec: Record<string, unknown>): unknown {
	const out: Record<string, unknown> = {
		v: 1,
		chars: {},
		unassigned: checkProfile(sec.unassigned),
		saved: {},
		prefs: {},
	};
	if (plain(sec.chars))
		for (const [id, p] of Object.entries(sec.chars)) {
			const q = /^c[1-8]$/.test(id) && checkProfile(p);
			if (q) (out.chars as Record<string, unknown>)[id] = q;
		}
	if (plain(sec.saved))
		for (const [id, m] of Object.entries(sec.saved).slice(0, 500))
			if (plain(m)) (out.saved as Record<string, unknown>)[id] = m;
	if (plain(sec.prefs))
		for (const k of PREFS)
			if (sec.prefs[k] !== undefined && sec.prefs[k] !== null)
				(out.prefs as Record<string, unknown>)[k] = sec.prefs[k];
	return out;
}

// The Submersibles section (design 7.1; step S2), exactly as save.js checks it.
const SUB_SEA_STARTS = new Set([31, 52, 73, 94, 115, 136]);
export const SUB_SECTOR_MAX = 149;
export const SUB_PART_SLOTS = "2301".repeat(10);
const isSector = (n: unknown): n is number =>
	Number.isInteger(n) &&
	(n as number) >= 1 &&
	(n as number) <= SUB_SECTOR_MAX &&
	!SUB_SEA_STARTS.has(n as number);
const time = (v: unknown): number | undefined =>
	typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
const intIn = (v: unknown, lo: number, hi: number): number | undefined =>
	Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi
		? (v as number)
		: undefined;
const subName = (s: unknown, cap: number): string | undefined =>
	typeof s === "string"
		? s
				.replace(/[\u0000-\u001f\u007f]/g, " ")
				.replace(/\s+/g, " ")
				.trim()
				.slice(0, cap)
		: undefined;
const sectors = (a: unknown, max?: number): number[] | undefined => {
	if (!Array.isArray(a)) return undefined;
	const out: number[] = [];
	for (const n of a) if (isSector(n) && !out.includes(n)) out.push(n);
	return max ? out.slice(0, max) : out;
};
const keep = <T extends Record<string, unknown>>(o: T): T => {
	for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
	return o;
};
const hhmm = (w: unknown) =>
	plain(w) &&
	intIn(w.from, 0, 1439) !== undefined &&
	intIn(w.to, 0, 1439) !== undefined
		? { from: w.from as number, to: w.to as number }
		: undefined;
function subParts(p: unknown): number[] | undefined {
	if (!Array.isArray(p) || p.length !== 4) return undefined;
	return p.every(
		(id, i) =>
			Number.isInteger(id) &&
			(id as number) >= 1 &&
			(id as number) <= SUB_PART_SLOTS.length &&
			SUB_PART_SLOTS[(id as number) - 1] === String(i),
	)
		? (p as number[]).slice()
		: undefined;
}
function subVoyage(v: unknown): unknown {
	if (!plain(v) || time(v.returnAt) === undefined) return null;
	return keep({
		sentAt: time(v.sentAt),
		route: sectors(v.route, 5) || [],
		returnAt: v.returnAt,
		calcAt: time(v.calcAt),
		gameSaid: subName(v.gameSaid, 40),
	});
}
export function checkSubmersibles(sec: Record<string, unknown>): unknown {
	const out: Record<string, unknown> = {
		fcs: {},
		subs: {},
		trips: {},
		settings: {},
	};
	if (plain(sec.fcs))
		for (const [id, f] of Object.entries(sec.fcs)) {
			if (!plain(f)) continue;
			(out.fcs as Record<string, unknown>)[id] = keep({
				name: subName(f.name, 40),
				world: subName(f.world, 32),
				charId:
					typeof f.charId === "string" && /^c[1-8]$/.test(f.charId)
						? f.charId
						: f.charId === null
							? null
							: undefined,
				order: intIn(f.order, 0, 9999),
				unlockedSlots: intIn(f.unlockedSlots, 1, 4),
				discovered: sectors(f.discovered),
			});
		}
	if (plain(sec.subs))
		for (const [id, s] of Object.entries(sec.subs)) {
			if (!plain(s) || !safeKey(s.fcId) || intIn(s.slot, 1, 4) === undefined)
				continue;
			(out.subs as Record<string, unknown>)[id] = keep({
				fcId: s.fcId,
				slot: s.slot,
				name: subName(s.name, 20),
				rank: intIn(s.rank, 1, 145),
				expIntoRank: intIn(s.expIntoRank, 0, 1e9),
				parts: subParts(s.parts),
				voyage: subVoyage(s.voyage),
			});
		}
	if (plain(sec.trips))
		for (const [id, t] of Object.entries(sec.trips)) {
			if (!plain(t) || !safeKey(t.s) || time(t.t) === undefined) continue;
			const items = Array.isArray(t.items)
				? t.items
						.filter(
							(x) =>
								Array.isArray(x) &&
								x.length === 2 &&
								intIn(x[0], 1, 1e7) !== undefined &&
								intIn(x[1], 1, 1e6) !== undefined,
						)
						.map((x) => [x[0], x[1]])
				: [];
			(out.trips as Record<string, unknown>)[id] = keep({
				s: t.s,
				t: t.t,
				r: sectors(t.r, 5) || [],
				back: time(t.back),
				calc: time(t.calc),
				said: subName(t.said, 40),
				items,
				newSectors: sectors(t.newSectors) || [],
				rankAfter: intIn(t.rankAfter, 1, 145),
				rankCalc: intIn(t.rankCalc, 1, 145),
			});
		}
	const p =
		plain(sec.settings) && plain(sec.settings.prefs)
			? (sec.settings as Record<string, unknown>).prefs
			: null;
	if (p && plain(p))
		(out.settings as Record<string, unknown>).prefs = keep({
			sort: ["fc", "time"].includes(p.sort as string) ? p.sort : undefined,
			grouping: ["auto", "sub", "fc", "fleet"].includes(p.grouping as string)
				? p.grouping
				: undefined,
			night: ["always", "quiet"].includes(p.night as string)
				? p.night
				: undefined,
			quietHours: hhmm(p.quietHours),
			window: hhmm(p.window),
			priceWorld: subName(p.priceWorld, 32),
		});
	return out;
}

// The Command Center's own settings (the base owns this section).
export function checkSettings(sec: Record<string, unknown>): unknown {
	const out: Record<string, unknown> = {};
	const n = plain(sec.notify) ? sec.notify : null;
	if (n)
		out.notify = keep({
			night: ["always", "quiet"].includes(n.night as string)
				? n.night
				: undefined,
			quietHours: hhmm(n.quietHours),
		});
	return out;
}

// THE TABLE, in the pinned order: atelier, submersibles, settings (as `const CHECK = { atelier, submersibles, settings }` in save.js).
export const CHECK_ORDER = ["atelier", "submersibles", "settings"] as const;
export const CHECK: ReadonlyArray<
	readonly [string, (sec: Record<string, unknown>) => unknown]
> = [
	["atelier", checkAtelier],
	["submersibles", checkSubmersibles],
	["settings", checkSettings],
];
const checkByName = (
	name: string,
): ((sec: Record<string, unknown>) => unknown) | undefined =>
	CHECK.find(([n]) => n === name)?.[1];

// Every section except the Tracker's: generic cleaning first, then the section's checker, or the cleaned value
// for a section this app does not know (kept as plain data, never dropped).
export function checkModules(mods: unknown): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!plain(mods)) return out;
	for (const [name, sec] of Object.entries(mods)) {
		if (name === "tracker" || !MODULE.test(name) || !plain(sec)) continue;
		const c = clean(sec, 0) as Record<string, unknown>;
		const checker = checkByName(name);
		out[name] = checker ? checker(c) : c;
	}
	return out;
}

// The whole save. The Tracker's section passes through raw (checked by the Tracker itself). Throws on anything
// that is not a Command Center save; a newer version throws with code 'newer'.
export function checkDoc(doc: unknown): Doc {
	if (!plain(doc) || doc.app !== APP)
		throw new Error("not a Command Center save");
	if (!Number.isInteger(doc.v) || (doc.v as number) < 1)
		throw new Error("unknown save version");
	if ((doc.v as number) > VERSION)
		throw Object.assign(
			new Error(
				"This save was written by a newer version of the app. Reload the page to update.",
			),
			{ code: "newer" },
		);
	const mods = plain(doc.modules) ? doc.modules : {};
	const out: Doc = {
		app: APP,
		v: VERSION,
		updated: typeof doc.updated === "number" ? doc.updated : 0,
		chars: checkChars(doc.chars),
		modules: checkModules(mods),
		device: plain(doc.device)
			? (clean(doc.device, 0) as Record<string, unknown>)
			: {},
		moved: plain(doc.moved)
			? (clean(doc.moved, 0) as Record<string, unknown>)
			: {},
	};
	if (plain(mods.tracker)) out.modules.tracker = mods.tracker; // pass-through: never cleaned, never checked here
	return out;
}

export const emptyDoc = (): Doc => ({
	app: APP,
	v: VERSION,
	updated: 0,
	chars: [],
	modules: {},
	device: {},
	moved: {},
});

// ---------------------------------------------------------------- unit merge (writeSection semantics)
export const UNIT_DEPTH = 2;
function walk(
	obj: Record<string, unknown>,
	path: string[],
	depth: number,
	map: Map<string, string>,
): void {
	for (const [k, v] of Object.entries(obj)) {
		if (!safeKey(k) || v === undefined) continue;
		const p = path.concat(k);
		if (depth > 1 && plain(v) && Object.keys(v).length)
			walk(v, p, depth - 1, map);
		else map.set(`m|${JSON.stringify(p)}`, JSON.stringify(v));
	}
}
export function flatModules(
	mods: unknown,
	map?: Map<string, string>,
): Map<string, string> {
	map = map || new Map();
	if (!plain(mods)) return map;
	for (const [name, sec] of Object.entries(mods))
		if (name !== "tracker" && MODULE.test(name) && plain(sec))
			walk(sec, [name], UNIT_DEPTH, map);
	return map;
}
export function unflatModules(
	map: Map<string, string>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	const entries = [...map]
		.filter(([k]) => k.startsWith("m|"))
		.map(([k, v]) => {
			try {
				return [JSON.parse(k.slice(2)), JSON.parse(v)] as [unknown, unknown];
			} catch {
				return null;
			}
		})
		.filter(
			(x): x is [string[], unknown] =>
				!!x &&
				Array.isArray(x[0]) &&
				x[0].length >= 2 &&
				MODULE.test(x[0][0]) &&
				x[0][0] !== "tracker" &&
				x[0].slice(1).every(safeKey),
		)
		.sort((a, b) => a[0].length - b[0].length);
	for (const [p, val] of entries) {
		let o = out;
		for (let i = 0; i < p.length - 1; i++) {
			if (!plain(o[p[i]])) o[p[i]] = {};
			o = o[p[i]] as Record<string, unknown>;
		}
		const last = p[p.length - 1];
		if (plain(val) && !Object.keys(val).length && plain(o[last])) continue;
		o[last] = val;
	}
	return checkModules(out);
}
// Three-way merge of the units of every section except the Tracker's. Clashes keep the local unit.
export function mergeModules(
	base: unknown,
	local: unknown,
	remote: unknown,
): Record<string, unknown> {
	const B = flatModules(base);
	const L = flatModules(local);
	const R = flatModules(remote);
	const m = new Map<string, string>();
	for (const k of new Set([...B.keys(), ...L.keys(), ...R.keys()])) {
		const b = B.get(k);
		const l = L.get(k);
		const r = R.get(k);
		const v = l === r ? l : l === b ? r : l;
		if (v !== undefined) m.set(k, v);
	}
	return unflatModules(m);
}
