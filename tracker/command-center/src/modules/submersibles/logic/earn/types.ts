import type { Section, SubData, Trip } from "../data.ts";

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

export function startOf(kind: string, now: number): number {
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
