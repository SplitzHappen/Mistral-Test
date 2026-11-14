// The save store behind connect(): read, transact, change notifications, and writeSection with the same
// merge semantics as tracker/src/core/save.js (units two levels down; another page's newer save is merged in).
// Phase 3 binds this to the ported core; until then tests inject MemoryStore.

import type { Env } from "../env.ts";
import {
	checkDoc,
	checkModules,
	type Doc,
	emptyDoc,
	mergeModules,
} from "./checkers.ts";

export interface ReadResult {
	raw: unknown;
	rev: string | null;
	kind: string;
}

export interface WriteResult {
	rev: string | null;
	wrote: boolean;
	kind: string;
}

export interface SectionWrite {
	rev: string | null;
	section: unknown;
	merged: boolean;
	doc: Doc;
}

export interface SaveStore {
	read(): Promise<ReadResult>;
	transact(
		fn: (
			raw: unknown,
			rev: string | null,
			put: (key: string, value: unknown) => void,
		) => unknown,
	): Promise<WriteResult>;
	onChange(fn: (e: unknown) => void): void;
	writeSection(
		name: string,
		section: unknown,
		known: { rev: string | null; base: unknown } | null,
		now: number,
	): Promise<SectionWrite>;
}

export class MemoryStore implements SaveStore {
	raw: unknown = null;
	rev: string | null = null;
	kind = "memory";
	private listeners: ((e: unknown) => void)[] = [];
	private env: Env;
	constructor(env: Env) {
		this.env = env;
	}
	read(): Promise<ReadResult> {
		return Promise.resolve({ raw: this.raw, rev: this.rev, kind: this.kind });
	}
	transact(
		fn: (
			raw: unknown,
			rev: string | null,
			put: (key: string, value: unknown) => void,
		) => unknown,
	): Promise<WriteResult> {
		const rev =
			this.env.now().toString(36) + this.env.random().toString(36).slice(2, 8);
		const doc = fn(this.raw, this.rev, () => {});
		this.kind = "memory";
		if (!doc)
			return Promise.resolve({ rev: this.rev, wrote: false, kind: this.kind });
		this.raw = JSON.parse(JSON.stringify(doc)) as unknown;
		this.rev = rev;
		this.announce(rev);
		return Promise.resolve({ rev, wrote: true, kind: this.kind });
	}
	onChange(fn: (e: unknown) => void): void {
		this.listeners.push(fn);
	}
	private announce(rev: string): void {
		for (const fn of this.listeners) {
			try {
				fn({ rev });
			} catch {
				/* a listener's problem stays its own */
			}
		}
	}
	writeSection(
		name: string,
		section: unknown,
		known: { rev: string | null; base: unknown } | null,
		now: number,
	): Promise<SectionWrite> {
		let out: { section: unknown; merged: boolean; doc: Doc } | null = null;
		return this.transact((raw, rev) => {
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
			doc.updated = now;
			out = { section: sec, merged, doc };
			return doc;
		}).then((r) => {
			const o = out as unknown as {
				section: unknown;
				merged: boolean;
				doc: Doc;
			};
			return { rev: r.rev, section: o.section, merged: o.merged, doc: o.doc };
		});
	}
}
