import type { Sector } from "../data.ts";
import { D, evalRoute, SECTOR } from "../voyage.ts";
import type { EvalRoute, Stats } from "./types.ts";

export interface Cand {
	route: number[];
	ev: EvalRoute;
	score: number;
	label?: string;
}

export function search(
	pool: Sector[],
	st: Stats,
	score: (r: number[], ev: EvalRoute) => number,
	must?: number,
	keep?: number,
): Cand[] {
	const bySea: Record<number, number[]> = {};
	const out: Cand[] = [];
	pool.forEach((s) => {
		(bySea[s.sea] = bySea[s.sea] || []).push(s.id);
	});
	Object.keys(bySea).forEach((sea) => {
		const ids = bySea[+sea];
		if (must && SECTOR[must].sea !== +sea) return;
		let layer: number[][] = [[]];
		for (let depth = 0; depth < D.formula.maxSectors; depth++) {
			const next: Cand[] = [];
			layer.forEach((r) => {
				ids.forEach((id) => {
					if (r.indexOf(id) >= 0) return;
					const route = r.concat(id);
					const ev = evalRoute(route, st);
					if (!ev?.reachable) return;
					const sc = score(route, ev);
					next.push({ route, ev, score: sc });
				});
			});
			next.sort((a, b) => b.score - a.score);
			const kept = next.slice(0, keep || 80);
			kept.forEach((c) => {
				if (!must || c.route.indexOf(must) >= 0) out.push(c);
			});
			layer = kept.map((c) => c.route);
			if (!layer.length) break;
		}
	});
	out.sort((a, b) => b.score - a.score || a.ev.seconds - b.ev.seconds);
	const seen: Record<string, number> = {};
	const uniq: Cand[] = [];
	out.forEach((c) => {
		const k = c.route.slice().sort().join();
		if (!seen[k]) {
			seen[k] = 1;
			uniq.push(c);
		}
	});
	return uniq;
}

export function hours(ev: EvalRoute): number {
	return ev.seconds / 3600;
}
