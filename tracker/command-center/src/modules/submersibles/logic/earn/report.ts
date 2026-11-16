import type { Section, Trip } from "../data.ts";
import { D, unitValue } from "../earn.ts";
import { name } from "./items.ts";
import type { Totals } from "./types.ts";
import { startOf } from "./types.ts";

export function tripValue(
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

export function totals(
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

export function csv(
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
