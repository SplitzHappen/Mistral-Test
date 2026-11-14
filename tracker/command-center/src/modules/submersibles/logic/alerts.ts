import type { Fc, Section, Sub } from "./data.ts";

export const MIN = 60000;
export const STRAGGLER = 30 * MIN;

export const GROUPINGS: Record<string, string> = {
	auto: "Automatic",
	sub: "Per submarine",
	fc: "Per free company",
	fleet: "Whole fleet",
};

export interface QuietHours {
	from: number;
	to: number;
}

export interface Prefs {
	grouping?: string;
	night?: string;
	quietHours?: QuietHours;
	[key: string]: unknown;
}

export type StageOf = (fcId: string) => string;

function subName(s: Sub): string {
	return s.name || `Sub ${s.slot}`;
}

function fcName(fc: Fc): string {
	return fc.name || "Free company";
}

export function inQuiet(t: number, q: QuietHours): boolean {
	const d = new Date(t);
	const m = d.getHours() * 60 + d.getMinutes();
	return q.from === q.to
		? false
		: q.from < q.to
			? m >= q.from && m < q.to
			: m >= q.from || m < q.to;
}

export function quietEnd(t: number, q: QuietHours): number {
	const d = new Date(t);
	d.setSeconds(0, 0);
	d.setHours(Math.floor(q.to / 60), q.to % 60, 0, 0);
	if (d.getTime() <= t) d.setDate(d.getDate() + 1);
	return d.getTime();
}

export function hm(t: number): string {
	const d = new Date(t);
	return (
		String(d.getHours()).padStart(2, "0") +
		":" +
		String(d.getMinutes()).padStart(2, "0")
	);
}

export function modes(
	sec: Section,
	prefs: Prefs | null | undefined,
	stageOf: StageOf,
): Record<string, string> {
	const g = prefs?.grouping || "auto";
	const out: Record<string, string> = {};
	const ids = Object.keys(sec.fcs || {});
	const allFinal = ids.length > 0 && ids.every((id) => stageOf(id) === "final");
	ids.forEach((id) => {
		out[id] =
			g !== "auto"
				? g
				: allFinal
					? "fleet"
					: stageOf(id) === "unlock"
						? "sub"
						: "fc";
	});
	return out;
}

export interface Alert {
	id: string;
	at: number;
	title: string;
	body: string;
}

export function alerts(
	sec: Section,
	prefs: Prefs | null | undefined,
	stageOf: StageOf,
	now: number,
): Alert[] {
	const ms = modes(sec, prefs, stageOf);
	const out: Alert[] = [];
	const groups: Record<string, { id: string; s: Sub; fc: Fc; at: number }[]> =
		{};
	Object.keys(sec.subs || {}).forEach((id) => {
		const s = sec.subs[id];
		const fc = sec.fcs?.[s.fcId];
		const v = s.voyage;
		if (!fc || !v || !(v.returnAt > now) || s.slot > (fc.unlockedSlots || 1))
			return;
		const mode = ms[s.fcId];
		const key =
			mode === "sub" ? `s:${id}` : mode === "fc" ? `f:${s.fcId}` : "fleet";
		(groups[key] = groups[key] || []).push({ id, s, fc, at: v.returnAt });
	});
	Object.keys(groups).forEach((key) => {
		const g = groups[key].sort((a, b) => a.at - b.at);
		const last = g[g.length - 1].at;
		const single = (x: { id: string; s: Sub; fc: Fc; at: number }) => {
			out.push({
				id: `s:${x.id}:${x.at}`,
				at: x.at,
				title: `${fcName(x.fc)} · ${subName(x.s)} is back`,
				body: "",
			});
		};
		if (key.charAt(0) === "s") {
			single(g[0]);
			return;
		}
		const early = g.filter((x) => x.at < last - STRAGGLER);
		const rest = g.filter((x) => x.at >= last - STRAGGLER);
		early.forEach(single);
		if (rest.length === 1) {
			single(rest[0]);
			return;
		}
		const title =
			key === "fleet"
				? `Fleet back: ${rest.length} submarines`
				: `${fcName(rest[0].fc)}: ${rest.length} subs back`;
		const body =
			key === "fleet"
				? rest.map((x) => `${fcName(x.fc)} · ${subName(x.s)}`).join(", ")
				: rest.map((x) => subName(x.s)).join(", ");
		out.push({ id: `${key}:${last}`, at: last, title, body });
	});
	const q =
		prefs && prefs.night === "quiet" && prefs.quietHours
			? prefs.quietHours
			: null;
	if (q)
		out.forEach((a) => {
			if (inQuiet(a.at, q)) {
				a.body =
					(a.body ? `${a.body} · ` : "") +
					"back at " +
					hm(a.at) +
					", held for your quiet hours";
				a.at = quietEnd(a.at, q);
			}
		});
	return out.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
}
