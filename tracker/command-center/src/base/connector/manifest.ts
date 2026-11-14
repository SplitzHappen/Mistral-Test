// A module manifest: data and pure functions only. `connect()` refuses any manifest with an unknown field,
// a wrong type, or contract !== 1. The id is also the module's save section name.
import type { Doc } from "./checkers.ts";

export type SaveSection =
	| { raw: true } // the Tracker only: its section is checked by the Tracker itself
	| {
			empty: () => unknown;
			check: (raw: unknown) => unknown;
			describeUnit?: (
				unitId: string,
				local: string | null,
				remote: string | null,
				nameOf?: (charId: string) => string,
			) => unknown;
			label?: string;
	  };

export interface Manifest {
	contract: 1;
	id: string;
	title: string;
	path: string;
	order: { menu: number; home: number };
	page: { isolated: boolean; ownWorker: boolean };
	home?: { kicker: string; text: string; go: string; glyph: string };
	save: SaveSection;
	summary?: (doc: Doc, now: number) => unknown;
	characterBadge?: (doc: Doc, charId: string) => string;
	characterFields?: { key: string; label: string }[];
	alerts?: { due: (section: unknown, now: number) => unknown[]; link: string };
	notifications?: { describe: (what: unknown) => string };
	credits?: string;
}

const KNOWN = new Set([
	"contract",
	"id",
	"title",
	"path",
	"order",
	"page",
	"home",
	"save",
	"summary",
	"characterBadge",
	"characterFields",
	"alerts",
	"notifications",
	"credits",
]);
const MODULE = /^[a-z][a-z0-9-]{0,31}$/;
const PATH = /^[a-z][a-z0-9-]*\/$/;
const plain = (o: unknown): o is Record<string, unknown> =>
	!!o && typeof o === "object" && !Array.isArray(o);
const isFn = (v: unknown): v is (...args: never[]) => unknown =>
	typeof v === "function";

function fail(msg: string): never {
	throw new Error(`bad module manifest: ${msg}`);
}

export function validateManifest(m: unknown): Manifest {
	if (!plain(m)) fail("not an object");
	for (const k of Object.keys(m))
		if (!KNOWN.has(k)) fail(`unknown field "${k}"`);
	if (m.contract !== 1) fail("contract must be 1");
	if (typeof m.id !== "string" || !MODULE.test(m.id))
		fail("id must be a save section name");
	if (typeof m.title !== "string" || !m.title.trim()) fail("title");
	if (typeof m.path !== "string" || !PATH.test(m.path))
		fail('path must be "<name>/" under the site root');
	if (
		!plain(m.order) ||
		!Number.isInteger(m.order.menu) ||
		!Number.isInteger(m.order.home)
	)
		fail("order {menu, home}");
	if (
		!plain(m.page) ||
		typeof m.page.isolated !== "boolean" ||
		typeof m.page.ownWorker !== "boolean"
	)
		fail("page {isolated, ownWorker}");
	if (m.home !== undefined) {
		if (!plain(m.home)) fail("home");
		for (const k of ["kicker", "text", "go", "glyph"] as const)
			if (typeof m.home[k] !== "string") fail(`home.${k}`);
	}
	if (!plain(m.save)) fail("save");
	if (Object.hasOwn(m.save, "raw")) {
		if (m.save.raw !== true) fail("save.raw");
		if (m.id !== "tracker") fail("only the Tracker may keep its section raw");
	} else {
		for (const k of Object.keys(m.save))
			if (!["empty", "check", "describeUnit", "label"].includes(k))
				fail(`unknown save field "${k}"`);
		if (!isFn(m.save.empty as never)) fail("save.empty");
		if (!isFn(m.save.check as never)) fail("save.check");
		if (
			m.save.describeUnit !== undefined &&
			!isFn(m.save.describeUnit as never)
		)
			fail("save.describeUnit");
		if (m.save.label !== undefined && typeof m.save.label !== "string")
			fail("save.label");
	}
	if (m.summary !== undefined && !isFn(m.summary as never)) fail("summary");
	if (m.characterBadge !== undefined && !isFn(m.characterBadge as never))
		fail("characterBadge");
	if (m.characterFields !== undefined) {
		if (!Array.isArray(m.characterFields)) fail("characterFields");
		for (const f of m.characterFields)
			if (!plain(f) || typeof f.key !== "string" || typeof f.label !== "string")
				fail("characterFields[]");
	}
	if (m.alerts !== undefined) {
		if (
			!plain(m.alerts) ||
			!isFn(m.alerts.due as never) ||
			typeof m.alerts.link !== "string"
		)
			fail("alerts {due, link}");
	}
	if (m.notifications !== undefined) {
		if (!plain(m.notifications) || !isFn(m.notifications.describe as never))
			fail("notifications {describe}");
	}
	if (m.credits !== undefined && typeof m.credits !== "string") fail("credits");
	return m as unknown as Manifest;
}
