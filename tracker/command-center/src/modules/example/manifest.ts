// The example module: built and tested so docs/ADDING_A_MODULE.md can point at real code, but NEVER published —
// registry() does not list it.
import type { Manifest } from "../../base/connector/index.ts";

const plain = (o: unknown): o is Record<string, unknown> =>
	!!o && typeof o === "object" && !Array.isArray(o);

export const exampleManifest: Manifest = {
	contract: 1,
	id: "example",
	title: "Example",
	path: "example/",
	order: { menu: 99, home: 99 },
	page: { isolated: false, ownWorker: false },
	home: {
		kicker: "Demo",
		text: "An example module, never published.",
		go: "Open the example",
		glyph: '<circle cx="24" cy="24" r="14"/>',
	},
	save: {
		empty: () => ({ count: 0 }),
		check: (raw: unknown) => {
			const o = plain(raw) ? raw : {};
			const n = Number(o.count);
			return { count: Number.isInteger(n) && n >= 0 && n <= 1e6 ? n : 0 };
		},
		label: "Example",
	},
	summary: (doc) => ({
		count: (doc.modules.example as { count?: number })?.count ?? 0,
	}),
	alerts: { due: () => [], link: "example/" },
	notifications: { describe: (what) => `Example: ${JSON.stringify(what)}` },
	credits: "Example module, never published.",
};
