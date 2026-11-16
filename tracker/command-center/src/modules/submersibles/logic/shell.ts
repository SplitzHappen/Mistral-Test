import type { Section } from "./data.ts";
import * as time from "./time.ts";

// Pure ports of the shell/tile and in-app alert wording that today live in src/shell.js and
// src/submersibles/fleet.js (FLEET.startAlerts and its banner helper). The manifest calls these, so
// there is exactly one implementation of each behaviour.

export function esc(s: unknown): string {
	return String(s).replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c as string
			] as string,
	);
}

// The home tile line for 'submersibles', exactly as shell.js's showSave writes it via live().
export function homeTileLine(subs: unknown, now: number): string {
	if (!subs || !Object.keys(((subs as Section).fcs || {}) as object).length)
		return "No free company yet";
	const sec = subs as Section;
	const sum = time.summary(sec, now);
	const nf = Object.keys(sec.fcs as Record<string, unknown>).length;
	return (
		(sum.back ? `<b>${sum.back} back now</b> · ` : "") +
		(sum.next
			? "next back " +
				esc(
					time.fmtClock(
						(sum.next.sub.voyage as { returnAt: number }).returnAt,
						now,
					),
				) +
				" (" +
				esc(time.subLabel(sum.next)) +
				")"
			: "none out") +
		" · " +
		nf +
		" free compan" +
		(nf === 1 ? "y" : "ies")
	);
}

// The free company name shown under a character, exactly as shell.js's fcOf finds it.
export function fcOf(subs: unknown, id: string): string {
	if (!subs) return "";
	const fcs = ((subs as Section).fcs || {}) as Record<
		string,
		{ name?: unknown; charId?: unknown }
	>;
	const k = Object.keys(fcs).find((f) => fcs[f].charId === id);
	return k ? (fcs[k].name as string) || "" : "";
}

export interface AlertDecision {
	changed: boolean;
	marks: Record<string, number>;
	due: time.FleetEntry[];
	groups: time.FleetEntry[][];
}

// The in-app alert decision, ported from FLEET.startAlerts's tick() as a pure function: now, the page's
// opened instant and the currently shown marks are parameters; the returned marks are what tick() would
// write back to the device store. Returns null when the section is null at this tick (tick returns early).
export function dueBanners(
	sec: Section | null | undefined,
	now: number,
	opened: number,
	storedMarks: Record<string, number> | null | undefined,
): AlertDecision | null {
	if (!sec) return null;
	const all = time.fleet(sec, now);
	const due: time.FleetEntry[] = [];
	const seen: Record<string, number> = {};
	const marks: Record<string, number> = { ...(storedMarks || {}) };
	let changed = false;
	all.forEach((x) => {
		const v = x.sub.voyage;
		if (!v) return;
		seen[x.id] = 1;
		if ((v.returnAt as number) > now || marks[x.id] === v.returnAt) return;
		marks[x.id] = v.returnAt as number;
		changed = true;
		if ((v.returnAt as number) <= opened || x.status === "locked") return;
		due.push(x);
	});
	Object.keys(marks).forEach((id) => {
		if (!seen[id]) {
			delete marks[id];
			changed = true;
		}
	});
	if (!changed) return { changed: false, marks, due: [], groups: [] };
	const fresh = storedMarks || {};
	const due2 = due.filter((x) => fresh[x.id] !== x.sub.voyage?.returnAt);
	const groups: Record<string, time.FleetEntry[]> = {};
	due2
		.sort(
			(a, b) =>
				(a.sub.voyage as { returnAt: number }).returnAt -
				(b.sub.voyage as { returnAt: number }).returnAt,
		)
		.forEach((x) => {
			const k = Math.floor(
				(x.sub.voyage as { returnAt: number }).returnAt / time.MIN,
			);
			(groups[k] = groups[k] || []).push(x);
		});
	return {
		changed: true,
		marks,
		due: due2,
		groups: Object.keys(groups).map((k) => groups[k]),
	};
}

// The banner text for one group, exactly as fleet.js's banner() builds it.
export function bannerText(group: time.FleetEntry[], now: number): string {
	const at = time.fmtClock(
		(group[0].sub.voyage as { returnAt: number }).returnAt,
		now,
	);
	return group.length === 1
		? `${time.subLabel(group[0])} is back (${at})`
		: `${group.length} submarines are back (${at}): ${group.map(time.subLabel).join(", ")}`;
}
