import type { Section, Trip } from "../data.ts";
import { ARCHIVE_KIND } from "../earn.ts";
import type { ArchiveFile } from "./types.ts";

export function archive(
	sec: Section,
	before: number,
	now: number,
): ArchiveFile {
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

export function restore(sec: Section, file: unknown): number {
	const f = file as ArchiveFile;
	if (!f || f.kind !== ARCHIVE_KIND || !f.trips || typeof f.trips !== "object")
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
