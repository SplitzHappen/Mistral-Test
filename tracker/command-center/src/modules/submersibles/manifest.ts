// The Submersibles module's manifest: data and pure functions only. This is the one REAL module of stage 1
// (tracker and atelier are manifest-only; the example module is never published). The small pure functions here
// are the module's contract surface; phase 4 ports the full logic and differential-tests it against the legacy
// FLEET/PUSH code (legacy wins any disagreement).
import { checkSubmersibles, type Doc } from "../../base/connector/index.ts";

interface Sub {
	fcId?: unknown;
	slot?: unknown;
	voyage?: { returnAt?: unknown } | null;
}

function sectionOf(doc: Doc): Record<string, unknown> {
	return ((doc.modules.submersibles as Record<string, unknown>) ||
		{}) as Record<string, unknown>;
}

function subsOf(sec: unknown): Record<string, Sub> {
	const s = (sec as Record<string, unknown>) || {};
	return (s.subs as Record<string, Sub>) || {};
}

export const submersiblesManifest = {
	contract: 1,
	id: "submersibles",
	title: "Submersibles",
	path: "submersibles/",
	order: { menu: 3, home: 2 },
	page: { isolated: false, ownWorker: false }, // a shell page: kept with the shell's worker, not isolated (sw.js PAGES)
	home: {
		kicker: "Free company",
		text: "Your whole fleet on one board: worked-out return times, routes in your order, alerts and calendar entries.",
		go: "Open Submersibles",
		glyph:
			'<path d="M6 28c0-5 6-9 16-9h6c8 0 14 4 14 9s-6 9-14 9H22C12 37 6 33 6 28z"/><path d="M20 19v-6h8v6M24 13V8"/><circle cx="18" cy="28" r="2"/><circle cx="26" cy="28" r="2"/><circle cx="34" cy="28" r="2"/>',
	},
	save: {
		empty: () => ({ fcs: {}, subs: {}, trips: {}, settings: {} }),
		check: (raw: unknown) =>
			checkSubmersibles((raw as Record<string, unknown>) || {}),
		label: "Submersibles",
	},
	summary(doc: Doc, now: number) {
		const subs = subsOf(sectionOf(doc));
		let back = 0;
		let next: { id: string; returnAt: number } | null = null;
		for (const [id, s] of Object.entries(subs)) {
			const r =
				s.voyage && typeof s.voyage.returnAt === "number"
					? s.voyage.returnAt
					: null;
			if (r == null) continue;
			if (r <= now) back++;
			else if (!next || r < next.returnAt) next = { id, returnAt: r };
		}
		return { back, next };
	},
	characterBadge(doc: Doc, charId: string) {
		const fcs =
			(sectionOf(doc).fcs as Record<
				string,
				{ name?: unknown; charId?: unknown }
			>) || {};
		for (const f of Object.values(fcs))
			if (f.charId === charId) return String(f.name || "");
		return "";
	},
	characterFields: [{ key: "fc", label: "Free company" }],
	alerts: {
		due(section: unknown, now: number) {
			const out: { id: string; returnAt: number }[] = [];
			for (const [id, s] of Object.entries(subsOf(section))) {
				const r =
					s.voyage && typeof s.voyage.returnAt === "number"
						? s.voyage.returnAt
						: null;
				if (r != null && r <= now) out.push({ id, returnAt: r });
			}
			return out;
		},
		link: "submersibles/",
	},
	notifications: {
		describe: (what: unknown) =>
			`A submarine came back: ${JSON.stringify(what)}`,
	},
	credits:
		"Submersibles data from xivapi/ffxiv-datamining, FFXIV Teamcraft (MIT) and Submarine Tracker (MIT).",
} as const;
