// Port of tracker/src/core/model.js: the Tracker's core model. Explicit imports replace the ET global.
import { env as defaultEnv } from "../env.ts";
import * as save from "./save.ts";
import { plain } from "./util.ts";

export const MAX_CHARS = 8;
export const STATE_VERSION = 1;

// mutable shared slot for ET.CLOUD_BASE (set by a page outside the Tracker; compat mirrors it)
export const shared: { CLOUD_BASE?: string } = {};

export const key = (sid: string, id: string | number): string => `${sid}:${id}`;

export interface IdxEntry {
	e: Record<string, unknown> & { al?: number[]; mv?: string; pv?: string[] };
	s: { id: string; t: string };
	g: { t: string };
}
export interface Idx {
	data: unknown;
	byKey: Map<string, IdxEntry>;
	sections: {
		id: string;
		t: string;
		area: string;
		folder: string;
		groups: { t: string; c: string; xp: string; keys: string[] }[];
	}[];
	routeTwin?: Map<string, string>;
}

export function indexData(data: {
	sections: {
		id: string;
		t: string;
		area: string;
		folder?: string;
		g: { t: string; c?: string; xp?: string; e: { i: number | string }[] }[];
	}[];
}): Idx {
	const byKey = new Map<string, IdxEntry>();
	const sections = [];
	for (const s of data.sections) {
		const groups = [];
		for (const g of s.g) {
			const keys = g.e.map((e) => {
				const k = key(s.id, e.i);
				byKey.set(k, {
					e: e as IdxEntry["e"],
					s: { id: s.id, t: s.t },
					g: { t: g.t },
				});
				return k;
			});
			groups.push({ t: g.t, c: g.c || "", xp: g.xp || "", keys });
		}
		sections.push({
			id: s.id,
			t: s.t,
			area: s.area,
			folder: s.folder || "",
			groups,
		});
	}
	return { data, byKey, sections };
}

export interface Char {
	id: string;
	name: string;
	lodestone: string | null;
	cls: string | null;
	city?: string | null;
	gc: number | null;
}
export interface State {
	v: number;
	chars: Char[];
	ticks: Record<string, Record<string, number>>;
	vals: Record<string, Record<string, number>>;
	excl: Record<string, Record<string, number>>;
	avail: Record<string, string>;
	settings: Record<string, boolean>;
	sync: {
		fc: Record<string, unknown>;
		drive: unknown;
		backupAt: number | null;
	};
	updated: number;
	modules?: Record<string, unknown>;
	moved?: { tracker?: unknown };
}

export function newState(names: unknown): State {
	if (!Array.isArray(names) || names.length < 1 || names.length > MAX_CHARS) {
		throw new Error(`Choose between 1 and ${MAX_CHARS} characters.`);
	}
	const chars = names.map((n, i) => ({
		id: `c${i + 1}`,
		name: cleanName(n) || `Character ${i + 1}`,
		lodestone: null,
		cls: null,
		gc: null,
	}));
	const ticks: State["ticks"] = {};
	const excl: State["excl"] = {};
	const vals: State["vals"] = {};
	for (const c of chars) {
		ticks[c.id] = {};
		excl[c.id] = {};
		vals[c.id] = {};
	}
	return {
		v: STATE_VERSION,
		chars,
		ticks,
		vals,
		excl,
		avail: {},
		settings: {
			countLimited: false,
			countGone: false,
			countUnknown: false,
			links: true,
			gold: true,
		},
		sync: { fc: {}, drive: null, backupAt: null },
		updated: defaultEnv.now(),
	};
}

export const CHAR_ID = /^c[1-8]$/;
export const ENTRY_KEY = /^[a-z0-9-]{1,40}:\d{1,9}$/;
const NAME_MAX = 40;
export const cleanName = (s: unknown): string =>
	String(s == null ? "" : s)
		.replace(/[\u0000-\u001f\u007f]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, NAME_MAX);
const keySet = (o: unknown) => {
	const out: Record<string, number> = {};
	if (plain(o))
		for (const k of Object.keys(o)) if (ENTRY_KEY.test(k) && o[k]) out[k] = 1;
	return out;
};
const levelMap = (o: unknown) => {
	const out: Record<string, number> = {};
	if (plain(o))
		for (const [k, v] of Object.entries(o)) {
			const n = Number(v);
			if (ENTRY_KEY.test(k) && Number.isFinite(n) && n >= 0)
				out[k] = Math.min(9999, Math.round(n));
		}
	return out;
};
const CLASSES = ["mrd", "acn", "lnc", "arc", "cnj", "gla", "pgl", "thm"];
const CITY_IDS = ["lim", "gri", "uld"];

export function validateState(st: State): State {
	const err = (m: string): never => {
		throw new Error(`Not a valid tracker file: ${m}`);
	};
	if (!plain(st)) err("empty");
	if (st.v !== STATE_VERSION) err(`unknown version ${st.v}`);
	if (
		!Array.isArray(st.chars) ||
		st.chars.length < 1 ||
		st.chars.length > MAX_CHARS
	)
		err("characters");
	const ids = new Set<string>();
	st.chars = st.chars.map((c, i) => {
		if (
			!plain(c) ||
			typeof c.id !== "string" ||
			!CHAR_ID.test(c.id) ||
			ids.has(c.id)
		)
			err("character ids");
		ids.add(c.id);
		const out: Char = {
			id: c.id,
			name: cleanName(c.name) || `Character ${i + 1}`,
			lodestone: null,
			cls: null,
			gc: null,
		};
		const lode = String(c.lodestone == null ? "" : c.lodestone);
		if (/^\d{3,12}$/.test(lode)) out.lodestone = lode;
		if (CLASSES.includes(c.cls as string)) out.cls = c.cls as string;
		else if (CITY_IDS.includes(c.city as string)) out.city = c.city as string;
		if ([1, 2, 3].includes(Number(c.gc))) out.gc = Number(c.gc);
		return out;
	});
	if (!plain(st.ticks)) err("ticks");
	const per = (src: unknown, fn: (x: unknown) => unknown) => {
		const out: Record<string, unknown> = {};
		for (const id of ids)
			out[id] = fn(
				plain(src) ? (Object.hasOwn(src, id) ? src[id] : null) : null,
			);
		return out;
	};
	st.ticks = per(st.ticks, keySet) as State["ticks"];
	st.excl = per(st.excl, keySet) as State["excl"];
	st.vals = per(st.vals, levelMap) as State["vals"];
	const avail: Record<string, string> = {};
	if (plain(st.avail))
		for (const [k, v] of Object.entries(st.avail))
			if (ENTRY_KEY.test(k) && (v === "x" || v === "ok"))
				avail[k] = v as string;
	st.avail = avail;
	const s = plain(st.settings) ? st.settings : {};
	st.settings = {
		countLimited: s.countLimited === true,
		countGone: s.countGone === true,
		countUnknown: s.countUnknown === true,
		links: s.links !== false,
		gold: s.gold !== false,
	};
	const sync: Record<string, unknown> = plain(st.sync) ? st.sync : {};
	const fc: Record<string, unknown> = {};
	if (plain(sync.fc))
		for (const id of ids) if (plain(sync.fc[id])) fc[id] = sync.fc[id];
	st.sync = {
		fc,
		drive: plain(sync.drive) ? sync.drive : null,
		backupAt: typeof sync.backupAt === "number" ? sync.backupAt : null,
	};
	if (st.modules !== undefined) st.modules = save.checkModules(st.modules);
	else delete st.modules;
	const mv =
		plain(st.moved) && plain((st.moved as Record<string, unknown>).tracker)
			? (st.moved as { tracker: Record<string, unknown> }).tracker
			: null;
	st.moved = mv
		? {
				tracker: {
					at: typeof mv.at === "number" ? mv.at : 0,
					from: typeof mv.from === "string" ? mv.from.slice(0, 20) : null,
					check: plain(mv.check) ? mv.check : null,
					confirmed: typeof mv.confirmed === "number" ? mv.confirmed : null,
					wentBack: typeof mv.wentBack === "number" ? mv.wentBack : null,
					oldSeen: typeof mv.oldSeen === "number" ? mv.oldSeen : null,
				},
			}
		: {};
	if (typeof st.updated !== "number") st.updated = defaultEnv.now();
	return st;
}

export function renameCharacter(
	st: State,
	charId: string,
	name: unknown,
): void {
	const c = st.chars.find((x) => x.id === charId);
	if (!c) throw new Error("No such character");
	c.name = cleanName(name) || c.name;
	st.updated = defaultEnv.now();
}

export function setCharacterCount(st: State, n: number): void {
	if (n < 1 || n > MAX_CHARS)
		throw new Error(`Choose between 1 and ${MAX_CHARS} characters.`);
	while (st.chars.length < n) {
		let k = 1;
		while (st.chars.some((c) => c.id === `c${k}`)) k++;
		const c: Char = {
			id: `c${k}`,
			name: `Character ${st.chars.length + 1}`,
			lodestone: null,
			cls: null,
			gc: null,
		};
		st.chars.push(c);
		st.ticks[c.id] = {};
		st.excl[c.id] = {};
		st.vals[c.id] = {};
	}
	while (st.chars.length > n) {
		const c = st.chars.pop() as Char;
		delete st.ticks[c.id];
		delete st.excl[c.id];
		delete st.vals[c.id];
		delete st.sync.fc[c.id];
	}
	st.updated = defaultEnv.now();
}

export function availability(
	st: State,
	k: string,
	entry?: Record<string, unknown> | null,
) {
	if (entry?.val && !entry.max)
		return {
			counted: false,
			info: true,
			manual: null,
			builtIn: null,
			marked: false,
		};
	const manual = st.avail[k];
	const builtIn = entry?.x ? (entry.x as string) : null;
	let counted: boolean;
	if (manual === "ok") counted = true;
	else if (manual === "x") counted = false;
	else if (builtIn === "lim") counted = !!st.settings.countLimited;
	else if (builtIn === "gone") counted = !!st.settings.countGone;
	else if (builtIn === "unk") counted = !!st.settings.countUnknown;
	else counted = true;
	return { counted, manual: manual || null, builtIn, marked: !counted };
}

export function setAvailability(st: State, k: string, value: string): void {
	if (value === "auto") delete st.avail[k];
	else if (value === "x" || value === "ok") st.avail[k] = value;
	else throw new Error(`Unknown availability ${value}`);
	st.updated = defaultEnv.now();
}

export function toggleAvailability(
	st: State,
	k: string,
	entry?: Record<string, unknown> | null,
): boolean {
	const now = availability(st, k, entry).counted;
	const want = now ? "x" : "ok";
	delete st.avail[k];
	if (availability(st, k, entry).counted !== !now) st.avail[k] = want;
	st.updated = defaultEnv.now();
	return !now;
}

export const getValue = (
	st: State,
	charId: string,
	k: string,
): number | null =>
	st.vals[charId] && st.vals[charId][k] != null ? st.vals[charId][k] : null;

export function setValue(
	st: State,
	charId: string,
	k: string,
	value: unknown,
	entry?: Record<string, unknown>,
): void {
	if (!st.vals[charId]) st.vals[charId] = {};
	const v =
		value === "" || value == null
			? null
			: Math.max(0, Math.min(9999, Math.round(Number(value))));
	if (v == null || Number.isNaN(v)) delete st.vals[charId][k];
	else st.vals[charId][k] = v;
	if (entry?.max)
		setTick(st, charId, k, v != null && v >= (entry.max as number));
	st.updated = defaultEnv.now();
}

export const START_CLASSES: [string, string, string][] = [
	["mrd", "Marauder", "lim"],
	["acn", "Arcanist", "lim"],
	["lnc", "Lancer", "gri"],
	["arc", "Archer", "gri"],
	["cnj", "Conjurer", "gri"],
	["gla", "Gladiator", "uld"],
	["pgl", "Pugilist", "uld"],
	["thm", "Thaumaturge", "uld"],
];
export const CITIES: Record<string, string> = {
	lim: "Limsa Lominsa",
	gri: "Gridania",
	uld: "Ul'dah",
};
export const GCS: Record<number, string> = {
	1: "Maelstrom",
	2: "Order of the Twin Adder",
	3: "Immortal Flames",
};
export const cityOf = (char?: Char | null): string | null => {
	const c = START_CLASSES.find((x) => x[0] === char?.cls);
	return c ? c[2] : char?.city || null;
};

export function setStart(
	st: State,
	charId: string,
	cls?: string | null,
	gc?: number | null,
): void {
	const c = st.chars.find((x) => x.id === charId);
	if (!c) throw new Error("No such character");
	if (cls !== undefined) {
		if (cls && !START_CLASSES.some((x) => x[0] === cls))
			throw new Error("Unknown starting class");
		c.cls = cls || null;
		if (cls) delete c.city;
	}
	if (gc !== undefined) {
		if (gc && !GCS[Number(gc)]) throw new Error("Unknown Grand Company");
		c.gc = gc ? Number(gc) : null;
	}
	st.updated = defaultEnv.now();
}

export function notApplicable(
	st: State,
	char: Char,
	k: string,
	entry?: Record<string, unknown> | null,
): string | null {
	if (st.excl[char.id] && st.excl[char.id][k]) return "manual";
	if (entry?.city) {
		const city = cityOf(char);
		if (city && entry.city !== city) return "city";
	}
	if (
		entry &&
		char.cls &&
		((entry.sc && entry.sc !== char.cls) || (entry.jc && entry.jc === char.cls))
	)
		return "cls";
	if (entry?.gc && char.gc && entry.gc !== char.gc) return "gc";
	return null;
}

export const isExcluded = (st: State, charId: string, k: string): boolean =>
	!!st.excl[charId]?.[k];

export function setExcluded(
	st: State,
	charId: string,
	k: string,
	on: boolean,
): void {
	if (!st.excl[charId]) throw new Error("No such character");
	if (on) st.excl[charId][k] = 1;
	else delete st.excl[charId][k];
	st.updated = defaultEnv.now();
}

export const isTicked = (st: State, charId: string, k: string): boolean =>
	!!st.ticks[charId]?.[k];

export function setTick(
	st: State,
	charId: string,
	k: string,
	on: boolean,
): void {
	const t = st.ticks[charId];
	if (!t) throw new Error("No such character");
	if (on) t[k] = 1;
	else delete t[k];
	st.updated = defaultEnv.now();
}

export function toggleTick(st: State, charId: string, k: string): boolean {
	const on = !isTicked(st, charId, k);
	setTick(st, charId, k, on);
	return on;
}

export function setMany(
	st: State,
	charIds: string[],
	keys: string[],
	on: boolean,
): void {
	for (const c of charIds)
		for (const k of keys) {
			if (on) st.ticks[c][k] = 1;
			else delete st.ticks[c][k];
		}
	st.updated = defaultEnv.now();
}

export function tally(idx: Idx, st: State, keys: string[]) {
	const done: Record<string, number> = {};
	const totals: Record<string, number> = {};
	for (const c of st.chars) {
		done[c.id] = 0;
		totals[c.id] = 0;
	}
	let total = 0;
	let marked = 0;
	for (const k of keys) {
		const hit = idx.byKey.get(k);
		if (!hit) continue;
		const av = availability(st, k, hit.e);
		if (av.info) continue;
		if (!av.counted) {
			marked++;
			continue;
		}
		total++;
		for (const c of st.chars) {
			if (notApplicable(st, c, k, hit.e)) continue;
			totals[c.id]++;
			if (st.ticks[c.id][k]) done[c.id]++;
		}
	}
	return { total, totals, done, marked };
}

export const sectionKeys = (sec: { groups: { keys: string[] }[] }): string[] =>
	sec.groups.flatMap((g) => g.keys);

export function migrateAliases(idx: Idx, st: State): number {
	let moved = 0;
	for (const [key, hit] of idx.byKey) {
		const olds = (hit.e.al || []).map((a) => `${hit.s.id}:${a}`);
		if (hit.e.mv) {
			olds.push(`${hit.e.mv}:${hit.e.i}`);
			for (const a of hit.e.al || []) olds.push(`${hit.e.mv}:${a}`);
		}
		for (const pv of hit.e.pv || []) olds.push(`${pv}:${hit.e.i}`);
		for (const old of olds) {
			if (old === key || idx.byKey.has(old)) continue;
			for (const c of st.chars) {
				for (const bag of [st.ticks[c.id], st.excl[c.id]])
					if (bag?.[old]) {
						bag[key] = 1;
						delete bag[old];
						moved++;
					}
				const v = st.vals[c.id];
				if (v && v[old] != null) {
					if (v[key] == null) v[key] = v[old];
					delete v[old];
					moved++;
				}
			}
			if (st.avail[old]) {
				if (!st.avail[key]) st.avail[key] = st.avail[old];
				delete st.avail[old];
				moved++;
			}
		}
	}
	if (!idx.routeTwin) {
		idx.routeTwin = new Map();
		for (const sec of idx.sections)
			for (const g of sec.groups) {
				const byName = new Map<string, string[]>();
				for (const k of g.keys) {
					const hit = idx.byKey.get(k);
					if (!hit) continue;
					const e = hit.e;
					if (e.sc || e.jc) {
						const list = byName.get(e.n as string) || [];
						list.push(k);
						byName.set(e.n as string, list);
					}
				}
				for (const ks of byName.values()) {
					const j = ks.find((k) => idx.byKey.get(k)?.e.jc);
					const sk = ks.find((k) => idx.byKey.get(k)?.e.sc);
					if (j && sk && idx.byKey.get(j)?.e.jc === idx.byKey.get(sk)?.e.sc)
						idx.routeTwin.set(j, sk);
				}
			}
	}
	for (const c of st.chars) {
		if (!c.cls) continue;
		for (const [j, sk] of idx.routeTwin) {
			if (idx.byKey.get(j)?.e.jc !== c.cls) continue;
			const t = st.ticks[c.id];
			if (t?.[j]) {
				t[sk] = 1;
				delete t[j];
				moved++;
			}
		}
	}
	if (moved) st.updated = defaultEnv.now();
	return moved;
}

export function summary(idx: Idx, st: State) {
	const out: { sections: Record<string, unknown>; all: unknown } = {
		sections: {},
		all: null,
	};
	let allKeys: string[] = [];
	for (const sec of idx.sections) {
		const keys = sectionKeys(sec);
		allKeys = allKeys.concat(keys);
		out.sections[sec.id] = tally(idx, st, keys);
	}
	out.all = tally(idx, st, allKeys);
	return out;
}

export const percent = (done: number, total: number): number =>
	total ? Math.floor((1000 * done) / total) / 10 : 0;
