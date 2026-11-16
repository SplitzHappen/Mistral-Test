import type { SubData } from "./data.ts";
import { archive, restore } from "./earn/archive.ts";
import { history, merchant, name, routeLoot, tradable } from "./earn/items.ts";
import { csv, totals, tripValue } from "./earn/report.ts";
import type { Earn } from "./earn/types.ts";

export type { ArchiveFile, Earn, Totals } from "./earn/types.ts";

export const TAX = 0.05;
export const ARCHIVE_KIND = "eveniunt-submersibles-archive";

export let D: SubData;

function init(d: SubData): Earn {
	D = d;
	return api;
}

export function unitValue(
	id: number | string,
	prices: Record<string, number> | null | undefined,
): { each: number | null; how: string | null } {
	const m = merchant(id) || 0;
	const p = prices?.[String(id)];
	const mk = tradable(id) && p ? Math.floor(p * (1 - TAX)) : 0;
	if (!m && !mk) return { each: null, how: null };
	return mk > m ? { each: mk, how: "market" } : { each: m, how: "merchant" };
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
export function createEarn(data: SubData): Earn {
	init(data);
	return api;
}
