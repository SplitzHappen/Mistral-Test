// The Tracker's manifest: manifest-only in stage 1 (its logic stays in the legacy page). Its section is the one
// raw pass-through: the Tracker checks it itself.
export const trackerManifest = {
	contract: 1,
	id: "tracker",
	title: "Tracker",
	path: "tracker/",
	order: { menu: 1, home: 1 },
	page: { isolated: false, ownWorker: true }, // its own worker at scope tracker/, no isolation headers
	home: {
		kicker: "Completion",
		text: "Every list for up to eight characters side by side, and the Live boards: timers, dailies, hunts, weather, market.",
		go: "Open the Tracker",
		glyph:
			'<rect x="9" y="6" width="30" height="36" rx="2"/><path d="M15 17l3 3 6-6M15 29l3 3 6-6M28 17h6M28 29h6"/>',
	},
	save: { raw: true },
	credits:
		"Tracker data from xivapi/ffxiv-datamining, FFXIV Teamcraft (MIT), FFXIV Collect and the FFXIV 100% Completion Checklist team.",
} as const;
