// The Submersibles module's manifest: data and pure functions only. This is the one REAL module of stage 1
// (tracker and atelier are manifest-only; the example module is never published). The pure functions here are
// the module's contract surface; they call the ported logic in ./logic (time.*, shell.*), which is
// differential-tested against the frozen legacy shell.js / fleet.js (legacy wins any disagreement).
import { checkSubmersibles, type Doc } from "../../base/connector/index.ts";
import * as shell from "./logic/shell.ts";

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
		// the home tile line, exactly as the legacy shell writes it (including "No free company yet")
		return shell.homeTileLine(doc?.modules?.submersibles, now);
	},
	characterBadge(doc: Doc, charId: string) {
		// the free company name under a character, exactly as the legacy shell's fcOf finds it
		return shell.fcOf(doc?.modules?.submersibles, charId);
	},
	characterFields: [{ key: "fc", label: "Free company" }],
	alerts: {
		// today's in-app alert decision (FLEET.startAlerts) as a pure function of now, the page's opened
		// instant and the shown marks; defaults reproduce a page just opened at `now`
		due(
			section: unknown,
			now: number,
			opened = now,
			marks: Record<string, number> = {},
		) {
			const r = shell.dueBanners(
				section as Parameters<typeof shell.dueBanners>[0],
				now,
				opened,
				marks,
			);
			return r
				? r.due.map((x) => ({
						id: x.id,
						fcId: x.fcId,
						status: x.status,
						returnAt: x.sub.voyage?.returnAt,
					}))
				: [];
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
