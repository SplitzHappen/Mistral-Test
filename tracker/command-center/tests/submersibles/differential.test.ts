import assert from "node:assert/strict";
import { test } from "node:test";
import * as vm from "node:vm";
import * as alerts from "../../src/modules/submersibles/logic/alerts.ts";
import * as cal from "../../src/modules/submersibles/logic/calendar.ts";
import { createEarn } from "../../src/modules/submersibles/logic/earn.ts";
import * as page from "../../src/modules/submersibles/logic/page.ts";
import * as time from "../../src/modules/submersibles/logic/time.ts";
import { createAdvisor } from "../../src/modules/submersibles/logic/voyage.ts";
import { extractSubsFns, legacyApi, loadData, mulberry32 } from "./ref.ts";

// Differential tests, submersibles logic: legacy (frozen reference copies in tests/reference/submersibles,
// run in a vm; subs.js helpers by evaluating their own extracted text against a stand-in scope) vs the new
// typed modules in src/modules/submersibles/logic. Equal by deep comparison AND by JSON text.
// Run per process with TZ=UTC, TZ=America/Los_Angeles, TZ=Pacific/Auckland (see VERIFY.sh).

const SEED = 0x5eed5ab5;
const CASES = 2000;
console.log(
	`differential seed: ${SEED.toString(16)} tz: ${process.env.TZ || "(system)"}`,
);

const legacy = legacyApi();
const D = loadData();
legacy.ADVISOR.init(D);
legacy.EARN.init(D);
const adv = createAdvisor(D);
const ea = createEarn(D);
const pg = page.createPageData(D);
const rand = mulberry32(SEED);

const NOW0 = 1767225600000; // 2026-01-01T00:00:00Z
const pick = (arr: any[]): any => arr[Math.floor(rand() * arr.length)];
const rint = (n: number) => Math.floor(rand() * n);

function eq(a: unknown, b: unknown, label: string): void {
	// vm-realm results have foreign prototypes, so deep-compare JSON-normalized copies, plus raw JSON text
	const ja = JSON.stringify(a);
	const jb = JSON.stringify(b);
	assert.equal(ja, jb, `${label} (json text)`);
	assert.deepEqual(JSON.parse(ja), JSON.parse(jb), `${label} (deep)`);
}

function run(fn: () => unknown): unknown {
	try {
		return { v: fn() };
	} catch (e) {
		return { e: `${(e as Error).name}: ${(e as Error).message}` };
	}
}

function randSection(): any {
	const sec: any = { fcs: {}, subs: {}, trips: {}, settings: {} };
	const fcs = 1 + rint(3);
	for (let i = 0; i < fcs; i++) {
		const id = `fc${i}`;
		sec.fcs[id] = {
			name: pick(["Alpha", "Beta FC", "", undefined, "Öbb"]) as
				| string
				| undefined,
			order: rint(5),
			unlockedSlots: pick([1, 1, 2, 3, 4]),
			discovered: Array.from(
				new Set(Array.from({ length: rint(14) }, () => pick(D.sectors).id)),
			).sort((a: number, b: number) => a - b),
			world: pick(["Cerberus", "Moogle", undefined]),
		};
	}
	const subs = 1 + rint(6);
	for (let i = 0; i < subs; i++) {
		const id = `s${i}`;
		const s: any = {
			fcId: `fc${rint(fcs)}`,
			slot: 1 + rint(4),
			name: pick(["Shark", "", undefined]),
			rank: pick([1, 5, 20, 60, 100, 145, undefined, 0]),
			expIntoRank: rint(5000),
			parts:
				rand() < 0.8
					? [0, 1, 2, 3].map(() => pick(D.parts).id)
					: [0, 1, 2].map(() => pick(D.parts).id),
		};
		if (rand() < 0.6) {
			s.voyage = {
				sentAt: NOW0 + rint(200000000),
				route: Array.from({ length: 1 + rint(5) }, () => pick(D.sectors).id),
				returnAt: NOW0 + rint(400000000) - 100000000,
				...(rand() < 0.5 ? { calcAt: NOW0 + rint(400000000) } : {}),
				...(rand() < 0.4 ? { gameSaid: pick(["2h 30m", "27:45", ""]) } : {}),
			};
		}
		sec.subs[id] = s;
	}
	const trips = rint(9);
	for (let i = 0; i < trips; i++) {
		sec.trips[`s${rint(6)}-${NOW0 + rint(300000000)}`] = {
			s: `s${rint(6)}`,
			t: NOW0 + rint(300000000),
			r: Array.from({ length: rint(6) }, () => pick(D.sectors).id),
			back: rand() < 0.8 ? NOW0 + rint(400000000) : undefined,
			items:
				rand() < 0.7
					? Array.from({ length: 1 + rint(4) }, () => [
							pick(Object.keys(D.items).map(Number)),
							1 + rint(20),
						])
					: [],
			newSectors: Array.from({ length: rint(3) }, () => pick(D.sectors).id),
			...(rand() < 0.5 ? { calc: NOW0 + rint(400000000) } : {}),
			...(rand() < 0.4 ? { said: "3h" } : {}),
			...(rand() < 0.5 ? { rankAfter: pick([1, 40, 145]) } : {}),
		};
	}
	sec.settings.prefs = {
		sort: pick(["fc", "name"]),
		grouping: pick(["auto", "sub", "fc", "fleet"]),
		night: pick(["always", "quiet"]),
		quietHours: { from: rint(1440), to: rint(1440) },
		priceWorld: pick(["", "Cerberus", undefined]),
	};
	return sec;
}

const DUR_TEXTS = [
	"1d 3h 12m",
	"3h",
	"45 min",
	"27:45",
	"27:45:10",
	"0:00",
	"999:59",
	"1:60",
	"abc",
	"",
	"1.5h",
	"1,5h",
	"30d",
	"31d",
	"0h",
	"1h30m",
	"2 days 3 hours",
	"10x",
	"1 h 2 m",
	"  12m  ",
	"5 secs",
	"1d2h3m4s",
	"12:00:00",
	"1d 3h 12m extra",
	"-3h",
	"1.5 d",
];
const BACK_VALS = [
	"2026-11-12T21:40",
	"2026-02-30T10:00",
	"2026-11-12 21:40",
	"2026-11-12T21:40:00",
	"",
	"2026-1-1T1:1",
	"2027-01-01T00:00",
	"1999-12-31T23:59",
	"abcd-ef-ghTij:kl",
];

test(`time family: parseDuration/parseBackAt/localInput/status/fleet/summary/fmtDur/fmtClock, ${CASES} seeded cases`, () => {
	for (let i = 0; i < CASES; i++) {
		const txt =
			pick(DUR_TEXTS) +
			(rand() < 0.3
				? String(rint(100)) + pick(["m", "h", "d", "x", ":30"])
				: "");
		eq(
			time.parseDuration(txt),
			legacy.FLEET.parseDuration(txt),
			`parseDuration(${JSON.stringify(txt)})`,
		);
		const bv = pick(BACK_VALS);
		eq(
			time.parseBackAt(bv),
			legacy.FLEET.parseBackAt(bv),
			`parseBackAt(${bv})`,
		);
		const t = NOW0 + rint(800000000) - 200000000;
		eq(time.localInput(t), legacy.FLEET.localInput(t), "localInput");
		const sec = randSection();
		const now = NOW0 + rint(400000000) - 100000000;
		eq(time.fleet(sec, now), legacy.FLEET.fleet(sec, now), "fleet");
		eq(time.summary(sec, now), legacy.FLEET.summary(sec, now), "summary");
		for (const id of Object.keys(sec.subs)) {
			eq(
				time.status(sec.subs[id], sec.fcs[sec.subs[id].fcId], now),
				legacy.FLEET.status(sec.subs[id], sec.fcs[sec.subs[id].fcId], now),
				`status ${id}`,
			);
		}
		const ms = rint(40 * 24 * 3600 * 1000);
		const up = rand() < 0.5;
		eq(time.fmtDur(ms, up), legacy.FLEET.fmtDur(ms, up), "fmtDur");
		eq(time.fmtDur(-5), legacy.FLEET.fmtDur(-5), "fmtDur neg");
		eq(time.fmtClock(t, now), legacy.FLEET.fmtClock(t, now), "fmtClock");
	}
});

test(`calendar family: ics byte-for-byte and fileName, ${CASES} seeded cases`, () => {
	const pieces = [
		"Sub",
		"Alpha FC",
		"is back",
		",",
		";",
		"\\",
		"\n",
		"ü",
		"ß",
		"日本",
		"🚢",
		"a".repeat(200),
		"\r\n",
		"'",
		'"',
	];
	for (let i = 0; i < CASES; i++) {
		const title = Array.from({ length: 1 + rint(6) }, () => pick(pieces)).join(
			"",
		);
		const note = Array.from({ length: rint(4) }, () => pick(pieces)).join("");
		const o = {
			title,
			at: NOW0 + rint(900000000),
			uid: `u${rint(100000)}`,
			note,
			now: NOW0 + rint(900000000),
		};
		// fold() throws URIError on astral characters (lone surrogates) in BOTH sides; compare that too
		eq(
			run(() => cal.ics(o)),
			run(() => legacy.FLEET.ics(o)),
			"ics",
		);
		eq(cal.fileName(title), legacy.FLEET.fileName(title), "fileName");
	}
});

test(`voyage family: stats/evalRoute/rankAfter/afterVoyage, ${CASES} seeded cases`, () => {
	for (let i = 0; i < CASES; i++) {
		const rank = pick([1, 2, 30, 77, 145, 0, 146, undefined]);
		const parts =
			rand() < 0.85
				? [0, 1, 2, 3].map(() => pick(D.parts).id)
				: [0, 1, 2].map(() => pick(D.parts).id);
		eq(
			adv.stats(rank as number, parts),
			legacy.ADVISOR.stats(rank as number, parts),
			"stats",
		);
		const st = adv.stats(
			pick([1, 40, 100, 145]) as number,
			[0, 1, 2, 3].map(() => pick(D.parts).id),
		);
		const sea = pick(D.seas);
		const route = Array.from(
			{ length: 1 + rint(6) },
			() =>
				(rand() < 0.85
					? pick(D.sectors.filter((s: any) => s.sea === sea.id))
					: pick(D.sectors)
				).id,
		);
		if (rand() < 0.1) route.push(9999);
		eq(
			adv.evalRoute(route, st),
			legacy.ADVISOR.evalRoute(route, st),
			`evalRoute ${route}`,
		);
		const r0 = pick([1, 10, 100, 145]);
		const into = rint(8000);
		const exp = rint(400000);
		eq(
			adv.rankAfter(r0, into, exp),
			legacy.ADVISOR.rankAfter(r0, into, exp),
			"rankAfter",
		);
		const sub = { rank: r0, expIntoRank: into, parts };
		eq(
			adv.afterVoyage(sub as any, route),
			legacy.ADVISOR.afterVoyage(sub, route),
			"afterVoyage",
		);
		eq(
			run(() => adv.routeText(route)),
			run(() => legacy.ADVISOR.routeText(route)),
			"routeText",
		);
		const cid = pick(D.sectors).id;
		eq(adv.children(cid), legacy.ADVISOR.children(cid), "children");
		const emptyRoute = rand() < 0.5 ? [] : null;
		eq(
			adv.evalRoute(emptyRoute, st),
			legacy.ADVISOR.evalRoute(emptyRoute, st),
			"evalRoute empty",
		);
	}
});

test(`advisor family: advise, ${CASES} seeded cases`, () => {
	for (let i = 0; i < CASES; i++) {
		const fc = {
			unlockedSlots: pick([1, 2, 3, 4]),
			discovered: Array.from(
				new Set(Array.from({ length: rint(6) }, () => pick(D.sectors).id)),
			),
		};
		const sub = {
			rank: pick([1, 15, 45, 90, 145]),
			expIntoRank: rint(9000),
			parts: [0, 1, 2, 3].map(() => pick(D.parts).id),
		};
		const input = {
			sub,
			fc,
			pending: Array.from({ length: rint(3) }, () => pick(D.sectors).id),
			slotsFilled: pick([1, 2, 3, 4]),
		};
		eq(
			adv.advise(input as any),
			legacy.ADVISOR.advise(JSON.parse(JSON.stringify(input))),
			`advise ${i}`,
		);
	}
});

test(`alerts family: modes/alerts incl. quiet hours and stragglers, ${CASES} seeded cases`, () => {
	const stages = ["unlock", "gil", "final"];
	for (let i = 0; i < CASES; i++) {
		const sec = randSection();
		const prefs = sec.settings.prefs;
		const stageMap: Record<string, string> = {};
		for (const id of Object.keys(sec.fcs)) stageMap[id] = pick(stages);
		const stageOf = (id: string) => stageMap[id] || "unlock";
		const now = NOW0 + rint(400000000) - 100000000;
		eq(
			alerts.modes(sec, prefs, stageOf),
			legacy.PUSH.modes(sec, prefs, stageOf),
			"modes",
		);
		eq(
			alerts.alerts(sec, prefs, stageOf, now),
			legacy.PUSH.alerts(sec, prefs, stageOf, now),
			"alerts",
		);
	}
});

test(`earn family: routeLoot/history/unitValue/tripValue/totals/csv/archive/restore, ${CASES} seeded cases`, () => {
	for (let i = 0; i < CASES; i++) {
		const sec = randSection();
		const route = Array.from({ length: rint(6) }, () => pick(D.sectors).id);
		const prices: Record<string, number> = {};
		for (let j = 0; j < 8; j++)
			prices[String(pick(Object.keys(D.items).map(Number)))] = rint(100000);
		eq(ea.routeLoot(route), legacy.EARN.routeLoot(route), "routeLoot");
		eq(
			ea.history(sec.trips, route),
			legacy.EARN.history(sec.trips, route),
			"history",
		);
		const id = pick(Object.keys(D.items).map(Number));
		eq(
			ea.unitValue(id, prices),
			legacy.EARN.unitValue(id, prices),
			"unitValue",
		);
		eq(
			ea.unitValue(id, null),
			legacy.EARN.unitValue(id, null),
			"unitValue noprices",
		);
		const trip = (Object.values(sec.trips)[
			rint(Object.keys(sec.trips).length)
		] || { s: "s0", t: NOW0, items: [[1, 2]] }) as any;
		eq(
			ea.tripValue(trip, prices),
			legacy.EARN.tripValue(trip, prices),
			"tripValue",
		);
		const now = NOW0 + rint(900000000);
		eq(
			ea.totals(sec, prices, now),
			legacy.EARN.totals(sec, prices, now),
			"totals",
		);
		eq(
			ea.csv(sec, prices, (r: any) => r.join(">")),
			legacy.EARN.csv(sec, prices, (r: any) => r.join(">")),
			"csv",
		);
		const before = NOW0 + rint(800000000);
		const origNow = vm.runInContext("Date.now", legacy);
		legacy.__origNow = origNow;
		vm.runInContext(`Date.now = () => ${now}`, legacy); // the vm realm has its own Date
		let la: any;
		try {
			la = legacy.EARN.archive(sec, before);
		} finally {
			vm.runInContext("Date.now = globalThis.__origNow", legacy);
			delete legacy.__origNow;
		}
		eq(ea.archive(sec, before, now), la, "archive");
		const c1 = JSON.parse(JSON.stringify(sec));
		const c2 = JSON.parse(JSON.stringify(sec));
		eq(
			ea.restore(c1, la),
			legacy.EARN.restore(c2, JSON.parse(JSON.stringify(la))),
			"restore count",
		);
		eq(c1, c2, "restore doc");
	}
});

// subs.js helpers: method per function, evaluated from the legacy file's own text against a stand-in scope.
const subsSrcScope = (): Record<string, any> => {
	const SECTOR: Record<number, any> = {};
	const SEA: Record<number, any> = {};
	const PART: Record<number, any> = {};
	const CLASS: Record<number, any> = {};
	D.sectors.forEach((s: any) => {
		SECTOR[s.id] = s;
	});
	D.seas.forEach((s: any) => {
		SEA[s.id] = s;
	});
	D.parts.forEach((p: any) => {
		PART[p.id] = p;
	});
	D.classes.forEach((c: any) => {
		CLASS[c.id] = c;
	});
	const LETTER = {
		Shark: "S",
		Unkiu: "U",
		Whale: "W",
		Coelacanth: "C",
		Syldra: "Y",
	};
	return {
		D,
		SECTOR,
		SEA,
		PART,
		CLASS,
		LETTER,
		ADV: legacy.ADVISOR,
		F: legacy.FLEET,
		EARN: legacy.EARN,
		PUSH: legacy.PUSH,
		S: null,
		esc: (s: any) => String(s),
		Date,
	};
};
const PURE_FNS = [
	"classCode",
	"partsCode",
	"partsTitle",
	"sectorShort",
	"routeText",
	"startSectors",
	"slotUnlock",
	"sectorLabel",
	"minutes",
	"hhmm",
	"fmtGil",
];
const STATE_FNS = [
	"fcList",
	"subsOf",
	"pendingFor",
	"slotsFilled",
	"stageOf",
	"confirmation",
	"applyFinds",
	"logTrip",
];

test(`page family (subs.js helpers, extracted-text eval vs logic/page.ts), ${CASES} seeded cases`, () => {
	const baseScope = subsSrcScope();
	const pure: Record<string, any> = extractSubsFns(PURE_FNS, baseScope);
	for (const f of PURE_FNS)
		console.log(
			`subs.js helper ${f}: method=extract-text-eval against stand-in scope`,
		);
	for (let i = 0; i < CASES; i++) {
		const sec = randSection();
		const now = NOW0 + rint(400000000) - 100000000;
		const FakeDate = class extends Date {
			static now() {
				return now;
			}
		};
		const scope = { ...baseScope, S: sec, Date: FakeDate };
		const fns: Record<string, any> = extractSubsFns(STATE_FNS, scope);
		const cls = pick(D.classes);
		eq(pg.classCode(cls), pure.classCode(cls), "classCode");
		const parts =
			rand() < 0.8 ? [0, 1, 2, 3].map(() => pick(D.parts).id) : [1, 2];
		eq(pg.partsCode(parts), pure.partsCode(parts), "partsCode");
		eq(pg.partsTitle(parts), pure.partsTitle(parts), "partsTitle");
		const sid = pick(D.sectors).id;
		eq(pg.sectorShort(sid), pure.sectorShort(sid), "sectorShort");
		const route = Array.from({ length: rint(6) }, () => pick(D.sectors).id);
		eq(pg.routeText(route), pure.routeText(route), "routeText");
		eq(pg.startSectors(), pure.startSectors(), "startSectors");
		const slotNo = pick([1, 2, 3, 4, 5]);
		eq(pg.slotUnlock(slotNo), pure.slotUnlock(slotNo), "slotUnlock");
		const sectorObj = D.sectors[rint(D.sectors.length)];
		eq(pg.sectorLabel(sectorObj), pure.sectorLabel(sectorObj), "sectorLabel");
		const minText = pick(["00:00", "23:59", "7:30", "abc", "", "24:00"]);
		eq(page.minutes(minText), pure.minutes(minText), "minutes");
		const hh = rint(2000);
		eq(page.hhmm(hh), pure.hhmm(hh), "hhmm");
		const gil = rint(1e9);
		eq(page.fmtGil(gil), pure.fmtGil(gil), "fmtGil");
		eq(page.fcList(sec), fns.fcList(), "fcList");
		const fcId = `fc${rint(3)}`;
		eq(page.subsOf(sec, fcId), fns.subsOf(fcId), "subsOf");
		const subId = Object.keys(sec.subs).length
			? pick(Object.keys(sec.subs))
			: "sX";
		eq(
			run(() => page.pendingFor(sec, subId, now)),
			run(() => fns.pendingFor(subId)),
			"pendingFor",
		);
		eq(page.slotsFilled(sec, fcId), fns.slotsFilled(fcId), "slotsFilled");
		eq(page.stageOf(sec, adv, fcId), fns.stageOf(fcId), "stageOf");
		eq(page.confirmation(sec), fns.confirmation(), "confirmation");
		const loot = {
			items: [[pick(Object.keys(D.items).map(Number)), 1 + rint(5)]],
			newSectors: Array.from({ length: rint(3) }, () => pick(D.sectors).id),
			slot: rand() < 0.3,
		};
		const c1 = JSON.parse(JSON.stringify(sec));
		const c2 = JSON.parse(JSON.stringify(sec));
		page.applyFinds(c1, fcId, JSON.parse(JSON.stringify(loot)));
		extractSubsFns(["applyFinds"], {
			...baseScope,
			S: c2,
			Date: FakeDate,
		}).applyFinds(fcId, JSON.parse(JSON.stringify(loot)));
		eq(c1, c2, "applyFinds doc (json text, key order included)");
		const rankFix = pick([0, 1, 50, 145, 200]);
		const l1 = JSON.parse(JSON.stringify(sec));
		const l2 = JSON.parse(JSON.stringify(sec));
		run(() =>
			page.logTrip(l1, adv, subId, rankFix, JSON.parse(JSON.stringify(loot))),
		);
		run(() =>
			extractSubsFns(["applyFinds", "logTrip"], {
				...baseScope,
				S: l2,
				Date: FakeDate,
			}).logTrip(subId, rankFix, JSON.parse(JSON.stringify(loot))),
		);
		eq(l1, l2, "logTrip doc (json text, key order included)");
	}
	for (const f of STATE_FNS)
		console.log(
			`subs.js helper ${f}: method=extract-text-eval against stand-in scope (S/Date injected per case)`,
		);
});

test("fixed cases for every branch: time parsing and wording", () => {
	for (const t of [
		"27:45",
		"27:45:10",
		"0:00",
		"999:59",
		"1d 3h 12m",
		"3h",
		"45 min",
		"1.5h",
		"1,5h",
		"30d",
		"31d",
		"0h",
		"abc",
		"",
		"1h30m",
		"10x",
		"1:60",
		"5 secs",
		"2 days 3 hours",
		"1d 3h 12m extra",
	]) {
		eq(
			time.parseDuration(t),
			legacy.FLEET.parseDuration(t),
			`parseDuration ${JSON.stringify(t)}`,
		);
	}
	for (const v of BACK_VALS)
		eq(time.parseBackAt(v), legacy.FLEET.parseBackAt(v), `parseBackAt ${v}`);
	for (const ms of [
		0,
		-1,
		1,
		59000,
		60000,
		61000,
		3599000,
		3600000,
		3660000,
		86400000,
		90000000,
		172800000,
		2592000000,
		30 * 86400000,
		31 * 86400000,
	]) {
		eq(time.fmtDur(ms, true), legacy.FLEET.fmtDur(ms, true), `fmtDur up ${ms}`);
		eq(time.fmtDur(ms, false), legacy.FLEET.fmtDur(ms, false), `fmtDur ${ms}`);
	}
	const now = NOW0;
	for (const off of [
		0,
		60000,
		-60000,
		86400000,
		-86400000,
		3 * 86400000,
		-3 * 86400000,
		6 * 86400000,
		30 * 86400000,
		400 * 86400000,
	]) {
		eq(
			time.fmtClock(now + off, now),
			legacy.FLEET.fmtClock(now + off, now),
			`fmtClock ${off}`,
		);
	}
	const sec = randSection();
	for (const st of ["locked", "out", "back", "idle"]) {
		const sub = { slot: 9, voyage: null } as any;
		const fc = { unlockedSlots: 2 };
		const s2 = {
			slot: 1,
			voyage:
				st === "out"
					? { returnAt: now + 1e6 }
					: st === "back"
						? { returnAt: now - 1 }
						: null,
		} as any;
		eq(
			time.status(st === "locked" ? sub : s2, fc, now),
			legacy.FLEET.status(st === "locked" ? sub : s2, fc, now),
			`status ${st}`,
		);
	}
	eq(time.fleet(null, now), legacy.FLEET.fleet(null, now), "fleet null");
	eq(time.summary(sec, now), legacy.FLEET.summary(sec, now), "summary fixed");
});

test("fixed cases for every branch: calendar, voyage, advisor, alerts, earn", () => {
	const now = NOW0;
	const titles = [
		"Sub Alpha is back",
		"with, comma; semi \\ backslash",
		"line\nbreak\r\n2",
		"ü ß 日本 🚢",
		"x".repeat(300),
		"",
		"  spaced  out  ",
	];
	for (const t of titles) {
		const o = {
			title: t,
			at: now + 3600000,
			uid: "fix1",
			note: `${t} note`,
			now,
		};
		eq(
			run(() => cal.ics(o)),
			run(() => legacy.FLEET.ics(o)),
			`ics ${JSON.stringify(t).slice(0, 40)}`,
		);
		eq(
			cal.fileName(t),
			legacy.FLEET.fileName(t),
			`fileName ${JSON.stringify(t).slice(0, 40)}`,
		);
	}
	const parts = [0, 1, 2, 3].map(() => pick(D.parts).id);
	for (const rank of [1, 50, 145, 0, 146])
		eq(
			adv.stats(rank, parts),
			legacy.ADVISOR.stats(rank, parts),
			`stats ${rank}`,
		);
	eq(adv.stats(10, [1, 2]), legacy.ADVISOR.stats(10, [1, 2]), "stats short");
	const sea = D.seas[0];
	const inSea = D.sectors
		.filter((s: any) => s.sea === sea.id)
		.map((s: any) => s.id);
	for (const route of [
		[inSea[0]],
		inSea.slice(0, 5),
		[inSea[0], 9999],
		[D.sectors[0].id, D.sectors[50].id],
		[],
		[inSea[0], inSea[0]],
	]) {
		const st = adv.stats(145, parts);
		eq(
			adv.evalRoute(route, st),
			legacy.ADVISOR.evalRoute(route, st),
			`evalRoute ${route}`,
		);
	}
	eq(
		adv.rankAfter(1, 0, 100000000),
		legacy.ADVISOR.rankAfter(1, 0, 100000000),
		"rankAfter huge",
	);
	eq(
		adv.rankAfter(145, 0, 5),
		legacy.ADVISOR.rankAfter(145, 0, 5),
		"rankAfter top",
	);
	for (const slots of [1, 2, 3, 4]) {
		const input = {
			sub: { rank: 145, expIntoRank: 0, parts },
			fc: { unlockedSlots: slots, discovered: inSea.slice(0, 8) },
			pending: [inSea[0]],
			slotsFilled: slots,
		};
		eq(
			adv.advise(input as any),
			legacy.ADVISOR.advise(JSON.parse(JSON.stringify(input))),
			`advise slots ${slots}`,
		);
	}
	eq(
		adv.advise({
			sub: { rank: 1 },
			fc: { unlockedSlots: 1, discovered: [] },
		} as any),
		legacy.ADVISOR.advise({
			sub: { rank: 1 },
			fc: { unlockedSlots: 1, discovered: [] },
		}),
		"advise blocked",
	);
	const sec = randSection();
	for (const g of ["auto", "sub", "fc", "fleet"]) {
		for (const night of ["always", "quiet"]) {
			const prefs = {
				grouping: g,
				night,
				quietHours: { from: 23 * 60, to: 7 * 60 },
			};
			const stageOf = () => pick(["unlock", "gil", "final"]);
			eq(
				alerts.alerts(sec, prefs, stageOf, now),
				legacy.PUSH.alerts(sec, prefs, stageOf, now),
				`alerts ${g}/${night}`,
			);
		}
	}
	const prices = { [String(Object.keys(D.items)[0])]: 1000 };
	eq(
		ea.totals(sec, prices, now),
		legacy.EARN.totals(sec, prices, now),
		"totals fixed",
	);
	eq(ea.csv(sec, prices), legacy.EARN.csv(sec, prices), "csv fixed");
});
