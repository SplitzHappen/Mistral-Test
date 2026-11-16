import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import * as vm from "node:vm";
import * as shellLogic from "../../src/modules/submersibles/logic/shell.ts";
import { submersiblesManifest } from "../../src/modules/submersibles/manifest.ts";
import { mulberry32 } from "../submersibles/ref.ts";

// Task 3 differential: today's shell.js (the 'submersibles' home tile line and the fcOf character
// badges) and today's FLEET.startAlerts (in-app banners, shown marks) run in a vm against a stand-in
// page — fake DOM, fake storage, FAKE timers (never the real setInterval) and a FAKE clock — and are
// compared with the manifest's summary / characterBadge / alerts.due, which call the ported pure
// logic in logic/shell.ts. 2000 seeded saves plus fixed branches, in TZ=UTC /
// America/Los_Angeles / Pacific/Auckland per process (fmtClock is local HH:MM). vm-realm arrays fail
// deepStrictEqual, so results are compared as JSON text.

const CC = process.cwd();
const SEED = 0x5ce11a;
const CASES = 2000;
const SHELL_REF = join(CC, "tests", "reference", "shell", "shell.js");
const FLEET_REF = join(CC, "tests", "reference", "submersibles", "fleet.js");
const MIN = 60000;

console.log(
	`shell differential seed: ${SEED.toString(16)} tz: ${process.env.TZ || "(system)"}`,
);

let fakeNow = 0;
class FakeDate extends Date {
	static now(): number {
		return fakeNow;
	}
}

const livePages: { clear: () => void }[] = [];
after(() => {
	for (const p of livePages) p.clear();
	livePages.length = 0;
});

interface Page {
	ctx: any;
	tile: () => string;
	box: () => string;
	alerts: () => any;
	storageMarks: () => Record<string, number>;
	runTimers: () => void;
	setNow: (t: number) => void;
	clear: () => void;
}

function makePage(opts: {
	doc: any;
	withShell: boolean;
	section: () => any;
	onAlert?: (due: any[]) => void;
}): Page {
	const intervals: Record<string, { fn: any; ms: number }> = {};
	const timeouts: Record<string, { fn: any; ms: number }> = {};
	let nextId = 1;
	function el(tag: string): any {
		const e: any = {
			tagName: tag,
			id: "",
			className: "",
			innerHTML: "",
			textContent: "",
			hidden: false,
			children: [] as any[],
			attrs: {} as Record<string, string>,
			classList: { toggle(_c: string, _v?: boolean) {} },
			setAttribute(k: string, v: string) {
				e.attrs[k] = v;
			},
			appendChild(c: any) {
				e.children.push(c);
				return c;
			},
			removeChild(c: any) {
				const i = e.children.indexOf(c);
				if (i >= 0) e.children.splice(i, 1);
				return c;
			},
			remove() {},
			querySelector(_sel: string) {
				return el("button");
			},
			addEventListener(_t: string, _f: any) {},
			get firstChild() {
				return e.children[0];
			},
		};
		return e;
	}
	const tile = el("div");
	const box = el("div");
	const hello = el("span");
	const body = el("body");
	const byId: Record<string, any> = {
		save: box,
		"hello-name": hello,
		status: null,
	};
	const document: any = {
		getElementById(id: string) {
			if (id === "fleet-banners")
				return body.children.find((c: any) => c.id === "fleet-banners") || null;
			return byId[id] ?? null;
		},
		createElement(tag: string) {
			return el(tag);
		},
		querySelector(sel: string) {
			if (sel === '[data-live="submersibles"]') return tile;
			return null;
		},
		addEventListener(_t: string, _f: any) {},
		body,
		visibilityState: "visible",
	};
	const mkStore = () => {
		const m = new Map<string, string>();
		return {
			getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
			setItem: (k: string, v: string) => void m.set(k, String(v)),
			removeItem: (k: string) => void m.delete(k),
		};
	};
	const localStorage = mkStore();
	const sessionStorage = mkStore();
	const CCStandIn: any = {
		read: async () => ({ raw: opts.doc }),
		checkDoc: (raw: any) => raw, // both sides see the same section; the tile/alert logic is what is compared
		onChange: (_fn: any) => {},
	};
	const ctx: any = vm.createContext({
		console,
		URL,
		atob: (s: string) => (globalThis as any).atob(s),
		btoa: (s: string) => (globalThis as any).btoa(s),
		Date: FakeDate,
		setInterval: (fn: any, ms: number) => {
			const id = String(nextId++);
			intervals[id] = { fn, ms };
			return Number(id);
		},
		clearInterval: (id: number) => {
			delete intervals[String(id)];
		},
		setTimeout: (fn: any, ms: number) => {
			const id = String(nextId++);
			timeouts[id] = { fn, ms };
			return Number(id);
		},
		clearTimeout: (id: number) => {
			delete timeouts[String(id)];
		},
		localStorage,
		sessionStorage,
		navigator: { onLine: true },
		location: { protocol: "http:", href: "http://x/index.html" },
		document,
		CC: CCStandIn,
		addEventListener: (_t: string, _f: any) => {},
	});
	ctx.globalThis = ctx;
	ctx.window = ctx;
	vm.runInContext(readFileSync(FLEET_REF, "utf8"), ctx, {
		filename: "fleet.js",
	});
	let alertsApi: any = null;
	if (opts.withShell)
		vm.runInContext(readFileSync(SHELL_REF, "utf8"), ctx, {
			filename: "shell.js",
		});
	else
		alertsApi = ctx.FLEET.startAlerts({
			section: opts.section,
			link: "submersibles/",
			onAlert: opts.onAlert,
		});
	const page: Page = {
		ctx,
		tile: () => tile.innerHTML,
		box: () => box.innerHTML,
		alerts: () =>
			opts.withShell ? ctx.window.__commandCenter?.alerts : alertsApi,
		storageMarks: () => {
			const raw = localStorage.getItem("eveniunt-command-center-device");
			const d = raw ? JSON.parse(raw) : {};
			return ((d.subs || {}).alerted || {}) as Record<string, number>;
		},
		runTimers: () => {
			for (const id of Object.keys(intervals)) intervals[id].fn();
		},
		setNow: (t: number) => {
			fakeNow = t;
		},
		clear: () => {
			for (const id of Object.keys(intervals)) delete intervals[id];
			for (const id of Object.keys(timeouts)) delete timeouts[id];
		},
	};
	livePages.push(page);
	return page;
}

const flush = async () => {
	for (let i = 0; i < 8; i++) await Promise.resolve();
};

function seededDoc(rand: () => number, now: number): any {
	const pick = (arr: any[]) => arr[Math.floor(rand() * arr.length)];
	const rint = (n: number) => Math.floor(rand() * n);
	const names = [
		"Alpha",
		"Beta <FC>",
		'Q"uote',
		"O'Neil & Co",
		"Öbb",
		"",
		"  spaced  ",
	];
	const charNames = ["Alice", "Bob <b>", 'C"arol', "D'erp", "Émile"];
	const nFcs = rint(4); // 0..3
	const fcs: any = {};
	const usedChars: string[] = [];
	for (let i = 0; i < nFcs; i++) {
		const fc: any = { name: pick(names) };
		if (rand() < 0.7) {
			let id = `c${1 + rint(8)}`;
			while (usedChars.includes(id)) id = `c${1 + rint(8)}`;
			usedChars.push(id);
			fc.charId = id;
		}
		if (rand() < 0.5) fc.unlockedSlots = 1 + rint(4);
		if (rand() < 0.3) fc.world = pick(["Gilgamesh", "Exodus", ""]);
		fcs[`fc${i}`] = fc;
	}
	const subs: any = {};
	const nSubs = rint(6); // 0..5
	for (let i = 0; i < nSubs; i++) {
		const sub: any = {
			fcId: `fc${rint(Math.max(1, nFcs))}`,
			slot: 1 + rint(5),
		};
		if (rand() < 0.7) sub.name = pick(["Shark", "Orca", "", "Nautil/us"]);
		if (rand() < 0.85) {
			const returnAt =
				now +
				pick([
					-rint(8) * 3600000, // back
					rint(4) * 3600000 + rint(60) * MIN, // out soon
					(20 + rint(80)) * 3600000, // out later
					Math.floor(now / MIN) * MIN + rint(2) * MIN, // same-minute grouping
				]);
			sub.voyage = { sentAt: now - 3600000, route: [1, 2], returnAt };
		}
		subs[`s${i}`] = sub;
	}
	const chars: any[] = [];
	const nChars = rint(4);
	for (let i = 0; i < nChars; i++) {
		chars.push({
			id: `c${1 + rint(8)}`,
			name: pick(charNames),
			lodestone: null,
			gc: null,
		});
	}
	return {
		app: "eveniunt-command-center",
		v: 1,
		updated: now,
		chars,
		modules: {
			submersibles: { fcs, subs, trips: {}, settings: {} },
			atelier: { chars: {}, unassigned: null, saved: {}, prefs: {} },
		},
		device: {},
		moved: {},
	};
}

// compare one save at one clock reading: tile line, character badges, banner texts, marks, due
function compareAt(
	label: string,
	doc: any,
	sec: any,
	now: number,
	opened: number,
	marksBefore: Record<string, number>,
	shellPage: Page,
	alertsPage: Page,
	legacyDue: any[],
): void {
	const manifestSummary = submersiblesManifest.summary(doc, now);
	assert.equal(
		manifestSummary,
		shellPage.tile(),
		`${label}: tile line differs: manifest ${JSON.stringify(manifestSummary)} shell ${JSON.stringify(shellPage.tile())}`,
	);
	// character badges: the <small> under each char in the character list
	const lis = [...shellPage.box().matchAll(/<li>([\s\S]*?)<\/li>/g)].map(
		(m) => m[1],
	);
	assert.equal(lis.length, doc.chars.length, `${label}: char list count`);
	doc.chars.forEach((c: any, i: number) => {
		const badge = submersiblesManifest.characterBadge(doc, c.id);
		const expected =
			shellLogic.esc(c.name) +
			(badge ? `<small>${shellLogic.esc(badge)}</small>` : "");
		assert.equal(lis[i], expected, `${label}: char ${c.id} line`);
	});
	// banners: legacy api.shown vs ported groups' texts; marks vs ported marks
	const decision = shellLogic.dueBanners(sec, now, opened, marksBefore);
	const legacyApi = alertsPage.alerts();
	const legacyShown = JSON.stringify(legacyApi.shown);
	const portedShown = JSON.stringify(
		(decision?.groups || []).map((g) => shellLogic.bannerText(g, now)),
	);
	assert.equal(portedShown, legacyShown, `${label}: banner texts differ`);
	assert.equal(
		JSON.stringify(decision?.marks || {}),
		JSON.stringify(alertsPage.storageMarks()),
		`${label}: marks differ`,
	);
	// due: manifest.alerts.due vs legacy onAlert capture
	const manifestDue = JSON.stringify(
		submersiblesManifest.alerts.due(sec, now, opened, marksBefore),
	);
	const legacyDueJson = JSON.stringify(
		(legacyDue || []).map((x: any) => ({
			id: x.id,
			fcId: x.fcId,
			status: x.status,
			returnAt: x.sub.voyage.returnAt,
		})),
	);
	assert.equal(manifestDue, legacyDueJson, `${label}: due differs`);
}

test("shell differential: 2000 seeded saves + fixed branches, tile/badges/banners/marks/due", async () => {
	const rand = mulberry32(SEED);
	const T0 = new Date(2026, 2, 8, 1, 30).getTime(); // local, across LA DST day
	for (let i = 0; i < CASES; i++) {
		const now = T0 + Math.floor(rand() * 40 * 24 * 3600000);
		const doc = seededDoc(rand, now);
		const sec = doc.modules.submersibles;
		fakeNow = now;
		// page 1: shell.js run against the stand-in (tile + character list)
		const shellPage = makePage({ doc, withShell: true, section: () => sec });
		await flush();
		// page 2: fleet.js only, startAlerts exactly as shell.js calls it, plus onAlert to observe due
		let legacyDue: any[] = [];
		const alertsPage = makePage({
			doc,
			withShell: false,
			section: () => sec,
			onAlert: (d: any[]) => {
				legacyDue = d;
			},
		});
		await flush();
		const opened = alertsPage.alerts().opened;
		compareAt(
			`case ${i} @T0`,
			doc,
			sec,
			now,
			opened,
			{},
			shellPage,
			alertsPage,
			legacyDue,
		);
		// advance the fake clock past some returns and tick both pages
		const now2 = now + 5 * 3600000 + Math.floor(rand() * 3600000);
		fakeNow = now2;
		const marksBefore = alertsPage.storageMarks();
		legacyDue = [];
		shellPage.runTimers(); // showSave (30 s interval) + the shell's own alerts tick
		alertsPage.runTimers();
		await flush();
		compareAt(
			`case ${i} @T1`,
			doc,
			sec,
			now2,
			opened,
			marksBefore,
			shellPage,
			alertsPage,
			legacyDue,
		);
		shellPage.clear();
		alertsPage.clear();
	}
});

test("shell differential: fixed branches", async () => {
	const now = new Date(2026, 10, 1, 12, 0).getTime();
	fakeNow = now;
	const branches: [string, any][] = [
		[
			"no submersibles section",
			{ chars: [], modules: { submersibles: null, atelier: {} } },
		],
		[
			"no fcs",
			{
				chars: [{ id: "c1", name: "A" }],
				modules: {
					submersibles: { fcs: {}, subs: {}, trips: {}, settings: {} },
				},
			},
		],
		[
			"one fc no subs",
			{
				chars: [],
				modules: {
					submersibles: {
						fcs: { fc0: { name: "Alpha", charId: "c2" } },
						subs: {},
						trips: {},
						settings: {},
					},
				},
			},
		],
		[
			"mixed statuses",
			{
				chars: [
					{ id: "c1", name: "Ann <&>" },
					{ id: "c3", name: 'Bo"b' },
				],
				modules: {
					submersibles: {
						fcs: {
							fc0: { name: "Alpha & <Co>", charId: "c1", unlockedSlots: 2 },
							fc1: { name: 'Beta "x"', charId: "c3", unlockedSlots: 4 },
						},
						subs: {
							s0: {
								fcId: "fc0",
								slot: 1,
								name: "Shark",
								voyage: { returnAt: now - MIN },
							}, // back
							s1: {
								fcId: "fc0",
								slot: 2,
								voyage: { returnAt: now + 90 * MIN },
							}, // out
							s2: { fcId: "fc0", slot: 3, voyage: { returnAt: now - 2 * MIN } }, // locked (slot 3 > 2)
							s3: { fcId: "fc1", slot: 1 }, // idle
							s4: {
								fcId: "fc1",
								slot: 2,
								name: "Orca",
								voyage: { returnAt: now + 45 * MIN },
							},
						},
						trips: {},
						settings: {},
					},
				},
			},
		],
		[
			"same-minute grouping + already returned while closed",
			{
				chars: [],
				modules: {
					submersibles: {
						fcs: { fc0: { name: "Alpha", unlockedSlots: 4 } },
						subs: {
							s0: {
								fcId: "fc0",
								slot: 1,
								name: "A",
								voyage: { returnAt: now - 30 * MIN },
							},
							s1: {
								fcId: "fc0",
								slot: 2,
								name: "B",
								voyage: {
									returnAt: Math.floor((now - 10 * MIN) / MIN) * MIN + 30 * MIN,
								},
							},
							s2: {
								fcId: "fc0",
								slot: 3,
								name: "C",
								voyage: {
									returnAt:
										Math.floor((now - 10 * MIN) / MIN) * MIN + 30 * MIN + 20000,
								},
							},
						},
						trips: {},
						settings: {},
					},
				},
			},
		],
	];
	for (const [label, doc] of branches) {
		const sec = doc.modules.submersibles;
		fakeNow = now;
		const shellPage = makePage({ doc, withShell: true, section: () => sec });
		await flush();
		let legacyDue: any[] = [];
		const alertsPage = makePage({
			doc,
			withShell: false,
			section: () => sec,
			onAlert: (d: any[]) => {
				legacyDue = d;
			},
		});
		await flush();
		const opened = alertsPage.alerts().opened;
		compareAt(
			`branch ${label} @T0`,
			doc,
			sec,
			now,
			opened,
			{},
			shellPage,
			alertsPage,
			legacyDue,
		);
		// advance past the returns: same-minute pair should share one banner
		const now2 = now + 3 * 3600000;
		fakeNow = now2;
		const marksBefore = alertsPage.storageMarks();
		legacyDue = [];
		shellPage.runTimers();
		alertsPage.runTimers();
		await flush();
		compareAt(
			`branch ${label} @T1`,
			doc,
			sec,
			now2,
			opened,
			marksBefore,
			shellPage,
			alertsPage,
			legacyDue,
		);
		shellPage.clear();
		alertsPage.clear();
	}
	// section null at the first tick: opened is still captured, nothing marked/bannered
	{
		const doc = {
			chars: [],
			modules: {
				submersibles: {
					fcs: { fc0: { name: "A" } },
					subs: {
						s0: { fcId: "fc0", slot: 1, voyage: { returnAt: now + MIN } },
					},
					trips: {},
					settings: {},
				},
			},
		};
		let sec: any = null;
		fakeNow = now;
		let legacyDue: any[] = [];
		const alertsPage = makePage({
			doc,
			withShell: false,
			section: () => sec,
			onAlert: (d: any[]) => {
				legacyDue = d;
			},
		});
		await flush();
		const opened = alertsPage.alerts().opened;
		assert.equal(
			alertsPage.alerts().shown.length,
			0,
			"no banners while section null",
		);
		assert.deepEqual(
			alertsPage.storageMarks(),
			{},
			"no marks while section null",
		);
		assert.equal(
			JSON.stringify(submersiblesManifest.alerts.due(null, now, opened, {})),
			"[]",
		);
		assert.equal(shellLogic.dueBanners(null, now, opened, {}), null);
		// now the section appears; the sub returns after `opened`, so it banners
		sec = doc.modules.submersibles;
		fakeNow = now + 2 * MIN;
		const marksBefore = alertsPage.storageMarks();
		legacyDue = [];
		alertsPage.runTimers();
		await flush();
		const shellPage = makePage({ doc, withShell: true, section: () => sec });
		await flush();
		compareAt(
			"null-then-set @T1",
			doc,
			sec,
			fakeNow,
			opened,
			marksBefore,
			shellPage,
			alertsPage,
			legacyDue,
		);
		shellPage.clear();
		alertsPage.clear();
	}
});
