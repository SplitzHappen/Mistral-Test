import type { Fc, Section, Sub } from "./data.ts";

export const MIN = 60000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export function parseDuration(text: unknown): number | null {
	const s = String(text == null ? "" : text)
		.trim()
		.toLowerCase();
	if (!s) return null;
	const m = /^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/.exec(s);
	if (m) return (+m[1] * 3600 + +m[2] * 60 + (m[3] ? +m[3] : 0)) * 1000;
	const re =
		/(\d+(?:[.,]\d+)?)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?![a-z])/g;
	let total = 0;
	let used = "";
	let hit: RegExpExecArray | null;
	while ((hit = re.exec(s))) {
		const n = Number.parseFloat(hit[1].replace(",", "."));
		const u = hit[2][0];
		total += n * (u === "d" ? DAY : u === "h" ? HOUR : u === "m" ? MIN : 1000);
		used += hit[0];
	}
	if (!used || s.replace(/[\s,]+/g, "") !== used.replace(/[\s,]+/g, ""))
		return null;
	return total > 0 && total <= 30 * DAY ? Math.round(total) : null;
}

export function parseBackAt(value: unknown): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(
		String(value || "").trim(),
	);
	if (!m) return null;
	const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
	return Number.isFinite(t) ? t : null;
}

export function localInput(t: number): string {
	const d = new Date(t);
	const p = (n: number) => String(n).padStart(2, "0");
	return (
		d.getFullYear() +
		"-" +
		p(d.getMonth() + 1) +
		"-" +
		p(d.getDate()) +
		"T" +
		p(d.getHours()) +
		":" +
		p(d.getMinutes())
	);
}

export function status(
	sub: Sub | null | undefined,
	fc: Fc | null | undefined,
	now: number,
): string {
	if (!sub) return "locked";
	const slots = fc?.unlockedSlots ? fc.unlockedSlots : 1;
	if (sub.slot > slots) return "locked";
	if (!sub.voyage) return "idle";
	return sub.voyage.returnAt > now ? "out" : "back";
}

export const LABEL: Record<string, string> = {
	back: "Back",
	out: "Out",
	idle: "Idle",
	locked: "Locked",
};

export function fmtDur(ms: number, up?: boolean): string {
	if (!(ms > 0)) return "now";
	const m = up ? Math.ceil(ms / MIN) : Math.floor(ms / MIN);
	if (m < 1) return "under 1 min";
	const d = Math.floor(m / 1440);
	const h = Math.floor((m % 1440) / 60);
	const mm = m % 60;
	if (d) return `${d} d${h ? ` ${h} h` : ""}${mm ? ` ${mm} min` : ""}`;
	if (h) return `${h} h${mm ? ` ${mm} min` : ""}`;
	return `${mm} min`;
}

export function fmtClock(t: number, now?: number): string {
	const d = new Date(t);
	const n = new Date(now == null ? Date.now() : now);
	const hm =
		String(d.getHours()).padStart(2, "0") +
		":" +
		String(d.getMinutes()).padStart(2, "0");
	const day = (x: Date) =>
		new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
	const diff = Math.round((day(d) - day(n)) / DAY);
	if (diff === 0) return hm;
	if (diff === 1) return `tomorrow ${hm}`;
	if (diff === -1) return `yesterday ${hm}`;
	const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
	if (Math.abs(diff) < 7) return `${wd} ${hm}`;
	return (
		wd +
		" " +
		d.getDate() +
		" " +
		[
			"Jan",
			"Feb",
			"Mar",
			"Apr",
			"May",
			"Jun",
			"Jul",
			"Aug",
			"Sep",
			"Oct",
			"Nov",
			"Dec",
		][d.getMonth()] +
		" " +
		hm
	);
}

export interface FleetEntry {
	id: string;
	sub: Sub;
	fc: Fc;
	fcId: string;
	status: string;
}

export function fleet(
	sec: Section | null | undefined,
	now: number,
): FleetEntry[] {
	const out: FleetEntry[] = [];
	if (!sec) return out;
	Object.keys(sec.subs || {}).forEach((id) => {
		const s = (sec.subs as Record<string, Sub>)[id];
		const fc = sec.fcs?.[s.fcId];
		if (!fc) return;
		out.push({ id, sub: s, fc, fcId: s.fcId, status: status(s, fc, now) });
	});
	return out;
}

export function summary(
	sec: Section | null | undefined,
	now: number,
): { next: FleetEntry | null; back: number; total: number } {
	const all = fleet(sec, now);
	let next: FleetEntry | null = null;
	let back = 0;
	all.forEach((x) => {
		if (x.status === "back") back++;
		if (
			x.status === "out" &&
			(!next ||
				(x.sub.voyage as { returnAt: number }).returnAt <
					(next.sub.voyage as { returnAt: number }).returnAt)
		)
			next = x;
	});
	return { next, back, total: all.filter((x) => x.status !== "locked").length };
}

export function subLabel(x: { fc: Fc; sub: Sub }): string {
	return (
		(x.fc.name || "Unnamed free company") +
		" · " +
		(x.sub.name || `Sub ${x.sub.slot}`)
	);
}

export type IdMaker = (prefix: string) => string;

export function newId(prefix: string, random: () => number): string {
	let s = "";
	while (s.length < 8) s += random().toString(36).slice(2);
	return prefix + s.slice(0, 8);
}

export function tripId(subId: string, sentAt: number): string {
	return `${subId}-${Math.round(sentAt)}`;
}
