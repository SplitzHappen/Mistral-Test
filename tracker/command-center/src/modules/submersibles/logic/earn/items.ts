import type { Trip } from "../data.ts";
import { D } from "../earn.ts";

export function name(id: number | string): string {
	return D?.items[String(id)] || `Item ${id}`;
}

export function merchant(id: number | string): number | null {
	const x = D?.itemInfo?.[String(id)];
	return x ? x[0] : null;
}

export function tradable(id: number | string): boolean {
	const x = D?.itemInfo?.[String(id)];
	return x ? x[1] === 1 : true;
}

export function routeLoot(
	route: number[] | null | undefined,
): { sector: number; items: number[] }[] {
	const seen: Record<number, number> = {};
	const out: { sector: number; items: number[] }[] = [];
	(route || []).forEach((sid) => {
		const list = (D?.loot[String(sid)] || []).filter((it) => {
			if (seen[it]) return false;
			seen[it] = 1;
			return true;
		});
		out.push({ sector: sid, items: list });
	});
	return out;
}

export function history(
	trips: Record<string, Trip> | null | undefined,
	route: number[] | null | undefined,
): { count: Record<number, number>; last: [number, number][] | null } {
	const key = (route || []).join(",");
	const count: Record<number, number> = {};
	let last: Trip | null = null;
	Object.keys(trips || {}).forEach((k) => {
		const t = (trips as Record<string, Trip>)[k];
		if ((t.r || []).join(",") !== key || !t.items || !t.items.length) return;
		t.items.forEach((x) => {
			count[x[0]] = (count[x[0]] || 0) + 1;
		});
		if (!last || t.t > (last as Trip).t) last = t;
	});
	const lt = last as Trip | null;
	return {
		count,
		last: lt?.items ? lt.items.map((x) => x.slice() as [number, number]) : null,
	};
}
