// Port of tracker/src/core/cloud.js: cloud sync through OneDrive. Explicit imports replace CC/ET and location.
import { env as defaultEnv } from "../env.ts";
import * as codec from "./codec.ts";
import * as merge from "./merge.ts";
import * as model from "./model.ts";
import * as save from "./save.ts";
import { plain, stamp } from "./util.ts";

const FILE = "eveniunt-command-center.json";
const GRAPH = "https://graph.microsoft.com/v1.0";
const AUTHORITY = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
const SCOPES = "openid offline_access Files.ReadWrite.AppFolder";
const DEVICE_KEY = "eveniunt-cloud-device";
const SESSION_KEY = "eveniunt-cloud-key";
const PKCE_KEY = "eveniunt-cloud-pkce";
const RETURN_KEY = "eveniunt-cloud-return";

export type Fetch = (
	url: string,
	opts?: Record<string, unknown>,
) => Promise<ResponseLike>;
export interface ResponseLike {
	ok: boolean;
	status: number;
	json(): Promise<unknown>;
}
export interface Cfg {
	clientId: string;
	helper: string;
	authority?: string;
	graph?: string;
}

let cfgPromise: Promise<Cfg | null> | null = null;
export function cloudConfig(fetchImpl?: Fetch): Promise<Cfg | null> {
	if (cfgPromise) return cfgPromise;
	const f = fetchImpl || (globalThis as { fetch?: Fetch }).fetch;
	if (
		typeof location === "undefined" ||
		!/^https?:$/.test(location.protocol) ||
		!f
	)
		return (cfgPromise = Promise.resolve(null));
	cfgPromise = f(
		new URL("sync-config.json", model.shared.CLOUD_BASE || location.href).href,
		{ cache: "no-cache" },
	)
		.then(async (r) => {
			if (!r.ok) return null;
			const c = (await r.json()) as Record<string, unknown>;
			if (
				!c ||
				typeof c.clientId !== "string" ||
				typeof c.helper !== "string" ||
				!/^https?:\/\//.test(c.helper as string)
			)
				return null;
			return {
				clientId: c.clientId as string,
				helper: (c.helper as string).replace(/\/$/, ""),
				authority: ((c.authority as string) || AUTHORITY).replace(/\/$/, ""),
				graph: ((c.graph as string) || GRAPH).replace(/\/$/, ""),
			};
		})
		.catch(() => null);
	return cfgPromise;
}
export function cloudResetConfig(): void {
	cfgPromise = null;
}

const store = (kind: "local" | "session") => {
	try {
		return kind === "local"
			? (globalThis as { localStorage?: Storage }).localStorage
			: (globalThis as { sessionStorage?: Storage }).sessionStorage;
	} catch {
		return null;
	}
};
const readJson = (
	kind: "local" | "session",
	k: string,
): Record<string, unknown> | null => {
	try {
		const s = store(kind);
		return s
			? (JSON.parse(s.getItem(k) || "null") as Record<string, unknown> | null)
			: null;
	} catch {
		return null;
	}
};
const writeJson = (kind: "local" | "session", k: string, v: unknown): void => {
	try {
		const s = store(kind);
		if (!s) return;
		if (v == null) s.removeItem(k);
		else s.setItem(k, JSON.stringify(v));
	} catch {
		/* private window */
	}
};
const b64url = (buf: ArrayBuffer | Uint8Array): string =>
	btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
const random = (n: number): string => {
	const a = new Uint8Array(n);
	(globalThis as { crypto: Crypto }).crypto.getRandomValues(a);
	return b64url(a);
};

export function cloudState() {
	const d = readJson("local", DEVICE_KEY);
	const k = readJson("session", SESSION_KEY);
	return {
		device: !!d?.device,
		since: d?.at ? (d.at as number) : null,
		key: !!(k?.token && (k.exp as number) > defaultEnv.now() + 60 * 1000),
		pending: !!readJson("session", RETURN_KEY),
	};
}
export function cloudReturnAddress(): string {
	return new URL("oauth.html", model.shared.CLOUD_BASE || location.href).href;
}

export const cloudBegin = async (cfg: Cfg): Promise<void> => {
	const verifier = random(48);
	const state = random(16);
	const challenge = b64url(
		(await (globalThis as { crypto: Crypto }).crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(verifier),
		)) as ArrayBuffer,
	);
	writeJson("session", PKCE_KEY, { verifier, state, at: defaultEnv.now() });
	writeJson(
		"session",
		"eveniunt-cloud-back",
		location.href.split("#")[0] + (model.shared.CLOUD_BASE ? "#settings" : ""),
	);
	const q = new URLSearchParams({
		client_id: cfg.clientId,
		response_type: "code",
		redirect_uri: cloudReturnAddress(),
		response_mode: "query",
		scope: SCOPES,
		state,
		code_challenge: challenge,
		code_challenge_method: "S256",
		prompt: "select_account",
	});
	location.assign(`${cfg.authority}/authorize?${q.toString()}`);
};

async function helper(
	cfg: Cfg,
	f: Fetch,
	path: string,
	body: unknown,
): Promise<Record<string, unknown>> {
	let r: ResponseLike;
	try {
		r = await f(cfg.helper + path, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	} catch {
		throw Object.assign(
			new Error(
				"Could not reach the sync helper. Check the internet connection.",
			),
			{ code: "offline" },
		);
	}
	let j: Record<string, unknown> | null = null;
	try {
		j = (await r.json()) as Record<string, unknown>;
	} catch {
		j = null;
	}
	if (r.status === 401 || r.status === 410)
		throw Object.assign(
			new Error(
				(j && (j.message as string)) ||
					"This device’s sign-in has ended. Sign in again.",
			),
			{
				code: "signed-out",
			},
		);
	if (!r.ok)
		throw Object.assign(
			new Error(
				(j && (j.message as string)) || `The sync helper answered ${r.status}`,
			),
			{
				code: "helper",
				status: r.status,
			},
		);
	return j as Record<string, unknown>;
}
const keep = (j: Record<string, unknown>): string => {
	writeJson("session", SESSION_KEY, {
		token: j.token,
		exp:
			defaultEnv.now() +
			Math.max(60, Number(j.expires_in) || 3600) * 1000 -
			30 * 1000,
	});
	return j.token as string;
};

export const cloudComplete = async (
	cfg: Cfg,
	fetchImpl?: Fetch,
): Promise<string | null> => {
	const ret = readJson("session", RETURN_KEY);
	const pk = readJson("session", PKCE_KEY);
	if (!ret) return null;
	writeJson("session", RETURN_KEY, null);
	writeJson("session", PKCE_KEY, null);
	if (ret.error)
		throw Object.assign(
			new Error(
				ret.error === "access_denied"
					? "Sign-in was cancelled."
					: `Microsoft sign-in failed: ${ret.error_description || ret.error}`,
			),
			{ code: "denied" },
		);
	if (!pk || !ret.code || ret.state !== pk.state)
		throw Object.assign(
			new Error(
				"The sign-in answer did not match this tab’s request. Try again.",
			),
			{ code: "state" },
		);
	const j = await helper(
		cfg,
		fetchImpl || (globalThis as { fetch?: Fetch }).fetch!,
		"/connect",
		{
			code: ret.code,
			verifier: pk.verifier,
			redirect_uri: cloudReturnAddress(),
		},
	);
	if (!j || typeof j.device !== "string" || typeof j.token !== "string")
		throw Object.assign(
			new Error("The sync helper gave an unexpected answer."),
			{ code: "helper" },
		);
	writeJson("local", DEVICE_KEY, { device: j.device, at: defaultEnv.now() });
	return keep(j);
};

export const cloudToken = async (
	cfg: Cfg,
	fetchImpl?: Fetch,
	force?: boolean,
): Promise<string> => {
	const k = readJson("session", SESSION_KEY);
	if (!force && k && k.token && (k.exp as number) > defaultEnv.now())
		return k.token as string;
	const d = readJson("local", DEVICE_KEY);
	if (!d?.device)
		throw Object.assign(new Error("not signed in"), { code: "not-signed-in" });
	try {
		const j = await helper(
			cfg,
			fetchImpl || (globalThis as { fetch?: Fetch }).fetch!,
			"/token",
			{ device: d.device },
		);
		if (!j || typeof j.token !== "string")
			throw Object.assign(
				new Error("The sync helper gave an unexpected answer."),
				{ code: "helper" },
			);
		return keep(j);
	} catch (e) {
		if ((e as { code?: string }).code === "signed-out") {
			writeJson("local", DEVICE_KEY, null);
			writeJson("session", SESSION_KEY, null);
		}
		throw e;
	}
};

export const cloudForget = async (
	cfg: Cfg,
	fetchImpl?: Fetch,
): Promise<void> => {
	const d = readJson("local", DEVICE_KEY);
	writeJson("local", DEVICE_KEY, null);
	writeJson("session", SESSION_KEY, null);
	if (d?.device && cfg) {
		try {
			await helper(
				cfg,
				fetchImpl || (globalThis as { fetch?: Fetch }).fetch!,
				"/forget",
				{ device: d.device },
			);
		} catch {
			/* already forgotten, or offline */
		}
	}
};

const item = (cfg?: Cfg) =>
	`${cfg?.graph ? cfg.graph : GRAPH}/me/drive/special/approot:/${FILE}`;
async function call(
	f: Fetch,
	token: string,
	url: string,
	opts?: Record<string, unknown>,
): Promise<ResponseLike | null> {
	let r: ResponseLike;
	try {
		r = await f(
			url,
			Object.assign({}, opts, {
				headers: Object.assign(
					{ Authorization: `Bearer ${token}` },
					opts?.headers as object,
				),
			}),
		);
	} catch {
		throw Object.assign(
			new Error("Could not reach OneDrive. Check the internet connection."),
			{ code: "offline" },
		);
	}
	if (r.status === 401)
		throw Object.assign(new Error("The OneDrive key expired. Syncing again."), {
			code: 401,
		});
	if (r.status === 412)
		throw Object.assign(
			new Error(
				"Another device synced at the same time. Syncing again to include its changes.",
			),
			{
				code: "changed",
			},
		);
	if (r.status === 404) return null;
	if (!r.ok) throw new Error(`OneDrive answered ${r.status}`);
	return r;
}
async function findFile(f: Fetch, token: string, cfg?: Cfg) {
	const r = await call(
		f,
		token,
		`${item(cfg)}?select=id,eTag,size,@microsoft.graph.downloadUrl`,
	);
	if (!r) return null;
	const j = (await r.json()) as Record<string, unknown>;
	return {
		id: j.id as string,
		eTag: (j.eTag as string) || null,
		download: (j["@microsoft.graph.downloadUrl"] as string) || null,
		size: j.size,
	};
}
async function readFile(
	f: Fetch,
	token: string,
	cfg: Cfg | undefined,
	file: { download: string | null },
) {
	let r: ResponseLike | null;
	if (file.download) {
		try {
			r = await f(file.download);
		} catch {
			throw Object.assign(
				new Error("Could not reach OneDrive. Check the internet connection."),
				{ code: "offline" },
			);
		}
		if (!r.ok) throw new Error(`OneDrive answered ${r.status}`);
	} else {
		r = await call(f, token, `${item(cfg)}:/content`);
		if (!r) return null;
	}
	try {
		return await r.json();
	} catch {
		return null;
	}
}
export const limits = { CLOUD_MAX_BYTES: 4 * 1024 * 1024 - 64 * 1024 };
export const CLOUD_MAX_BYTES = limits.CLOUD_MAX_BYTES;
async function upload(
	f: Fetch,
	token: string,
	cfg: Cfg | undefined,
	eTag: string | null,
	doc: unknown,
) {
	const body = JSON.stringify(doc);
	if (save.byteLength(body) > limits.CLOUD_MAX_BYTES)
		throw Object.assign(
			new Error(
				"The cloud copy has grown past the 4 MB that cloud sync can send in one go, even compressed, so nothing was sent. Use backup files or a transfer code until the app is updated.",
			),
			{ code: "too-large" },
		);
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (eTag) headers["If-Match"] = eTag;
	const r = await call(
		f,
		token,
		`${item(cfg)}:/content?@microsoft.graph.conflictBehavior=replace`,
		{
			method: "PUT",
			headers,
			body,
		},
	);
	let j: Record<string, unknown> | null = null;
	try {
		j = (await r?.json()) as Record<string, unknown>;
	} catch {
		j = null;
	}
	return { id: j?.id || null, eTag: j?.eTag || null };
}

const TAG = "eveniunt-completionist-tracker";
const FORMAT = "deflate-raw+base64";
export const CLOUD_VERSION = 2;
const cloudDoc = async (st: model.State) => {
	const sv = codec.saveDoc(st);
	return {
		app: TAG,
		v: CLOUD_VERSION,
		format: FORMAT,
		data: await save.pack(
			JSON.stringify({
				app: save.APP,
				v: save.VERSION,
				chars: sv.chars,
				modules: sv.modules,
			}),
		),
	};
};

export { cloudDoc };
export const readCloud = async (doc: unknown): Promise<unknown> => {
	if (
		plain(doc) &&
		typeof doc.v === "number" &&
		(doc.v as number) > CLOUD_VERSION
	)
		throw new Error(
			"The cloud copy was saved by a newer version of the app. Reload this page to update, then sync again.",
		);
	if (!plain(doc) || doc.app !== TAG || doc.v !== 2) return doc;
	if (doc.format !== FORMAT || typeof doc.data !== "string") return null;
	let inner: unknown;
	try {
		inner = JSON.parse(await save.unpack(doc.data, 64 * 1024 * 1024));
	} catch {
		return null;
	}
	if (!plain(inner) || inner.app !== save.APP || !Number.isInteger(inner.v))
		return null;
	if ((inner.v as number) > save.VERSION)
		throw new Error(
			"The cloud copy was saved by a newer version of the app. Reload this page to update, then sync again.",
		);
	return Object.assign({ app: TAG, v: 1 }, codec.fromSaveDoc(inner));
};
const looksValid = (doc: unknown): boolean => {
	if (
		!plain(doc) ||
		doc.app !== "eveniunt-completionist-tracker" ||
		!Number.isInteger(doc.v) ||
		(doc.v as number) < 1 ||
		(doc.v as number) > model.STATE_VERSION ||
		!Array.isArray(doc.chars) ||
		!doc.chars.length ||
		doc.chars.length > model.MAX_CHARS ||
		!doc.ticks ||
		typeof doc.ticks !== "object" ||
		Array.isArray(doc.ticks)
	)
		return false;
	const ids = new Set<string>();
	const ticks = doc.ticks as Record<string, unknown>;
	return (doc.chars as unknown[]).every(
		(c) =>
			plain(c) &&
			typeof c.id === "string" &&
			model.CHAR_ID.test(c.id) &&
			!ids.has(c.id) &&
			ids.add(c.id) &&
			Object.hasOwn(ticks, c.id) &&
			ticks[c.id] &&
			typeof ticks[c.id] === "object" &&
			!Array.isArray(ticks[c.id]),
	);
};
export const mergeLoss = (
	local: { ticks?: Record<string, Record<string, number>> },
	result: merge.MergeResult,
): number => {
	let n = 0;
	for (const [c, t] of Object.entries(local.ticks || {}))
		for (const k of Object.keys(t))
			if (
				!result.merged.has(`t|${c}|${k}`) &&
				!result.conflicts.some((x) => x.id === `t|${c}|${k}`)
			)
				n++;
	return n;
};

export const cloudSync = async (
	st: model.State,
	token: string,
	fetchImpl?: Fetch,
	cfg?: Cfg,
) => {
	const f = fetchImpl || (globalThis as { fetch?: Fetch }).fetch!;
	const file = await findFile(f, token, cfg);
	const local = codec.portable(st);
	if (!file) {
		const w = await upload(f, token, cfg, null, await cloudDoc(st));
		st.sync.drive = {
			fileId: w.id,
			at: new Date(defaultEnv.now()).toISOString(),
			base: JSON.parse(JSON.stringify(local)),
		};
		return { done: true, created: true };
	}
	let remote: unknown = await readFile(f, token, cfg, file);
	remote = await readCloud(remote);
	if (!looksValid(remote))
		throw Object.assign(
			new Error(
				"The cloud copy is damaged or not a tracker copy, so nothing was merged and this device kept its data.",
			),
			{ code: "damaged", fileId: file.id },
		);
	const base =
		st.sync.drive && (st.sync.drive as { fileId: unknown }).fileId === file.id
			? (st.sync.drive as { base: unknown }).base
			: null;
	const result = merge.threeWay(base, local, remote);
	const loss = mergeLoss(local, result);
	const pending = { result, fileId: file.id, eTag: file.eTag, remote };
	if (result.conflicts.length || loss > 0)
		return Object.assign(
			{ done: false, conflicts: result.conflicts, loss },
			pending,
		);
	await cloudFinish(st, token, pending, {}, f, cfg);
	return { done: true };
};

export const cloudFinish = async (
	st: model.State,
	token: string,
	pending: {
		result: merge.MergeResult;
		fileId: string;
		eTag: string | null;
		remote: unknown;
	},
	choices: Record<string, string>,
	fetchImpl?: Fetch,
	cfg?: Cfg,
): Promise<void> => {
	const f = fetchImpl || (globalThis as { fetch?: Fetch }).fetch!;
	const before = JSON.parse(JSON.stringify(codec.portable(st)));
	const candidate = merge.applyMerge(
		JSON.parse(JSON.stringify(st)) as model.State,
		pending.result,
		choices,
	);
	const doc = JSON.parse(JSON.stringify(codec.portable(candidate)));
	const w = await upload(
		f,
		token,
		cfg,
		pending.eTag,
		await cloudDoc(candidate),
	);
	merge.applyMerge(st, merge.threeWay(before, codec.portable(st), doc), {});
	st.sync.drive = {
		fileId: w.id || pending.fileId,
		at: new Date(defaultEnv.now()).toISOString(),
		base: doc,
	};
};

export const cloudOverwrite = async (
	st: model.State,
	token: string,
	fetchImpl?: Fetch,
	cfg?: Cfg,
): Promise<void> => {
	const f = fetchImpl || (globalThis as { fetch?: Fetch }).fetch!;
	const w = await upload(f, token, cfg, null, await cloudDoc(st));
	st.sync.drive = {
		fileId: w.id,
		at: new Date(defaultEnv.now()).toISOString(),
		base: JSON.parse(JSON.stringify(codec.portable(st))),
	};
};

export const CLOUD_DEVICE_KEY = DEVICE_KEY;
export const cloudStamp = stamp;
