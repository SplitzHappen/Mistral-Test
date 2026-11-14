// Port of tracker/src/core/storage.js: saving on this device into the one save, the move-in and catch-up
// bookkeeping. Explicit imports replace CC/ET.
import { env as defaultEnv } from "../env.ts";
import * as codec from "./codec.ts";
import * as merge from "./merge.ts";
import * as model from "./model.ts";
import * as save from "./save.ts";
import { plain, stamp } from "./util.ts";

const OLD_DB = "eveniunt-tracker";
const OLD_STORE = "state";
const OLD_KEY = "main";
const OLD_LS = "eveniunt-tracker-state";

export let storageKind = "memory";
export function setStorageKind(v: string): void {
	storageKind = v;
}
export let loadProblem: { message: string; raw: string } | null = null;
export let moveProblem: { stage: string; what: unknown } | null = null;
export let saveDisabled = false;
export let justMoved = false;
export let caughtUp = false;
export let moveFrom: string | null = null;

let memory: model.State | null = null;

export function docFromState(st: model.State, keep?: save.Doc): save.Doc {
	const k = keep || save.emptyDoc();
	const sv = codec.saveDoc(st);
	const others = st.modules !== undefined ? st.modules : save.others(k.modules);
	return {
		app: save.APP,
		v: save.VERSION,
		updated: st.updated || defaultEnv.now(),
		chars: sv.chars as save.Char[],
		modules: Object.assign(JSON.parse(JSON.stringify(others)), {
			tracker: sv.modules.tracker,
		}),
		device: Object.assign({}, k.device || {}, { tracker: { sync: st.sync } }),
		moved: Object.assign(
			{},
			k.moved || {},
			st.moved?.tracker ? { tracker: st.moved.tracker } : {},
		),
	};
}
const docPortable = (doc: save.Doc) => codec.fromSaveDoc(doc);
export function stateFromDoc(doc: save.Doc): model.State | null {
	if (!doc.chars.length) return null;
	const dev = plain(doc.device.tracker)
		? (doc.device.tracker as Record<string, unknown>)
		: {};
	return model.validateState(
		Object.assign({ v: model.STATE_VERSION }, docPortable(doc) as object, {
			sync: dev.sync,
			updated: doc.updated || defaultEnv.now(),
			moved: plain(doc.moved.tracker) ? { tracker: doc.moved.tracker } : {},
		}) as model.State,
	);
}

const canon = (v: unknown) =>
	JSON.stringify(v, (_k, x) =>
		plain(x)
			? Object.keys(x)
					.sort()
					.reduce((o: Record<string, unknown>, kk) => {
						o[kk] = x[kk];
						return o;
					}, {})
			: x,
	);
export function compareTracker(a: model.State, b: model.State): string | null {
	const pa = codec.portable(a);
	const pb = codec.portable(b);
	for (const f of [
		"chars",
		"ticks",
		"excl",
		"vals",
		"avail",
		"settings",
	] as const)
		if (canon(pa[f]) !== canon(pb[f])) return f;
	return null;
}
const count = (per: unknown): number =>
	Object.values(plain(per) ? (per as Record<string, unknown>) : {}).reduce(
		(n: number, o) => n + Object.keys(plain(o) ? (o as object) : {}).length,
		0,
	);
export const moveSummary = (st: model.State) => ({
	chars: st.chars.length,
	ticks: count(st.ticks),
	excl: count(st.excl),
	vals: count(st.vals),
	avail: Object.keys(st.avail || {}).length,
	same: true,
});

interface DbLike {
	close(): void;
	transaction(store: string, mode: string): TxLike;
}
interface TxLike {
	objectStore(name: string): { get(k: string): ReqLike };
	oncomplete: (() => void) | null;
	onerror: (() => void) | null;
	abort(): void;
}
interface ReqLike {
	result: unknown;
	onsuccess: (() => void) | null;
	onerror: (() => void) | null;
}
function openOld(): Promise<DbLike> {
	return new Promise((resolve, reject) => {
		const idb = (globalThis as { indexedDB?: { open(name: string): unknown } })
			.indexedDB;
		if (!idb) return reject(new Error("no IndexedDB"));
		const req = idb.open(OLD_DB) as {
			onupgradeneeded: (() => void) | null;
			onsuccess: (() => void) | null;
			onerror: (() => void) | null;
			result: DbLike;
			transaction: { abort(): void };
		};
		req.onupgradeneeded = () => {
			req.transaction.abort();
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(new Error("none"));
	});
}
export async function readOldSave(): Promise<
	| { st: model.State; from: string; raw: unknown }
	| { problem: Error; raw: unknown; from: string }
	| null
> {
	let raw: unknown = null;
	let from: string | null = null;
	try {
		const db = await openOld();
		try {
			raw = await new Promise((resolve, reject) => {
				const t = db.transaction(OLD_STORE, "readonly");
				const r = t.objectStore(OLD_STORE).get(OLD_KEY);
				t.oncomplete = () => resolve(r.result == null ? null : r.result);
				t.onerror = () => reject(new Error("read failed"));
			});
		} finally {
			db.close();
		}
		if (raw != null) from = "indexeddb";
	} catch {
		raw = null;
	}
	if (raw == null) {
		try {
			const t = (
				globalThis as { localStorage?: Storage }
			).localStorage?.getItem(OLD_LS);
			if (t != null) {
				raw = t;
				from = "localstorage";
			}
		} catch {
			/* none */
		}
	}
	if (raw == null) return null;
	try {
		const st = model.validateState(
			JSON.parse(
				typeof raw === "string" ? raw : JSON.stringify(raw),
			) as model.State,
		);
		return { st, from: from as string, raw };
	} catch (e) {
		return { problem: e as Error, raw, from: from as string };
	}
}

async function rescue(raw: unknown, err: unknown): Promise<void> {
	const text =
		typeof raw === "string"
			? raw
			: (() => {
					try {
						return JSON.stringify(raw);
					} catch {
						return String(raw);
					}
				})();
	loadProblem = {
		message:
			err && (err as Error).message ? (err as Error).message : String(err),
		raw: text,
	};
	try {
		await save.putExtra(`main-unreadable-${stamp()}`, text);
	} catch {
		/* the copy stays in loadProblem for download */
	}
}

let myRev: string | null = null;
let myBase: unknown = null;
let carry: { modules?: unknown; moved?: unknown } | null = null;
function remember(rev: string | null, portable: unknown): void {
	myRev = rev;
	myBase = portable ? JSON.parse(JSON.stringify(portable)) : null;
}
export function saveMerge(
	snap: model.State,
	storedRev: string | null,
	stored: unknown,
	knownRev: string | null,
	base: unknown,
): { state: model.State; merged: boolean } {
	if (!stored || storedRev === knownRev) return { state: snap, merged: false };
	let other = stored;
	if (
		plain(stored) &&
		(stored as unknown as model.State).v === model.STATE_VERSION
	) {
		try {
			other = codec.portable(
				model.validateState(
					JSON.parse(
						JSON.stringify(stored),
					) as unknown as unknown as model.State,
				),
			);
		} catch {
			return { state: snap, merged: false };
		}
	}
	const out = JSON.parse(JSON.stringify(snap)) as model.State;
	merge.applyMerge(out, merge.threeWay(base, codec.portable(snap), other), {});
	out.sync = snap.sync;
	out.moved = snap.moved;
	return { state: model.validateState(out), merged: true };
}

async function moveOld(old: {
	st: model.State;
	from: string;
	raw: unknown;
}): Promise<model.State | null> {
	const at = defaultEnv.now();
	let res: { already?: save.Doc; mismatch?: string; doc?: save.Doc } | null =
		null;
	const w = await save.transact((raw) => {
		const doc = raw != null ? save.checkDoc(raw) : save.emptyDoc();
		if (doc.moved.tracker) {
			res = { already: doc };
			return null;
		}
		const st = JSON.parse(JSON.stringify(old.st)) as model.State;
		st.modules = save.others(doc.modules);
		st.moved = {
			tracker: {
				at,
				from: old.from,
				check: moveSummary(old.st),
				confirmed: null,
				wentBack: null,
			},
		};
		const nd = docFromState(st, doc);
		const back = stateFromDoc(
			save.checkDoc(JSON.parse(JSON.stringify(nd)) as unknown),
		);
		const diff = back ? compareTracker(old.st, back) : "chars";
		if (diff) {
			res = { mismatch: diff };
			return null;
		}
		res = { doc: nd };
		return nd;
	});
	storageKind = w.kind;
	const resR = res as { mismatch?: string; doc?: save.Doc } | null;
	if (resR?.mismatch) {
		moveProblem = { stage: "before", what: resR.mismatch };
		saveDisabled = true;
		return old.st;
	}
	const r = await save.read();
	let doc: save.Doc | null = null;
	let after: model.State | null = null;
	try {
		doc = save.checkDoc(r.raw);
		after = stateFromDoc(doc);
	} catch {
		after = null;
	}
	if (resR?.doc) {
		const diff = after ? compareTracker(old.st, after) : "unreadable";
		if (diff) {
			moveProblem = { stage: "after", what: diff };
			saveDisabled = true;
			return old.st;
		}
		justMoved = true;
	}
	lastRead = { rev: r.rev, base: doc ? docPortable(doc) : null };
	remember(r.rev, lastRead.base);
	if (!after) carry = { modules: doc ? save.others(doc.modules) : {} };
	return after;
}

const PLACEHOLDER = /^Character \d+$/;
const empty = (bags: unknown) =>
	Object.values(plain(bags) ? (bags as Record<string, unknown>) : {}).every(
		(o) => !o || !Object.keys(o as object).length,
	);
export const untouched = (st: model.State | null): boolean =>
	!st ||
	((st.chars || []).every(
		(c) =>
			PLACEHOLDER.test(c.name || "") &&
			!c.lodestone &&
			!c.cls &&
			!c.city &&
			!c.gc,
	) &&
		empty(st.ticks) &&
		empty(st.excl) &&
		empty(st.vals) &&
		!Object.keys(st.avail || {}).length);
export function catchUpMerge(cur: model.State, old: model.State): model.State {
	if (untouched(cur))
		return model.validateState(
			JSON.parse(
				JSON.stringify(Object.assign({}, old, { modules: undefined })),
			) as model.State,
		);
	const res = merge.threeWay(null, codec.portable(cur), codec.portable(old));
	const choices: Record<string, string> = {};
	const out = JSON.parse(JSON.stringify(cur)) as model.State;
	merge.applyMerge(out, res, choices);
	return model.validateState(out);
}
async function catchUp(
	doc: save.Doc,
	st: model.State | null,
): Promise<model.State | null> {
	const mv = doc.moved.tracker as Record<string, unknown>;
	if (saveDisabled) return null;
	let old: Awaited<ReturnType<typeof readOldSave>> = null;
	try {
		old = await readOldSave();
	} catch {
		return null;
	}
	if (!old || !("st" in old) || !old.st) return null;
	const seen =
		typeof mv.oldSeen === "number"
			? (mv.oldSeen as number)
			: typeof mv.at === "number"
				? (mv.at as number)
				: 0;
	let stored: unknown = null;
	try {
		stored = JSON.parse(
			typeof old.raw === "string" ? old.raw : JSON.stringify(old.raw),
		).updated;
	} catch {
		stored = null;
	}
	if (!(typeof stored === "number" && stored > seen)) return null;
	const next = catchUpMerge(st as model.State, old.st);
	next.modules = save.others(doc.modules);
	next.sync = st ? st.sync : next.sync;
	next.moved = { tracker: Object.assign({}, mv, { oldSeen: stored }) };
	next.updated = defaultEnv.now();
	const v = model.validateState(next);
	if (!(await saveState(v, true))) return null;
	caughtUp = true;
	return v;
}

let lastRead: { rev: string | null; base: unknown } | null = null;
export const acceptLoaded = () => {
	if (lastRead) remember(lastRead.rev, lastRead.base);
};
export const loadState = async (
	peek?: boolean,
): Promise<model.State | null> => {
	let r: { raw: unknown; rev: string | null; kind: string };
	try {
		r = await save.read();
	} catch {
		r = { raw: null, rev: null, kind: "memory" };
	}
	storageKind = r.kind;
	let doc: save.Doc | null = null;
	if (r.raw != null) {
		try {
			doc = save.checkDoc(r.raw);
		} catch (e) {
			if (peek) return null;
			await rescue(r.raw, e);
			remember(r.rev, null);
			carry = { modules: {} };
			return null;
		}
	}
	if (doc?.moved.tracker) {
		let st: model.State | null;
		try {
			st = stateFromDoc(doc);
		} catch (e) {
			if (peek) return null;
			await rescue(r.raw, e);
			remember(r.rev, null);
			carry = { modules: save.others(doc.modules) };
			return null;
		}
		if (peek) {
			lastRead = { rev: r.rev, base: docPortable(doc) };
			return st;
		}
		lastRead = { rev: r.rev, base: docPortable(doc) };
		remember(lastRead.rev, lastRead.base);
		if (!st)
			carry = { modules: save.others(doc.modules), moved: doc.moved.tracker };
		const caught = await catchUp(doc, st);
		return caught || st;
	}
	if (peek) return null;
	const old = await readOldSave();
	if (old && "st" in old && old.st)
		return moveOld(old as { st: model.State; from: string; raw: unknown });
	if (old && "problem" in old) {
		await rescue(old.raw, old.problem);
		moveFrom = "unreadable";
	} else moveFrom = "none";
	remember(r.rev, doc ? docPortable(doc) : null);
	carry = { modules: doc ? save.others(doc.modules) : {} };
	return memory ? model.validateState(memory) : null;
};

export const requestPersistence = async (): Promise<boolean | null> => {
	try {
		const nav = (
			globalThis as {
				navigator?: {
					storage?: {
						persisted(): Promise<boolean>;
						persist(): Promise<boolean>;
					};
				};
			}
		).navigator;
		if (nav?.storage?.persist)
			return (await nav.storage.persisted()) || (await nav.storage.persist());
	} catch {
		/* ignore */
	}
	return null;
};

const channel =
	typeof BroadcastChannel === "function"
		? new BroadcastChannel("eveniunt-tracker")
		: null;
if (
	channel &&
	typeof (channel as unknown as { unref?: () => void }).unref === "function"
)
	(channel as unknown as { unref: () => void }).unref();
export const TAB_ID = defaultEnv.random().toString(36).slice(2);
export let onOtherTabSave: ((updated: unknown) => void) | null = null;
if (channel)
	channel.onmessage = (e: MessageEvent) => {
		if (
			e.data &&
			(e.data as { tab?: string }).tab !== TAB_ID &&
			typeof onOtherTabSave === "function"
		)
			onOtherTabSave((e.data as { updated: unknown }).updated);
	};
export let onSaveResult: ((ok: boolean) => void) | null = null;
export let onSaveMerged: ((merged: unknown, snap: unknown) => void) | null =
	null;

let timer: ReturnType<typeof setTimeout> | null = null;
let pendingState: model.State | null = null;
export function saveState(st: model.State, now?: boolean): Promise<boolean> {
	pendingState = st;
	if (timer) clearTimeout(timer);
	const run = async (): Promise<boolean> => {
		if (timer) clearTimeout(timer);
		timer = null;
		if (pendingState?.modules === undefined)
			pendingState!.modules = JSON.parse(
				JSON.stringify(carry?.modules || {}),
			) as Record<string, unknown>;
		if (!pendingState?.moved?.tracker)
			pendingState!.moved = {
				tracker: carry?.moved || {
					at: defaultEnv.now(),
					from: moveFrom || "none",
					check: null,
					confirmed: null,
					wentBack: null,
				},
			};
		const snap = JSON.parse(JSON.stringify(pendingState)) as model.State;
		memory = snap;
		const done = (ok: boolean): boolean => {
			if (ok && channel)
				try {
					channel.postMessage({ tab: TAB_ID, updated: snap.updated });
				} catch {
					/* ignore */
				}
			if (typeof onSaveResult === "function") onSaveResult(ok);
			return ok;
		};
		if (saveDisabled) return done(false);
		let result: { state: model.State; merged: boolean } | null = null;
		try {
			const w = await save.transact((raw, rev, put) => {
				let stored: save.Doc | null = null;
				if (raw != null) {
					try {
						stored = save.checkDoc(raw);
					} catch (e) {
						if ((e as { code?: string }).code === "newer") throw e;
						put(
							`main-unreadable-${stamp()}`,
							typeof raw === "string" ? raw : JSON.stringify(raw),
						);
					}
				}
				result = saveMerge(
					snap,
					rev,
					stored ? docPortable(stored) : null,
					myRev,
					myBase,
				);
				return docFromState(result.state, stored || undefined);
			});
			storageKind = w.kind;
			remember(
				w.rev,
				codec.portable((result as unknown as { state: model.State }).state),
			);
		} catch {
			storageKind = save.kind;
			return done(false);
		}
		memory = (result as unknown as { state: model.State }).state;
		if (
			(result as unknown as { merged: boolean }).merged &&
			typeof onSaveMerged === "function"
		)
			onSaveMerged((result as unknown as { state: model.State }).state, snap);
		return done(true);
	};
	if (now) return run();
	timer = setTimeout(run, 400);
	return Promise.resolve(true);
}
export const hasPendingSave = (): boolean =>
	timer !== null && pendingState !== null;

export function setLoadProblem(v: typeof loadProblem): void {
	loadProblem = v;
}
export function setMoveProblem(v: typeof moveProblem): void {
	moveProblem = v;
}
export function setSaveDisabled(v: boolean): void {
	saveDisabled = v;
}
export function setJustMoved(v: boolean): void {
	justMoved = v;
}
export function setCaughtUp(v: boolean): void {
	caughtUp = v;
}
export function setMoveFrom(v: string | null): void {
	moveFrom = v;
}
export function setOnOtherTabSave(v: typeof onOtherTabSave): void {
	onOtherTabSave = v;
}
export function setOnSaveResult(v: typeof onSaveResult): void {
	onSaveResult = v;
}
export function setOnSaveMerged(v: typeof onSaveMerged): void {
	onSaveMerged = v;
}

export const clearState = async (): Promise<void> => {
	memory = null;
	remember(null, null);
	try {
		await save.transact((raw) => {
			let doc: save.Doc | null = null;
			try {
				doc = raw != null ? save.checkDoc(raw) : null;
			} catch {
				doc = null;
			}
			doc = doc || save.emptyDoc();
			doc.chars = [];
			delete doc.modules.tracker;
			delete doc.device.tracker;
			if (!doc.moved.tracker)
				doc.moved.tracker = {
					at: defaultEnv.now(),
					from: "none",
					check: null,
					confirmed: null,
					wentBack: null,
				};
			doc.updated = defaultEnv.now();
			return doc;
		});
	} catch {
		/* ignore */
	}
};

export const confirmMove = (st: model.State): void => {
	if (st.moved?.tracker) {
		(st.moved.tracker as Record<string, unknown>).confirmed = defaultEnv.now();
		st.updated = defaultEnv.now();
	}
};
export const oldSaveDiff = async (st: model.State) => {
	const old = await readOldSave();
	if (!old || !("st" in old) || !old.st) return null;
	let n = 0;
	for (const f of ["ticks", "excl", "vals"] as const) {
		const a = st[f] || {};
		const b = old.st[f] || {};
		for (const c of new Set([...Object.keys(a), ...Object.keys(b)])) {
			const x = a[c] || {};
			const y = b[c] || {};
			for (const k of new Set([...Object.keys(x), ...Object.keys(y)]))
				if (x[k] !== y[k]) n++;
		}
	}
	return { n, from: old.from };
};
export const goBack = async (): Promise<void> => {
	const old = await readOldSave();
	if (!old || !("st" in old) || !old.st)
		throw new Error(
			"The save from before the move is no longer on this device.",
		);
	const at = defaultEnv.now();
	await save.transact((raw, _rev, put) => {
		const doc = raw != null ? save.checkDoc(raw) : save.emptyDoc();
		if (raw != null) put(`main-before-goback-${stamp()}`, raw);
		const st = JSON.parse(JSON.stringify(old.st)) as model.State;
		st.modules = save.others(doc.modules);
		const sync =
			plain(doc.device.tracker) &&
			plain((doc.device.tracker as Record<string, unknown>).sync)
				? (doc.device.tracker as Record<string, { sync: unknown }>).sync
				: {};
		st.sync = {
			fc: {},
			drive: plain((sync as { drive?: unknown }).drive)
				? {
						fileId: (sync as { drive: { fileId: unknown } }).drive.fileId,
						at: (sync as { drive: { at: unknown } }).drive.at,
						base: null,
					}
				: null,
			backupAt:
				typeof (sync as { backupAt?: unknown }).backupAt === "number"
					? (sync as { backupAt: number }).backupAt
					: null,
		};
		st.moved = {
			tracker: {
				at,
				from: old.from,
				check: moveSummary(old.st),
				confirmed: null,
				wentBack: at,
			},
		};
		st.updated = at;
		return docFromState(model.validateState(st), doc);
	});
	memory = null;
	remember(null, null);
};
