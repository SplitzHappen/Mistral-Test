// The Atelier's manifest: manifest-only in stage 1 (its logic stays in the legacy page). Its page is the one
// isolated page of the site, with its own worker, for multi-core solving.
import { checkAtelier } from "../../base/connector/index.ts";

export const atelierManifest = {
	contract: 1,
	id: "atelier",
	title: "Atelier",
	path: "atelier/",
	order: { menu: 2, home: 3 },
	page: { isolated: true, ownWorker: true }, // cross-origin isolated, own worker at scope atelier/
	home: {
		kicker: "Crafting",
		text: "Recipe search, crafter stats, solver, simulator and macros. Opens on its own page to use every processor core.",
		go: "Open the Atelier",
		glyph:
			'<path d="M10 38l16-16M22 12l6-6 14 14-6 6zM24 14l10 10"/><path d="M8 40l4-4"/>',
	},
	save: {
		empty: () => ({ v: 1, chars: {}, unassigned: null, saved: {}, prefs: {} }),
		check: (raw: unknown) =>
			checkAtelier((raw as Record<string, unknown>) || {}),
		label: "Atelier",
	},
	credits: "Solver by Raphael (Apache 2.0).",
} as const;
