import type { Sub } from "../data.ts";
import { CLASS, D, evalRoute, PART, SECTOR, stats } from "../voyage.ts";
import { chainTo, children, name } from "./rank.ts";
import type { Cand } from "./search.ts";
import { hours, search } from "./search.ts";
import type { Advice, AdviseInput, EvalRoute, Stats } from "./types.ts";
import { SLOT_NAMES } from "./types.ts";

export const STEPS = [
	"Unlock all four submarines",
	"Discover every sector",
	"Farm gil",
];

export function advise(input: AdviseInput): Advice {
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
		const visit = disc.has(target as number) ? target : chain ? chain[0] : null;
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
		const c2 = search(pool, st, (r, ev) => newOf(r) * 1e7 - ev.seconds).filter(
			(x) => newOf(x.route) > 0,
		);
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
