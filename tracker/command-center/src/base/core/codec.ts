// Port of tracker/src/core/codec.js: backup files and transfer codes. Explicit imports replace CC/ET.
import { env as defaultEnv } from "../env.ts";
import * as model from "./model.ts";
import * as save from "./save.ts";
import { plain } from "./util.ts";

const FILE_TAG = "eveniunt-completionist-tracker";
const SAVE_TAG = "eveniunt-command-center";
const BACKUP_V = 1;
const CODE_PREFIX = "EVT2-";
const OLD_CODE_PREFIX = "EVT1-";

type Portable = {
	chars: model.Char[];
	ticks: Record<string, Record<string, number>>;
	vals: unknown;
	excl: unknown;
	avail: unknown;
	settings: unknown;
	modules?: Record<string, unknown>;
};

export const portable = (st: model.State): Portable => {
	const p: Portable = {
		chars: st.chars.map((c) => ({
			id: c.id,
			name: c.name,
			lodestone: c.lodestone || null,
			cls: c.cls || null,
			city: c.cls ? null : c.city || null,
			gc: c.gc || null,
		})),
		ticks: st.ticks,
		vals: st.vals || {},
		excl: st.excl || {},
		avail: st.avail,
		settings: st.settings,
	};
	if (st.modules !== undefined) p.modules = st.modules;
	return p;
};
export const saveDoc = (st: model.State) => {
	const p = portable(st);
	return {
		chars: p.chars,
		modules: Object.assign({}, p.modules || {}, {
			tracker: {
				ticks: p.ticks,
				excl: p.excl,
				vals: p.vals,
				avail: p.avail,
				settings: p.settings,
			},
		}),
	};
};
export const fromSaveDoc = (s: unknown) => {
	const doc = plain(s) ? s : {};
	const t =
		plain(doc.modules) &&
		plain((doc.modules as Record<string, unknown>).tracker)
			? (doc.modules as Record<string, unknown>).tracker
			: {};
	return {
		chars: doc.chars,
		ticks: (t as Record<string, unknown>).ticks || {},
		excl: (t as Record<string, unknown>).excl || {},
		vals: (t as Record<string, unknown>).vals || {},
		avail: (t as Record<string, unknown>).avail || {},
		settings: (t as Record<string, unknown>).settings || {},
		modules: save.checkModules(doc.modules),
	};
};

export function exportFile(st: model.State): string {
	return JSON.stringify(
		{
			app: SAVE_TAG,
			kind: "backup",
			v: BACKUP_V,
			saved: new Date(defaultEnv.now()).toISOString(),
			save: saveDoc(st),
		},
		null,
		0,
	);
}

export function importFile(text: string): model.State {
	let doc: unknown;
	try {
		doc = JSON.parse(text);
	} catch {
		throw new Error("This file is not a tracker backup (not JSON).");
	}
	const local = {
		sync: { fc: {}, drive: null, backupAt: null },
		moved: {},
		updated: defaultEnv.now(),
	};
	if (plain(doc) && doc.app === SAVE_TAG && doc.kind === "backup") {
		if (!Number.isInteger(doc.v) || (doc.v as number) < 1)
			throw new Error("This file is not a tracker backup.");
		if ((doc.v as number) > BACKUP_V)
			throw new Error(
				"This backup was saved by a newer version of the app. Reload the page to update, then load it again.",
			);
		return model.validateState(
			Object.assign(
				{ v: model.STATE_VERSION },
				fromSaveDoc(doc.save) as object,
				local,
			) as model.State,
		);
	}
	if (!plain(doc) || doc.app !== FILE_TAG || !doc.state)
		throw new Error("This file is not a tracker backup.");
	const st = Object.assign({}, doc.state, local) as model.State;
	delete st.modules;
	return model.validateState(st);
}

function packTicks(ticks: Record<string, unknown>): Record<string, string> {
	const bySec: Record<string, number[]> = {};
	for (const k of Object.keys(ticks)) {
		const cut = k.lastIndexOf(":");
		(bySec[k.slice(0, cut)] = bySec[k.slice(0, cut)] || []).push(
			Number(k.slice(cut + 1)),
		);
	}
	const out: Record<string, string> = {};
	for (const [s, ids] of Object.entries(bySec)) {
		ids.sort((a, b) => a - b);
		let prev = 0;
		out[s] = ids
			.map((x) => {
				const d = x - prev;
				prev = x;
				return d;
			})
			.join(".");
	}
	return out;
}
function unpackTicks(packed: unknown): Record<string, number> {
	const t: Record<string, number> = {};
	for (const [s, str] of Object.entries(
		plain(packed) ? (packed as Record<string, unknown>) : {},
	)) {
		let prev = 0;
		for (const d of String(str).split(".")) {
			if (d === "") continue;
			prev += Number(d);
			if (!Number.isFinite(prev)) throw new Error("Damaged transfer code.");
			t[`${s}:${prev}`] = 1;
		}
	}
	return t;
}

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
const CODE_MAX = 4 * 1024 * 1024;
const DOC_MAX = 64 * 1024 * 1024;
const b64u = (bytes: Uint8Array): string => {
	let s = "";
	for (let i = 0; i < bytes.length; i += 0x8000)
		s += String.fromCharCode.apply(
			null,
			Array.from(bytes.subarray(i, i + 0x8000)),
		);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = (s: string): Uint8Array => {
	const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
	const b = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
	return b;
};

export const makeTransferCode = async (st: model.State): Promise<string> => {
	const p = portable(st);
	const doc: Record<string, unknown> = {
		c: p.chars.map((c) => [
			c.id,
			c.name,
			c.lodestone || "",
			c.cls || (c.city ? `city:${c.city}` : ""),
			c.gc || 0,
		]),
		t: {},
		a: p.avail,
		s: p.settings,
		e: {},
		v: st.vals || {},
	};
	if (p.modules !== undefined) doc.m = p.modules;
	for (const c of p.chars) {
		(doc.t as Record<string, unknown>)[c.id] = packTicks(
			(st.ticks[c.id] || {}) as Record<string, unknown>,
		);
		(doc.e as Record<string, unknown>)[c.id] = packTicks(
			(st.excl?.[c.id] || {}) as Record<string, unknown>,
		);
	}
	const raw = new TextEncoder().encode(JSON.stringify(doc));
	return (
		CODE_PREFIX + b64u(await pipe(raw, new CompressionStream("deflate-raw")))
	);
};

export const readTransferCode = async (code: unknown): Promise<model.State> => {
	const s = String(code || "").replace(/\s+/g, "");
	const prefix = s.startsWith(CODE_PREFIX)
		? CODE_PREFIX
		: s.startsWith(OLD_CODE_PREFIX)
			? OLD_CODE_PREFIX
			: null;
	if (!prefix)
		throw new Error(
			/^EVT\d+-/.test(s)
				? "This transfer code was made by a newer version of the app. Reload the page to update, then load it again."
				: "This is not a tracker transfer code.",
		);
	if (s.length > CODE_MAX)
		throw new Error("This transfer code is far too long to be a tracker code.");
	const damaged = () =>
		new Error(
			"This transfer code is incomplete or damaged. Copy it again in full.",
		);
	let doc: Record<string, unknown>;
	try {
		const raw = await pipe(
			unb64u(s.slice(prefix.length)),
			new DecompressionStream("deflate-raw"),
			DOC_MAX,
		);
		doc = JSON.parse(new TextDecoder().decode(raw)) as Record<string, unknown>;
	} catch {
		throw damaged();
	}
	if (!doc || !Array.isArray(doc.c) || !doc.t || typeof doc.t !== "object")
		throw damaged();
	if (
		!(doc.c as unknown[]).every(
			(x) => Array.isArray(x) && typeof x[0] === "string",
		)
	)
		throw damaged();
	const st = {
		v: model.STATE_VERSION,
		chars: (doc.c as unknown[][]).map(([id, name, lodestone, start, gc]) => ({
			id,
			name,
			lodestone: lodestone || null,
			cls: start && !String(start).startsWith("city:") ? start : null,
			city: String(start || "").startsWith("city:")
				? String(start).slice(5)
				: null,
			gc: gc || null,
		})),
		ticks: {} as Record<string, Record<string, number>>,
		avail: (doc.a as Record<string, string>) || {},
		settings: (doc.s as Record<string, boolean>) || {},
		sync: { fc: {}, drive: null },
		moved: {},
		updated: defaultEnv.now(),
	} as model.State & { modules?: unknown };
	if (prefix === CODE_PREFIX)
		st.modules = plain(doc.m) ? (doc.m as Record<string, unknown>) : {};
	st.excl = {} as State0;
	st.vals = (doc.v as Record<string, Record<string, number>>) || {};
	const own = (o: unknown, k: string) =>
		o && Object.hasOwn(o, k) ? (o as Record<string, unknown>)[k] : null;
	for (const c of st.chars) {
		st.ticks[c.id] = unpackTicks(own(doc.t, c.id));
		st.excl[c.id] = unpackTicks(own(doc.e, c.id));
	}
	return model.validateState(st);
};
type State0 = Record<string, Record<string, number>>;
