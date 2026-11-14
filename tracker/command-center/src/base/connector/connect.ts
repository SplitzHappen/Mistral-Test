// connect(manifest, ctx): what a module gets from the base. The module itself is a folder of data and pure
// functions; it never touches storage, the DOM, other modules, or base internals directly.
import { env as defaultEnv, type Env } from "../env.ts";
import {
	CHECK,
	type Char,
	checkChars,
	checkDoc,
	checkModules,
	clean,
	type Doc,
	emptyDoc,
	MODULE,
} from "./checkers.ts";
import { type Manifest, validateManifest } from "./manifest.ts";
import { MemoryStore, type SaveStore } from "./store.ts";

export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export interface ConnectContext {
	url: string; // the page's own address (its known place), e.g. location.href — never a script address
	env?: Env;
	store?: SaveStore;
	storage?: StorageLike; // device storage; defaults to globalThis.localStorage when present
}

export const DEVICE_KEY = "eveniunt-command-center-device";

export interface SectionApi {
	id: string;
	get(): Promise<unknown>;
	set(section: unknown): Promise<{ rev: string | null; merged: boolean }>;
	subscribe(fn: () => void): void;
}

export interface Nav {
	siteRoot: string;
	self: string;
	address: string;
	for(manifest: Manifest): string;
}

export function connect(manifest: unknown, ctx: ConnectContext) {
	const m = validateManifest(manifest);
	const env = ctx.env ?? defaultEnv;
	const store = ctx.store ?? new MemoryStore(env);
	const storage: StorageLike | undefined =
		ctx.storage ?? (globalThis as { localStorage?: StorageLike }).localStorage;

	const listeners: (() => void)[] = [];
	const emit = () => {
		for (const fn of listeners) {
			try {
				fn();
			} catch {
				/* a listener's problem stays its own */
			}
		}
	};
	// change events notify subscribers only: the merge base stays what this page last read or wrote,
	// exactly like a legacy page holding REV between reads.
	store.onChange(() => emit());

	async function doc(): Promise<Doc> {
		const r = await store.read();
		return r.raw != null ? checkDoc(r.raw) : emptyDoc();
	}

	// the shared checker table first (atelier, submersibles, settings); a module outside it uses its own
	// manifest save.check; a raw section (the Tracker) passes through untouched.
	function checkSection(id: string, raw: unknown): unknown {
		if (m.id === id && "raw" in m.save) return raw;
		const table = CHECK.find(([n]) => n === id)?.[1];
		const cleaned = clean(raw, 0);
		if (table) return table(cleaned as Record<string, unknown>);
		if (m.id === id && !("raw" in m.save)) return m.save.check(cleaned);
		return checkModules({ [id]: raw })[id] ?? {};
	}

	function sectionApi(id: string): SectionApi {
		let knownRev: string | null = null;
		let knownBase: unknown = null;
		return {
			id,
			async get() {
				const r = await store.read();
				knownRev = r.rev;
				const d = r.raw != null ? checkDoc(r.raw) : emptyDoc();
				const raw = d.modules[id];
				knownBase = raw ?? null;
				if (raw == null)
					return m.id === id
						? ((m.save as { empty?: () => unknown }).empty?.() ?? {})
						: {};
				return checkSection(id, raw);
			},
			async set(section: unknown) {
				const r = await store.writeSection(
					id,
					section,
					{ rev: knownRev, base: knownBase },
					env.now(),
				);
				knownRev = r.rev;
				knownBase = r.section;
				emit();
				return { rev: r.rev, merged: r.merged };
			},
			subscribe(fn: () => void) {
				listeners.push(fn);
			},
		};
	}

	// nav: the site root and addresses worked out from the page's known place, never from a script address.
	const pageUrl = new URL(ctx.url);
	const segs = m.path.split("/").filter(Boolean).length;
	const siteRoot =
		pageUrl.pathname.endsWith(m.path) && segs > 0
			? new URL("../".repeat(segs), pageUrl)
			: new URL("./", pageUrl);
	const nav: Nav = {
		siteRoot: siteRoot.href,
		self: m.path,
		address: new URL(m.path, siteRoot).href,
		for: (other: Manifest) => new URL(other.path, siteRoot).href,
	};

	// characters: read-only, as every module sees them.
	const characters = {
		async list(): Promise<Char[]> {
			return (await doc()).chars;
		},
		async badge(charId: string): Promise<string> {
			return m.characterBadge
				? String(m.characterBadge(await doc(), charId) ?? "")
				: "";
		},
		subscribe(fn: () => void) {
			listeners.push(fn);
		},
	};

	// the base owns the shared settings section; its checker sits in the same table as the modules'.
	const settings = sectionApi("settings");

	// device storage: the existing device key, one sub-object per module, never in the save.
	const device = {
		key: DEVICE_KEY,
		async get(): Promise<Record<string, unknown>> {
			if (!storage) return {};
			try {
				const all = JSON.parse(storage.getItem(DEVICE_KEY) || "{}") || {};
				return (all[m.id] as Record<string, unknown>) || {};
			} catch {
				return {};
			}
		},
		async set(patch: Record<string, unknown>): Promise<void> {
			if (!storage) return;
			try {
				const all = JSON.parse(storage.getItem(DEVICE_KEY) || "{}") || {};
				all[m.id] = Object.assign({}, all[m.id] || {}, patch);
				storage.setItem(DEVICE_KEY, JSON.stringify(all));
			} catch {
				/* private window */
			}
		},
	};

	// notifications: the shared night rule from the settings section, plus the module's wording.
	const notify = {
		async get(): Promise<Record<string, unknown>> {
			const s = (await settings.get()) as Record<string, unknown>;
			return (s.notify as Record<string, unknown>) || {};
		},
		quietAt(now: number): Promise<boolean> {
			return notify.get().then((n) => {
				if (n.night !== "quiet") return false;
				const q = n.quietHours as { from: number; to: number } | undefined;
				if (!q) return false;
				const d = new Date(now);
				const mins = d.getHours() * 60 + d.getMinutes();
				return q.from <= q.to
					? mins >= q.from && mins < q.to
					: mins >= q.from || mins < q.to;
			});
		},
		describe(what: unknown): string {
			return m.notifications ? m.notifications.describe(what) : String(what);
		},
	};

	return {
		manifest: m,
		section: sectionApi(m.id),
		characters,
		settings,
		device,
		notify,
		nav,
		env,
	};
}

export { checkChars, checkModules, MODULE };
