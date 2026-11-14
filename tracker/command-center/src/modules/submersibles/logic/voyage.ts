import type { Part, Rank, Sea, Sector, Sub, SubData } from "./data.ts";

export const STATS = ["surveillance", "retrieval", "speed", "range", "favor"];
export const SLOT_NAMES = ["hull", "stern", "bow", "bridge"];

export interface Stats {
	surveillance: number;
	retrieval: number;
	speed: number;
	range: number;
	favor: number;
}

export interface EvalRoute {
	range: number;
	maxRange: number;
	reachable: boolean;
	seconds: number;
	tanks: number;
	exp: number;
}

export interface AdviseInput {
	sub: Sub;
	fc: { unlockedSlots?: number; discovered?: number[]; [key: string]: unknown };
	slotsFilled?: number;
	pending?: number[];
}

export interface Advice {
	step?: number;
	stepName?: string;
	goal?: string;
	plan?: {
		route: number[];
		ev: EvalRoute;
		why: string;
		score?: number;
		label?: string;
	};
	alts?: {
		route: number[];
		ev: EvalRoute;
		why: string;
		score?: number;
		label?: string;
	}[];
	parts?: {
		slot: number;
		from: number | null | undefined;
		to: number;
		gain: number;
		why: string;
	} | null;
	note?: string;
	blocked?: string;
}

export interface Advisor {
	init(d: SubData): Advisor;
	LABEL(): string;
	stats(rank: number, parts: unknown): Stats | null;
	evalRoute(
		route: number[] | null | undefined,
		st: Stats | null,
	): EvalRoute | null;
	rankAfter(
		rank: number,
		into: number,
		exp: number,
	): { rank: number; into: number };
	afterVoyage(
		sub: Sub,
		route: number[] | null | undefined,
	): { exp: number; rank: number; into: number } | null;
	children(id: number): number[];
	sectorName(id: number): string;
	routeText(route: number[] | null | undefined): string;
	advise(input: AdviseInput): Advice;
	STEPS: string[];
}

function dist(
	a: { x: number; y: number; z: number },
	b: { x: number; y: number; z: number },
): number {
	return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function createAdvisor(data: SubData): Advisor {
	let D = data;
	let SECTOR: Record<number, Sector> = {};
	let SEA: Record<number, Sea> = {};
	let PART: Record<number, Part> = {};
	let CLASS: Record<
		number,
		{ id: number; name: string; rank: number; parts: number[] }
	> = {};
	let RANK: Record<number, Rank> = {};
	let CHILD: Record<number, number[]> = {};
	let TOP = 145;

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

	function stats(rank: number, parts: unknown): Stats | null {
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

	function evalRoute(
		route: number[] | null | undefined,
		st: Stats | null,
	): EvalRoute | null {
		if (!route?.length || route.length > D.formula.maxSectors || !st)
			return null;
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

	function rankAfter(
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

	function afterVoyage(
		sub: Sub,
		route: number[] | null | undefined,
	): { exp: number; rank: number; into: number } | null {
		if (!sub || !RANK[sub.rank as number] || !route?.length) return null;
		const exp = route.reduce(
			(t, id) => t + (SECTOR[id] ? SECTOR[id].exp : 0),
			0,
		);
		const r = rankAfter(sub.rank as number, sub.expIntoRank || 0, exp);
		return { exp, rank: r.rank, into: r.into };
	}

	function children(id: number): number[] {
		return CHILD[id] || [];
	}

	function chainTo(target: number, disc: Set<number>): number[] | null {
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

	interface Cand {
		route: number[];
		ev: EvalRoute;
		score: number;
		label?: string;
	}

	function search(
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

	function hours(ev: EvalRoute): number {
		return ev.seconds / 3600;
	}

	function name(id: number): string {
		const s = SECTOR[id];
		return s ? `${SEA[s.sea].name} ${s.letter}` : "?";
	}

	function routeText(route: number[] | null | undefined): string {
		return route?.length
			? SEA[SECTOR[route[0]].sea].name +
					": " +
					route.map((id) => SECTOR[id].letter).join(" → ")
			: "";
	}

	const STEPS = [
		"Unlock all four submarines",
		"Discover every sector",
		"Farm gil",
	];

	function advise(input: AdviseInput): Advice {
		const sub = input.sub;
		const fc = input.fc;
		const st = stats(sub.rank as number, sub.parts);
		if (!st)
			return {
				blocked:
					"Enter this sub's rank and its four parts in Setup, so its voyages can be worked out.",
			};
		const disc = new Set(fc.discovered || []);
		const pending = new Set(input.pending || []);
		const pool = D.sectors.filter(
			(s) => disc.has(s.id) && s.rank <= (sub.rank as number),
		);
		const undiscovered = D.sectors.filter((s) => !disc.has(s.id));
		const newOf = (route: number[]) => {
			let n = 0;
			const seen: Record<number, number> = {};
			route.forEach((id) => {
				if (pending.has(id)) return;
				children(id).forEach((c) => {
					if (!disc.has(c) && !seen[c]) {
						seen[c] = 1;
						n++;
					}
				});
			});
			return n;
		};
		const pack = (cands: Cand[], why: (x: Cand) => string) => {
			return {
				plan: Object.assign({ why: why(cands[0]) }, cands[0]),
				alts: cands.slice(1, 3).map((x) => Object.assign({ why: why(x) }, x)),
			};
		};
		const level = (towards: string | null) => {
			const c = search(pool, st, (_r, ev) => ev.exp / hours(ev));
			if (!c.length) return null;
			return pack(
				c,
				(x) =>
					"Most experience per hour within reach (at least " +
					Math.round(x.ev.exp / hours(x.ev)).toLocaleString("en") +
					" an hour)" +
					(towards ? `, ${towards}` : "") +
					".",
			);
		};
		let out: Advice;
		const slots = fc.unlockedSlots || 1;
		if (slots < 4) {
			const target = (
				D.subSlots.find((u) => u.slot === slots + 1) ||
				({} as { sector?: number })
			).sector;
			const head: Advice = { step: 1, stepName: STEPS[0] };
			if ((input.slotsFilled || 0) < slots)
				head.note =
					"A new slot only shows once slot " +
					slots +
					" holds a submarine: register one there in the game when you can.";
			const chain = target ? chainTo(target, disc) : null;
			const visit = disc.has(target as number)
				? target
				: chain
					? chain[0]
					: null;
			if (visit && SECTOR[visit].rank <= (sub.rank as number)) {
				const c1 = search(
					pool,
					st,
					(r, ev) => -ev.seconds + newOf(r) * 60,
					visit,
				);
				if (c1.length) {
					out = Object.assign(
						head,
						pack(c1, (_x) => {
							return visit === target
								? "Surveying " +
										name(target as number) +
										" can grant slot " +
										(slots + 1) +
										" (not certain on every visit). This is the quickest route that includes it."
								: "On the way to " +
										name(target as number) +
										", which grants slot " +
										(slots + 1) +
										": surveying " +
										name(visit) +
										" can reveal " +
										name(chain?.[1] as number) +
										". Quickest route that includes it.";
						}),
					);
					out.goal = `slot ${slots + 1}`;
					return out;
				}
			}
			const why = visit
				? SECTOR[visit].rank > (sub.rank as number)
					? "levelling to rank " +
						SECTOR[visit].rank +
						" for " +
						name(visit) +
						" (step 1: slot " +
						(slots + 1) +
						")"
					: "building range for " +
						name(visit) +
						" (step 1: slot " +
						(slots + 1) +
						"); rank raises range"
				: null;
			const l1 = level(why);
			if (l1) {
				out = Object.assign(head, l1);
				out.goal = `slot ${slots + 1}`;
				return out;
			}
		}
		if (undiscovered.length) {
			const c2 = search(
				pool,
				st,
				(r, ev) => newOf(r) * 1e7 - ev.seconds,
			).filter((x) => newOf(x.route) > 0);
			const head2: Advice = {
				step: 2,
				stepName: STEPS[1],
				goal: `${undiscovered.length} sectors still to find`,
			};
			if (c2.length)
				return Object.assign(
					head2,
					pack(c2, (x) => {
						const n = newOf(x.route);
						return (
							"Can reveal " +
							n +
							" new sector" +
							(n === 1 ? "" : "s") +
							" (" +
							x.route
								.filter((id) => children(id).some((c) => !disc.has(c)))
								.map(name)
								.join(", ") +
							" lead to them); quickest of the routes that reveal the most."
						);
					}),
				);
			const parents = D.sectors.filter(
				(s) =>
					disc.has(s.id) &&
					!pending.has(s.id) &&
					children(s.id).some((c) => !disc.has(c)),
			);
			const need = parents.length
				? parents.reduce((m, s) => Math.min(m, s.rank), 999)
				: null;
			const allPending =
				!parents.length &&
				D.sectors.some(
					(s) => disc.has(s.id) && children(s.id).some((c) => !disc.has(c)),
				);
			const l2 = level(
				need && need > (sub.rank as number)
					? `levelling to rank ${need} for the next discovery (step 2)`
					: allPending
						? "while your other subs' voyages reveal the next sectors (step 2)"
						: "building range for the next discovery (step 2); rank raises range",
			);
			if (l2) return Object.assign(head2, l2);
		}
		const head3: Advice = { step: 3, stepName: STEPS[2], goal: "gil" };
		const stars = (r: number[]) => r.reduce((t, id) => t + SECTOR[id].stars, 0);
		const named = (D.commonRoutes || [])
			.filter((cr) =>
				cr.route.every(
					(id) => disc.has(id) && SECTOR[id].rank <= (sub.rank as number),
				),
			)
			.map((cr) => {
				const ev = evalRoute(cr.route, st);
				return ev?.reachable
					? {
							route: cr.route,
							ev,
							label: cr.name,
							score: stars(cr.route) / hours(ev),
						}
					: null;
			})
			.filter(Boolean)
			.sort((a, b) => (b as Cand).score - (a as Cand).score) as Cand[];
		const c3 = named.length
			? named
			: search(pool, st, (r, ev) => stars(r) / hours(ev));
		if (!c3.length)
			return {
				step: 3,
				stepName: STEPS[2],
				blocked: "No discovered sector is within this build's range.",
			};
		out = Object.assign(
			head3,
			pack(c3, (x) => {
				return (
					(x.label
						? `A community gil route ("${x.label}", Submarine Tracker)`
						: "The route with the most sector stars per hour (game data)") +
					". Real gil per hour comes from your own logged returns once logging arrives; until then the stars are only a guide."
				);
			}),
		);
		out.parts = partTip(sub, st, out.plan?.route as number[]);
		return out;
	}

	function partTip(sub: Sub, st: Stats, route: number[]): Advice["parts"] {
		const base = evalRoute(route, st);
		let best: {
			slot: number;
			from: number | null | undefined;
			to: number;
			gain: number;
			why?: string;
		} | null = null;
		for (let i = 0; i < 4; i++) {
			D.parts.forEach((p) => {
				if (
					p.slot !== i ||
					p.id === (sub.parts as (number | null)[])[i] ||
					CLASS[p.class].rank > (sub.rank as number)
				)
					return;
				const parts = (sub.parts as (number | null)[]).slice();
				parts[i] = p.id;
				const ev = evalRoute(route, stats(sub.rank as number, parts));
				if (!ev?.reachable) return;
				const gain = (base as EvalRoute).seconds - ev.seconds;
				if (gain >= 60 && (!best || gain > best.gain))
					best = {
						slot: i,
						from: (sub.parts as (number | null)[])[i],
						to: p.id,
						gain,
					};
			});
		}
		const b = best as {
			slot: number;
			from: number | null | undefined;
			to: number;
			gain: number;
			why?: string;
		} | null;
		if (!b) return null;
		b.why =
			"Swapping the " +
			SLOT_NAMES[b.slot] +
			" for " +
			PART[b.to].name +
			" would bring this route back " +
			Math.round(b.gain / 60) +
			" min sooner (calculated). Only if you already have the part or plan to craft it.";
		return b as {
			slot: number;
			from: number | null | undefined;
			to: number;
			gain: number;
			why: string;
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
	init(data);
	return api;
}
