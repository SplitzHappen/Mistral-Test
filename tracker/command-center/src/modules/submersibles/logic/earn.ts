import type { Section, SubData, Trip } from "./data.ts";

export const TAX = 0.05;
export const ARCHIVE_KIND = "eveniunt-submersibles-archive";

export interface Earn {
	init(d: SubData): Earn;
	name(id: number | string): string;
	merchant(id: number | string): number | null;
	tradable(id: number | string): boolean;
	routeLoot(
		route: number[] | null | undefined,
	): { sector: number; items: number[] }[];
	history(
		trips: Record<string, Trip> | null | undefined,
		route: number[] | null | undefined,
	): { count: Record<number, number>; last: [number, number][] | null };
	unitValue(
		id: number | string,
		prices: Record<string, number> | null | undefined,
	): { each: number | null; how: string | null };
	tripValue(
		trip: Trip,
		prices: Record<string, number> | null | undefined,
	): { gil: number; unknown: number[]; logged: boolean };
	totals(sec: Section, prices: Record<string, number>, now: number): Totals;
	csv(
		sec: Section,
		prices: Record<string, number>,
		fmtRoute?: (r: number[] | undefined) => string,
	): string;
	archive(sec: Section, before: number, now: number): ArchiveFile;
	restore(sec: Section, file: unknown): number;
	TAX: number;
	ARCHIVE_KIND: string;
}

export interface Totals {
	day: number;
	week: number;
	month: number;
	all: number;
	trips: number;
	logged: number;
	unknown: Record<string, number>;
	byFc: Record<string, number>;
	byRoute: Record<
		string,
		{
			route: number[];
			gil: number;
			hours: number;
			trips: number;
			perHour?: number;
		}
	>;
	byItem: Record<string, { qty: number; gil: number; how: string | null }>;
}

export interface ArchiveFile {
	kind: string;
	version: number;
	before: number;
	made: number;
	fcs: Section["fcs"];
	subs: Section["subs"];
	trips: Record<string, Trip>;
	count: number;
}

function startOf(kind: string, now: number): number {
	const d = new Date(now);
	if (kind === "day")
		return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	if (kind === "week") {
		const w = new Date(d.getFullYear(), d.getMonth(), d.getDate());
		w.setDate(w.getDate() - ((w.getDay() + 6) % 7));
		return w.getTime();
	}
	if (kind === "month")
		return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
	return 0;
}

export function createEarn(data: SubData): Earn {
	let D = data;

	function init(d: SubData): Earn {
		D = d;
		return api;
	}

	function name(id: number | string): string {
		return D?.items[String(id)] || `Item ${id}`;
	}

	function merchant(id: number | string): number | null {
		const x = D?.itemInfo?.[String(id)];
		return x ? x[0] : null;
	}

	function tradable(id: number | string): boolean {
		const x = D?.itemInfo?.[String(id)];
		return x ? x[1] === 1 : true;
	}

	function routeLoot(
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

	function history(
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
			last: lt?.items
				? lt.items.map((x) => x.slice() as [number, number])
				: null,
		};
	}

	function unitValue(
		id: number | string,
		prices: Record<string, number> | null | undefined,
	): { each: number | null; how: string | null } {
		const m = merchant(id) || 0;
		const p = prices?.[String(id)];
		const mk = tradable(id) && p ? Math.floor(p * (1 - TAX)) : 0;
		if (!m && !mk) return { each: null, how: null };
		return mk > m ? { each: mk, how: "market" } : { each: m, how: "merchant" };
	}

	function tripValue(
		trip: Trip,
		prices: Record<string, number> | null | undefined,
	): { gil: number; unknown: number[]; logged: boolean } {
		let gil = 0;
		const unknown: number[] = [];
		(trip.items || []).forEach((x) => {
			const v = unitValue(x[0], prices);
			if (v.each == null) unknown.push(x[0]);
			else gil += v.each * x[1];
		});
		return { gil, unknown, logged: !!trip.items?.length };
	}

	function totals(
		sec: Section,
		prices: Record<string, number>,
		now: number,
	): Totals {
		const out: Totals = {
			day: 0,
			week: 0,
			month: 0,
			all: 0,
			trips: 0,
			logged: 0,
			unknown: {},
			byFc: {},
			byRoute: {},
			byItem: {},
		};
		const lim = {
			day: startOf("day", now),
			week: startOf("week", now),
			month: startOf("month", now),
		};
		Object.keys(sec.trips || {}).forEach((k) => {
			const t = sec.trips[k];
			const v = tripValue(t, prices);
			const when = t.back || t.t;
			const sub = sec.subs?.[t.s];
			const fcId = sub ? sub.fcId : "";
			out.trips++;
			if (!v.logged) return;
			out.logged++;
			v.unknown.forEach((id) => {
				out.unknown[id] = 1;
			});
			out.all += v.gil;
			(["day", "week", "month"] as const).forEach((p) => {
				if (when >= lim[p]) out[p] += v.gil;
			});
			out.byFc[fcId] = (out.byFc[fcId] || 0) + v.gil;
			const rk = (t.r || []).join(",");
			if (rk && t.back && t.t && t.back > t.t) {
				const r = (out.byRoute[rk] = out.byRoute[rk] || {
					route: t.r?.slice(),
					gil: 0,
					hours: 0,
					trips: 0,
				});
				r.gil += v.gil;
				r.hours += (t.back - t.t) / 3600000;
				r.trips++;
			}
			(t.items || []).forEach((x) => {
				const u = unitValue(x[0], prices);
				const b = (out.byItem[x[0]] = out.byItem[x[0]] || {
					qty: 0,
					gil: 0,
					how: u.how,
				});
				b.qty += x[1];
				b.gil += (u.each || 0) * x[1];
			});
		});
		Object.keys(out.byRoute).forEach((k) => {
			const r = out.byRoute[k];
			r.perHour = r.hours ? r.gil / r.hours : 0;
		});
		return out;
	}

	function csv(
		sec: Section,
		prices: Record<string, number>,
		fmtRoute?: (r: number[] | undefined) => string,
	): string {
		const q = (v: unknown) => {
			const s = String(v == null ? "" : v);
			return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
		};
		const lines = [
			[
				"sent",
				"back",
				"free company",
				"submarine",
				"route",
				"item",
				"quantity",
				"value each (gil)",
				"priced by",
				"rank after",
			].join(","),
		];
		Object.keys(sec.trips || {})
			.map((k) => sec.trips[k])
			.sort((a, b) => a.t - b.t)
			.forEach((t) => {
				const sub = sec.subs?.[t.s] || ({} as { fcId?: string; name?: string });
				const fc = sec.fcs?.[sub.fcId as string] || ({} as { name?: string });
				const base: unknown[] = [
					new Date(t.t).toISOString(),
					t.back ? new Date(t.back).toISOString() : "",
					fc.name || "",
					sub.name || t.s,
					fmtRoute ? fmtRoute(t.r) : (t.r || []).join(" "),
				];
				if (!t.items?.length) {
					lines.push(
						base
							.concat(["", "", "", "", t.rankAfter || ""])
							.map(q)
							.join(","),
					);
					return;
				}
				t.items.forEach((x) => {
					const u = unitValue(x[0], prices);
					lines.push(
						base
							.concat([
								name(x[0]),
								x[1],
								u.each == null ? "" : u.each,
								u.how || "unknown",
								t.rankAfter || "",
							])
							.map(q)
							.join(","),
					);
				});
			});
		return `${lines.join("\r\n")}\r\n`;
	}

	function archive(sec: Section, before: number, now: number): ArchiveFile {
		const out: Record<string, Trip> = {};
		Object.keys(sec.trips || {}).forEach((k) => {
			const t = sec.trips[k];
			if ((t.back || t.t) < before) out[k] = t;
		});
		return {
			kind: ARCHIVE_KIND,
			version: 1,
			before,
			made: now,
			fcs: sec.fcs || {},
			subs: sec.subs || {},
			trips: out,
			count: Object.keys(out).length,
		};
	}

	function restore(sec: Section, file: unknown): number {
		const f = file as ArchiveFile;
		if (
			!f ||
			f.kind !== ARCHIVE_KIND ||
			!f.trips ||
			typeof f.trips !== "object"
		)
			throw new Error("This is not a Submersibles archive file.");
		let n = 0;
		sec.trips = sec.trips || {};
		Object.keys(f.trips).forEach((k) => {
			if (!sec.trips[k]) {
				sec.trips[k] = f.trips[k];
				n++;
			}
		});
		return n;
	}

	const api: Earn = {
		TAX,
		ARCHIVE_KIND,
		init,
		name,
		merchant,
		tradable,
		routeLoot,
		history,
		unitValue,
		tripValue,
		totals,
		csv,
		archive,
		restore,
	};
	init(data);
	return api;
}
