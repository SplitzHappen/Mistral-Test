// Port of tracker/src/core/save.js: the one save shared by every module (gate 1C). Typed module; the CC
// global is replaced by this module's exports, assembled onto globalThis only by compat.ts.
// Clock and randomness come from the injectable env (setEnv), so tests can fix them.
import { env as defaultEnv, type Env } from "../env.ts";
import { plain } from "./util.ts";

export const APP = "eveniunt-command-center";
export const VERSION = 1;
const DB = "eveniunt-command-center";
const STORE = "save";
const KEY = "main";
const REV = "main-rev";
const LS = "eveniunt-command-center-save";
export const MAX_CHARS = 8;
const MODULE = /^[a-z][a-z0-9-]{0,31}$/;
const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
export const safeKey = (k: unknown): k is string =>
	typeof k === "string" &&
	k.length > 0 &&
	k.length <= 64 &&
	/^[A-Za-z0-9_.:-]+$/.test(k) &&
	!BAD_KEYS.has(k);

let env: Env = defaultEnv;
export function setEnv(e: Env): void {
	env = e;
}

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

// ------------------------------------------------------------------ checking outside data
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
function checkAtelier(sec: Record<string, unknown>): unknown {
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
const SUB_SEA_STARTS = new Set([31, 52, 73, 94, 115, 136]);
export const SUB_SECTOR_MAX = 149;
export const SUB_PART_SLOTS = "2301".repeat(10);
const isSector = (n: unknown): n is number =>
	Number.isInteger(n) &&
	(n as number) >= 1 &&
	(n as number) <= SUB_SECTOR_MAX &&
	!SUB_SEA_STARTS.has(n as number);
export const isSubSector = isSector;
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
function checkSettings(sec: Record<string, unknown>): unknown {
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
const CHECK: Record<string, (sec: Record<string, unknown>) => unknown> = {
	atelier: checkAtelier,
	submersibles: checkSubmersibles,
	settings: checkSettings,
};

export { CHECK, checkAtelier, checkSettings };

export function checkModules(mods: unknown): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!plain(mods)) return out;
	for (const [name, sec] of Object.entries(mods)) {
		if (name === "tracker" || !MODULE.test(name) || !plain(sec)) continue;
		const c = clean(sec, 0) as Record<string, unknown>;
		out[name] = CHECK[name] ? CHECK[name](c) : c;
	}
	return out;
}
export const others = (mods: unknown) => checkModules(mods);

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
	if (plain(mods.tracker)) out.modules.tracker = mods.tracker;
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

// ------------------------------------------------------------------ merging module sections
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
const LABEL: Record<string, string> = {
	atelier: "Atelier",
	lists: "Lists",
	submersibles: "Submersibles",
	settings: "Settings",
};
export function describeUnit(
	id: string,
	local: string | null,
	remote: string | null,
	nameOf?: (charId: string) => string,
) {
	let p: string[] = [];
	try {
		p = JSON.parse(id.slice(2)) as string[];
	} catch {
		/* shown as is */
	}
	const mod = LABEL[p[0]] || p[0];
	let what = `${mod}: ${p.slice(1).join(" › ")}`;
	if (p[0] === "atelier" && p[1] === "chars")
		what = `Atelier: crafter stats of ${nameOf ? nameOf(p[2]) : p[2]}`;
	else if (p[0] === "atelier" && p[1] === "unassigned")
		what = "Atelier: crafter stats not yet given to a character";
	else if (p[0] === "atelier" && p[1] === "saved") {
		let n = "";
		try {
			n = (JSON.parse(local || remote || "{}") as { name?: string }).name || "";
		} catch {
			/* none */
		}
		what = `Atelier: saved macro${n ? ` “${n}”` : ""}`;
	} else if (p[0] === "atelier" && p[1] === "prefs")
		what = `Atelier setting: ${p[2]}`;
	else if (p[0] === "submersibles" && ["fcs", "subs", "trips"].includes(p[1])) {
		let n = "";
		try {
			n = (JSON.parse(local || remote || "{}") as { name?: string }).name || "";
		} catch {
			/* none */
		}
		what =
			"Submersibles: " +
			(
				{
					fcs: "free company",
					subs: "submarine",
					trips: "logged voyage",
				} as Record<string, string>
			)[p[1]] +
			(n ? ` “${n}”` : "");
	} else if (p[0] === "submersibles" && p[1] === "settings")
		what = "Submersibles settings";
	return {
		who: "",
		what,
		local: local == null ? "(removed)" : "the version on this device",
		remote: remote == null ? "(removed)" : "the version on the other device",
	};
}

// ------------------------------------------------------------------ storage
interface Db {
	close(): void;
	transaction(store: string, mode: string): IDBTransactionLike;
}
interface IDBTransactionLike {
	objectStore(name: string): {
		get(key: string): IDBRequestLike;
		put(v: unknown, k: string): IDBRequestLike;
		getAllKeys(): IDBRequestLike;
	};
	oncomplete: (() => void) | null;
	onerror: (() => void) | null;
	onabort: (() => void) | null;
	abort(): void;
}
interface IDBRequestLike {
	result: unknown;
	onsuccess: (() => void) | null;
	onerror: (() => void) | null;
}
type OpenDb = () => Promise<Db>;
const openDb: OpenDb = () =>
	new Promise((resolve, reject) => {
		const idb = (
			globalThis as { indexedDB?: { open(name: string, v: number): unknown } }
		).indexedDB;
		if (!idb) return reject(new Error("no IndexedDB"));
		const req = idb.open(DB, 1) as {
			onupgradeneeded: (() => void) | null;
			onsuccess: (() => void) | null;
			onerror: (() => void) | null;
			onblocked: (() => void) | null;
			result: Db;
		};
		req.onupgradeneeded = () => {
			(
				req.result as unknown as { createObjectStore(n: string): void }
			).createObjectStore(STORE);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(new Error("open failed"));
		req.onblocked = () => reject(new Error("blocked"));
	});

interface Memory {
	[k: string]: unknown;
}
let memory: Memory = { [KEY]: null, [REV]: null };
const parseText = (text: unknown): unknown => {
	if (text == null) return null;
	try {
		return JSON.parse(text as string);
	} catch {
		return text;
	}
};
export let kind = "memory";
export function setKind(v: string): void {
	kind = v;
}

export async function read(): Promise<{
	raw: unknown;
	rev: string | null;
	kind: string;
}> {
	try {
		const db = await openDb();
		const out = await new Promise<{
			raw: unknown;
			rev: string | null;
			kind: string;
		}>((resolve, reject) => {
			const t = db.transaction(STORE, "readonly");
			const s = t.objectStore(STORE);
			const a = s.get(KEY);
			const b = s.get(REV);
			t.oncomplete = () =>
				resolve({
					raw: a.result == null ? null : a.result,
					rev: b.result == null ? null : (b.result as string),
					kind: "indexeddb",
				});
			t.onerror = () => reject(new Error("read failed"));
		});
		db.close();
		kind = "indexeddb";
		return out;
	} catch {
		/* fall through */
	}
	try {
		const ls = (globalThis as { localStorage?: Storage })
			.localStorage as Storage;
		const raw = ls.getItem(LS);
		kind = "localstorage";
		return {
			raw: parseText(raw),
			rev: ls.getItem(`${LS}-rev`),
			kind: "localstorage",
		};
	} catch {
		/* fall through */
	}
	kind = "memory";
	return {
		raw: memory[KEY],
		rev: memory[REV] as string | null,
		kind: "memory",
	};
}

const newRev = () =>
	env.now().toString(36) + env.random().toString(36).slice(2, 8);
const parse = parseText;

export async function transact(
	fn: (
		raw: unknown,
		rev: string | null,
		put: (key: string, value: unknown) => void,
	) => unknown,
): Promise<{ rev: string | null; wrote: boolean; kind: string }> {
	const rev = newRev();
	let db: Db | null = null;
	try {
		db = await openDb();
	} catch {
		db = null;
	}
	if (db) {
		let fnError: unknown = null;
		try {
			const out = await new Promise<{
				rev: string | null;
				wrote: boolean;
				kind: string;
			}>((resolve, reject) => {
				const t = db?.transaction(STORE, "readwrite");
				const s = t.objectStore(STORE);
				let result: {
					rev: string | null;
					wrote: boolean;
					kind: string;
				} | null = null;
				const a = s.get(KEY);
				const b = s.get(REV);
				b.onsuccess = () => {
					const cur = b.result == null ? null : (b.result as string);
					let doc: unknown;
					try {
						doc = fn(a.result == null ? null : a.result, cur, (k, v) =>
							s.put(v, k),
						);
					} catch (e) {
						fnError = e;
						t.abort();
						return;
					}
					if (doc) {
						s.put(doc, KEY);
						s.put(rev, REV);
						result = { rev, wrote: true, kind: "indexeddb" };
					} else result = { rev: cur, wrote: false, kind: "indexeddb" };
				};
				t.oncomplete = () =>
					resolve(
						result as { rev: string | null; wrote: boolean; kind: string },
					);
				t.onerror = () => reject(fnError || new Error("transact failed"));
				t.onabort = () =>
					reject(fnError || new Error("The save was interrupted."));
			});
			kind = "indexeddb";
			if (out.wrote) announce(out.rev as string);
			return out;
		} finally {
			db.close();
		}
	}
	let raw: unknown, cur: string | null;
	let lsOk = true;
	try {
		const ls = (globalThis as { localStorage?: Storage })
			.localStorage as Storage;
		raw = ls.getItem(LS);
		cur = ls.getItem(`${LS}-rev`);
	} catch {
		lsOk = false;
		raw = null;
		cur = null;
	}
	if (lsOk) {
		const extras: [string, unknown][] = [];
		const doc = fn(parse(raw), cur, (k, v) => extras.push([k, v]));
		kind = "localstorage";
		const ls = (globalThis as { localStorage?: Storage })
			.localStorage as Storage;
		for (const [k, v] of extras)
			ls.setItem(`${LS}:${k}`, typeof v === "string" ? v : JSON.stringify(v));
		if (!doc) return { rev: cur, wrote: false, kind: "localstorage" };
		ls.setItem(LS, JSON.stringify(doc));
		ls.setItem(`${LS}-rev`, rev);
		announce(rev);
		return { rev, wrote: true, kind: "localstorage" };
	}
	const doc = fn(memory[KEY], memory[REV] as string | null, () => {});
	kind = "memory";
	if (!doc)
		return { rev: memory[REV] as string | null, wrote: false, kind: "memory" };
	memory = { [KEY]: JSON.parse(JSON.stringify(doc)) as unknown, [REV]: rev };
	return { rev, wrote: true, kind: "memory" };
}

export const putExtra = (key: string, value: unknown) =>
	transact((_raw, _rev, put) => {
		put(key, value);
		return null;
	});

export async function extras(prefix: string): Promise<string[]> {
	try {
		const db = await openDb();
		const out = await new Promise<string[]>((resolve, reject) => {
			const t = db.transaction(STORE, "readonly");
			const r = t.objectStore(STORE).getAllKeys();
			t.oncomplete = () =>
				resolve(
					(r.result as string[]).filter((k) => String(k).startsWith(prefix)),
				);
			t.onerror = () => reject(new Error("extras failed"));
		});
		db.close();
		return out;
	} catch {
		try {
			const ls = (globalThis as { localStorage?: Storage })
				.localStorage as Storage;
			const out: string[] = [];
			for (let i = 0; i < ls.length; i++) {
				const k = ls.key(i);
				if (k?.startsWith(`${LS}:${prefix}`)) out.push(k.slice(LS.length + 1));
			}
			return out;
		} catch {
			return [];
		}
	}
}
export const resetMemory = () => {
	memory = { [KEY]: null, [REV]: null };
};

export async function writeSection(
	name: string,
	section: unknown,
	known: { rev: string | null; base: unknown } | null,
	own?: { moved?: unknown; device?: unknown },
): Promise<{
	rev: string | null;
	section: unknown;
	merged: boolean;
	doc: Doc;
}> {
	let out: { section: unknown; merged: boolean; doc: Doc } | null = null;
	const r = await transact((raw, rev) => {
		const doc = raw ? checkDoc(raw) : emptyDoc();
		const stored = doc.modules[name];
		let sec = (checkModules({ [name]: section })[name] || {}) as unknown;
		let merged = false;
		if (stored && rev !== known?.rev) {
			sec = (mergeModules(
				{ [name]: known?.base || {} },
				{ [name]: sec },
				{ [name]: stored },
			)[name] || {}) as unknown;
			merged = true;
		}
		doc.modules[name] = sec;
		if (own?.moved) doc.moved[name] = own.moved;
		if (own?.device) doc.device[name] = own.device;
		doc.updated = env.now();
		out = { section: sec, merged, doc };
		return doc;
	});
	return Object.assign(
		{ rev: r.rev },
		out as unknown as { section: unknown; merged: boolean; doc: Doc },
	);
}

// ------------------------------------------------------------------ other pages
const channel =
	typeof BroadcastChannel === "function"
		? new BroadcastChannel("eveniunt-command-center")
		: null;
if (
	channel &&
	typeof (channel as unknown as { unref?: () => void }).unref === "function"
)
	(channel as unknown as { unref: () => void }).unref();
export const PAGE_ID = defaultEnv.random().toString(36).slice(2);
const listeners: ((e: unknown) => void)[] = [];
export const onChange = (fn: (e: unknown) => void) => {
	listeners.push(fn);
};
if (channel)
	channel.onmessage = (e: MessageEvent) => {
		if (e.data && (e.data as { page?: string }).page !== PAGE_ID)
			listeners.forEach((fn) => {
				try {
					fn(e.data);
				} catch {
					/* a listener's problem stays its own */
				}
			});
	};
function announce(rev: string) {
	if (channel)
		try {
			channel.postMessage({ page: PAGE_ID, rev });
		} catch {
			/* ignore */
		}
}

// ------------------------------------------------------------------ compression (cloud copy)
async function pipe(
	bytes: Uint8Array,
	stream: unknown,
	limit?: number,
): Promise<Uint8Array> {
	const reader = (
		new Blob([bytes as BlobPart]).stream() as ReadableStream<Uint8Array>
	)
		.pipeThrough(
			stream as Parameters<ReadableStream<Uint8Array>["pipeThrough"]>[0],
		)
		.getReader() as ReadableStreamDefaultReader<Uint8Array>;
	const parts: Uint8Array[] = [];
	let n = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		n += value.length;
		if (limit && n > limit) {
			try {
				await reader.cancel();
			} catch {
				/* ignore */
			}
			throw new Error("too large");
		}
		parts.push(value);
	}
	const out = new Uint8Array(n);
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}
const b64 = (bytes: Uint8Array): string => {
	let s = "";
	for (let i = 0; i < bytes.length; i += 0x8000)
		s += String.fromCharCode.apply(
			null,
			Array.from(bytes.subarray(i, i + 0x8000)),
		);
	return btoa(s);
};
const unb64 = (s: string): Uint8Array => {
	const bin = atob(s);
	const b = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
	return b;
};
export const pack = async (text: string): Promise<string> =>
	b64(
		await pipe(
			new TextEncoder().encode(text),
			new CompressionStream("deflate-raw"),
		),
	);
export const unpack = async (data: unknown, limit?: number): Promise<string> =>
	new TextDecoder().decode(
		await pipe(
			unb64(String(data)),
			new DecompressionStream("deflate-raw"),
			limit || 256 * 1024 * 1024,
		),
	);
export const byteLength = (text: string): number =>
	new TextEncoder().encode(text).length;

export const DB_NAME = DB;
export const STORE_NAME = STORE;
export const LS_KEY = LS;
export const MODULE_RE = MODULE;
