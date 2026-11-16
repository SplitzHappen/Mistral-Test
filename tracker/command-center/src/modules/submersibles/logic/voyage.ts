import type { Part, Rank, Sea, Sector, Sub, SubData } from "./data.ts";
import { advise, STEPS } from "./voyage/advise.ts";
import {
	afterVoyage,
	children,
	name,
	rankAfter,
	routeText,
} from "./voyage/rank.ts";
import type {
	Advice,
	AdviseInput,
	Advisor,
	EvalRoute,
	Stats,
} from "./voyage/types.ts";
import { dist, STATS } from "./voyage/types.ts";

export type {
	Advice,
	AdviseInput,
	Advisor,
	EvalRoute,
	Stats,
} from "./voyage/types.ts";
export { SLOT_NAMES, STATS } from "./voyage/types.ts";

export let D: SubData;
export let SECTOR: Record<number, Sector> = {};
export let SEA: Record<number, Sea> = {};
export let PART: Record<number, Part> = {};
export let CLASS: Record<
	number,
	{ id: number; name: string; rank: number; parts: number[] }
> = {};
export let RANK: Record<number, Rank> = {};
export let CHILD: Record<number, number[]> = {};
export let TOP = 145;

function init(d: SubData): Advisor {
	D = d;
	SECTOR = {};
	SEA = {};
	PART = {};
	CLASS = {};
	RANK = {};
	CHILD = {};
	d.sectors.forEach((s) => {
		SECTOR[s.id] = s;
	});
	d.seas.forEach((s) => {
		SEA[s.id] = s;
	});
	d.parts.forEach((p) => {
		PART[p.id] = p;
	});
	d.classes.forEach((c) => {
		CLASS[c.id] = c;
	});
	d.ranks.forEach((r) => {
		RANK[r.rank] = r;
	});
	TOP = d.ranks[d.ranks.length - 1].rank;
	Object.keys(d.unlocks).forEach((k) => {
		const u = d.unlocks[k];
		if (u.by) (CHILD[u.by] = CHILD[u.by] || []).push(+k);
	});
	return api;
}

export function stats(rank: number, parts: unknown): Stats | null {
	if (
		!RANK[rank] ||
		!parts ||
		(parts as unknown[]).length !== 4 ||
		!(parts as unknown[]).every((p) => PART[p as number])
	)
		return null;
	const out = {} as Stats;
	STATS.forEach((k) => {
		out[k as keyof Stats] =
			(parts as number[]).reduce(
				(t, p) => t + (PART[p][k as keyof Part] as number),
				0,
			) + (RANK[rank][`${k}Bonus` as keyof Rank] as number);
	});
	return out;
}

export function evalRoute(
	route: number[] | null | undefined,
	st: Stats | null,
): EvalRoute | null {
	if (!route?.length || route.length > D.formula.maxSectors || !st) return null;
	const first = SECTOR[route[0]];
	if (!first) return null;
	const F = D.formula;
	const v = Math.max(st.speed, F.minSpeed);
	let prev: { x: number; y: number; z: number } = SEA[first.sea];
	let range = 0;
	let secs = 0;
	let tanks = 0;
	let exp = 0;
	for (let i = 0; i < route.length; i++) {
		const s = SECTOR[route[i]];
		if (!s || s.sea !== first.sea) return null;
		const l = dist(prev, s);
		range += Math.floor(l * F.distanceFactor) + s.surveyDistance;
		secs +=
			Math.floor(((l * F.travelFactor) / (v * 100)) * 60) +
			Math.floor(((s.survey * F.surveyFactor) / (v * 100)) * 60);
		tanks += s.tanks;
		exp += s.exp;
		prev = s;
	}
	return {
		range,
		maxRange: st.range,
		reachable: range <= st.range,
		seconds: secs + F.fixedSeconds,
		tanks,
		exp,
	};
}

const api: Advisor = {
	init,
	LABEL: () => (D ? D.formula.label : "calculated"),
	stats,
	evalRoute,
	rankAfter,
	afterVoyage,
	children,
	sectorName: name,
	routeText,
	advise,
	STEPS,
};
export function createAdvisor(data: SubData): Advisor {
	init(data);
	return api;
}
