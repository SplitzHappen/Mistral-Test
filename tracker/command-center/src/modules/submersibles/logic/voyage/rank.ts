import type { Sub } from "../data.ts";
import { CHILD, D, RANK, SEA, SECTOR, TOP } from "../voyage.ts";

export function rankAfter(
	rank: number,
	into: number,
	exp: number,
): { rank: number; into: number } {
	let r = rank;
	let e = (into || 0) + exp;
	while (r < TOP && RANK[r] && e >= RANK[r].expToNext) {
		e -= RANK[r].expToNext;
		r += 1;
	}
	return { rank: r, into: e };
}

export function afterVoyage(
	sub: Sub,
	route: number[] | null | undefined,
): { exp: number; rank: number; into: number } | null {
	if (!sub || !RANK[sub.rank as number] || !route?.length) return null;
	const exp = route.reduce((t, id) => t + (SECTOR[id] ? SECTOR[id].exp : 0), 0);
	const r = rankAfter(sub.rank as number, sub.expIntoRank || 0, exp);
	return { exp, rank: r.rank, into: r.into };
}

export function children(id: number): number[] {
	return CHILD[id] || [];
}

export function chainTo(target: number, disc: Set<number>): number[] | null {
	const path = [target];
	let cur = target;
	let guard = 0;
	while (!disc.has(cur) && guard++ < 200) {
		const u = D.unlocks[cur];
		if (!u?.by) return null;
		cur = u.by;
		path.unshift(cur);
	}
	return disc.has(cur) ? path : null;
}

export function name(id: number): string {
	const s = SECTOR[id];
	return s ? `${SEA[s.sea].name} ${s.letter}` : "?";
}

export function routeText(route: number[] | null | undefined): string {
	return route?.length
		? SEA[SECTOR[route[0]].sea].name +
				": " +
				route.map((id) => SECTOR[id].letter).join(" → ")
		: "";
}
