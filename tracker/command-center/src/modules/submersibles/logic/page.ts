import type {
	Class,
	Fc,
	Loot,
	Part,
	Sea,
	Section,
	Sector,
	Sub,
	SubData,
} from "./data.ts";
import { tripId } from "./time.ts";
import type { Advisor } from "./voyage.ts";

const LETTER: Record<string, string> = {
	Shark: "S",
	Unkiu: "U",
	Whale: "W",
	Coelacanth: "C",
	Syldra: "Y",
};

export interface PageData {
	classCode(c: Class): string;
	partsCode(parts: unknown): string;
	partsTitle(parts: unknown): string;
	sectorShort(id: number): string;
	routeText(route: number[] | null | undefined): string;
	startSectors(): number[];
	slotUnlock(slot: number): Sector | null;
	sectorLabel(s: Sector): string;
}

export function createPageData(data: SubData): PageData {
	const SECTOR: Record<number, Sector> = {};
	const SEA: Record<number, Sea> = {};
	const PART: Record<number, Part> = {};
	const CLASS: Record<number, Class> = {};
	data.sectors.forEach((s) => {
		SECTOR[s.id] = s;
	});
	data.seas.forEach((s) => {
		SEA[s.id] = s;
	});
	data.parts.forEach((p) => {
		PART[p.id] = p;
	});
	data.classes.forEach((c) => {
		CLASS[c.id] = c;
	});
	const D = data;

	function classCode(c: Class): string {
		const base = c.name.replace(/^Modified /, "");
		return (LETTER[base] || base[0]) + (/^Modified /.test(c.name) ? "+" : "");
	}
	function partsCode(parts: unknown): string {
		return parts && (parts as unknown[]).length === 4
			? (parts as number[])
					.map((id) => (PART[id] ? classCode(CLASS[PART[id].class]) : "?"))
					.join("")
			: "????";
	}
	function partsTitle(parts: unknown): string {
		return parts && (parts as unknown[]).length === 4
			? (parts as number[])
					.map((id) => (PART[id] ? PART[id].name : "?"))
					.join(", ")
			: "parts not entered";
	}
	function sectorShort(id: number): string {
		const s = SECTOR[id];
		return s ? s.letter : "?";
	}
	function routeText(route: number[] | null | undefined): string {
		if (!route?.length) return "";
		const sea = SECTOR[route[0]] ? SEA[SECTOR[route[0]].sea].name : "";
		return `${sea}: ${route.map(sectorShort).join(" → ")}`;
	}
	function startSectors(): number[] {
		return Object.keys(D.unlocks)
			.filter((k) => D.unlocks[k].start)
			.map(Number);
	}
	function slotUnlock(slot: number): Sector | null {
		const u = D.subSlots.find((x) => x.slot === slot);
		return u ? SECTOR[u.sector] : null;
	}
	function sectorLabel(s: Sector): string {
		return `${SEA[s.sea].name} ${s.letter}`;
	}
	return {
		classCode,
		partsCode,
		partsTitle,
		sectorShort,
		routeText,
		startSectors,
		slotUnlock,
		sectorLabel,
	};
}

export function minutes(v: unknown): number | null {
	const m = /^(\d{2}):(\d{2})$/.exec((v || "") as string);
	return m ? +m[1] * 60 + +m[2] : null;
}

export function hhmm(n: number): string {
	return (
		String(Math.floor(n / 60)).padStart(2, "0") +
		":" +
		String(n % 60).padStart(2, "0")
	);
}

export function fmtGil(n: number): string {
	return `${Math.round(n).toLocaleString("en")} gil`;
}

export function fcList(sec: Section): { id: string; fc: Fc }[] {
	return Object.keys(sec.fcs)
		.map((id) => ({ id, fc: sec.fcs[id] }))
		.sort(
			(a, b) =>
				(a.fc.order || 0) - (b.fc.order || 0) ||
				String((a.fc.name as string) || "").localeCompare(
					String((b.fc.name as string) || ""),
				),
		);
}

export function subsOf(
	sec: Section,
	fcId: string,
): Record<number, { id: string; sub: Sub }> {
	const out: Record<number, { id: string; sub: Sub }> = {};
	Object.keys(sec.subs).forEach((id) => {
		const s = sec.subs[id];
		if (s.fcId === fcId && !out[s.slot]) out[s.slot] = { id, sub: s };
	});
	return out;
}

export function pendingFor(sec: Section, subId: string, now: number): number[] {
	const s = sec.subs[subId];
	let out: number[] = [];
	Object.keys(sec.subs).forEach((k) => {
		const x = sec.subs[k];
		if (k !== subId && x.fcId === s.fcId && x.voyage && x.voyage.returnAt > now)
			out = out.concat(x.voyage.route || []);
	});
	return out;
}

export function slotsFilled(sec: Section, fcId: string): number {
	return Object.keys(subsOf(sec, fcId)).length;
}

export function stageOf(sec: Section, adv: Advisor, fcId: string): string {
	const fc = sec.fcs[fcId];
	const list = Object.keys(sec.subs).filter(
		(k) =>
			sec.subs[k].fcId === fcId && sec.subs[k].slot <= (fc.unlockedSlots || 1),
	);
	if (!fc || !list.length) return "unlock";
	const advice = list.map((k) =>
		adv.advise({ sub: sec.subs[k], fc, slotsFilled: list.length }),
	);
	if (advice.some((a) => a.blocked || (a.step as number) < 3)) return "unlock";
	return list.every((k) => sec.subs[k].rank === 145) &&
		advice.every((a) => !a.parts)
		? "final"
		: "gil";
}

export function confirmation(sec: Section): {
	agree: number;
	differ: number;
	ok: boolean;
	text: string;
} {
	let agree = 0;
	let differ = 0;
	const look = (calc: unknown, back: unknown, said: unknown) => {
		if (calc && said && back) {
			if (Math.abs((back as number) - (calc as number)) <= 60000) agree++;
			else differ++;
		}
	};
	Object.keys(sec.trips).forEach((k) => {
		const t = sec.trips[k];
		look(t.calc, t.back, t.said);
	});
	Object.keys(sec.subs).forEach((k) => {
		const v = sec.subs[k].voyage;
		if (v) look(v.calcAt, v.returnAt, v.gameSaid);
	});
	const ok = agree >= 10 && differ === 0;
	return {
		agree,
		differ,
		ok,
		text: ok
			? `calculated, confirmed by ${agree} of your game times`
			: "calculated, not yet confirmed (" +
				agree +
				" of 10 game times agree" +
				(differ ? `, ${differ} differ` : "") +
				")",
	};
}

export function applyFinds(
	sec: Section,
	fcId: string,
	loot: Loot | null | undefined,
): void {
	const fc = sec.fcs[fcId];
	if (!fc || !loot) return;
	if (loot.newSectors.length)
		fc.discovered = Array.from(
			new Set((fc.discovered || []).concat(loot.newSectors)),
		).sort((a, b) => a - b);
	if (loot.slot && (fc.unlockedSlots || 1) < 4)
		fc.unlockedSlots = (fc.unlockedSlots || 1) + 1;
}

export function logTrip(
	sec: Section,
	adv: Advisor,
	subId: string,
	rankFix: number,
	loot: Loot | null | undefined,
): void {
	const s = sec.subs[subId];
	const v = s?.voyage;
	if (!v) return;
	const t = v.sentAt || v.returnAt;
	const trip: Record<string, unknown> = {
		s: subId,
		t,
		r: (v.route || []).slice(),
		back: v.returnAt,
		items: loot ? loot.items : [],
		newSectors: loot ? loot.newSectors : [],
	};
	applyFinds(sec, s.fcId, loot);
	if (v.calcAt) trip.calc = v.calcAt;
	if (v.gameSaid) trip.said = v.gameSaid;
	const after = adv.afterVoyage(s, v.route);
	if (after) {
		trip.rankCalc = after.rank;
		if (
			rankFix &&
			rankFix !== after.rank &&
			rankFix >= (s.rank as number) &&
			rankFix <= 145
		) {
			s.rank = rankFix;
			s.expIntoRank = 0;
		} else {
			s.rank = after.rank;
			s.expIntoRank = after.into;
		}
		trip.rankAfter = s.rank;
	} else if (rankFix && rankFix >= (s.rank || 1) && rankFix <= 145) {
		s.rank = rankFix;
		s.expIntoRank = 0;
		trip.rankAfter = rankFix;
	}
	sec.trips[tripId(subId, t)] = trip as Section["trips"][string];
	s.voyage = null;
}
