import type { Section, SubData } from "../data.ts";
import * as earn from "../earn.ts";

const earnApi = earn.createEarn({
	sectors: [],
	seas: [],
	parts: [],
	classes: [],
	ranks: [],
	unlocks: {},
	subSlots: [],
	items: {},
	itemInfo: {},
	loot: {},
	formula: {
		label: "calculated",
		fixedSeconds: 0,
		distanceFactor: 0,
		travelFactor: 0,
		surveyFactor: 0,
		minSpeed: 1,
		maxSectors: 5,
		steps: [],
	},
});

const CACHE_KEY = "eveniunt-subs-prices";
export const EARN: Record<string, any> = {};
EARN.TAX = earnApi.TAX;
EARN.init = (d: SubData) => earnApi.init(d);
EARN.name = earnApi.name;
EARN.merchant = earnApi.merchant;
EARN.tradable = earnApi.tradable;
EARN.routeLoot = earnApi.routeLoot;
EARN.history = earnApi.history;
EARN.unitValue = earnApi.unitValue;
EARN.tripValue = earnApi.tripValue;
EARN.totals = earnApi.totals;
EARN.csv = earnApi.csv;
EARN.ARCHIVE_KIND = earnApi.ARCHIVE_KIND;
EARN.archive = (sec: Section, before: number) =>
	earnApi.archive(sec, before, Date.now());
EARN.restore = earnApi.restore;
EARN.cached = (scope: string) => {
	try {
		const c = JSON.parse(
			(globalThis as any).localStorage.getItem(CACHE_KEY) || "null",
		);
		return c && c.scope === scope ? c : null;
	} catch (_e) {
		return null;
	}
};
EARN.fetchPrices = (scope: string, ids: number[]) => {
	const c = EARN.cached(scope) || {
		scope,
		at: 0,
		prices: {} as Record<string, number>,
	};
	const want = ids.filter((id) => earnApi.tradable(id));
	const missing = want.filter((id) => !(id in c.prices));
	if (!missing.length && Date.now() - c.at < 3600000) return Promise.resolve(c);
	const list = Date.now() - c.at < 3600000 ? missing : want;
	const batches: number[][] = [];
	for (let i = 0; i < list.length; i += 100)
		batches.push(list.slice(i, i + 100));
	return Promise.all(
		batches.map((b) =>
			fetch(
				"https://universalis.app/api/v2/" +
					encodeURIComponent(scope) +
					"/" +
					b.join(",") +
					"?listings=0&entries=20",
			)
				.then((r: any) => (r.ok ? r.json() : null))
				.catch(() => null),
		),
	).then((res: any[]) => {
		res.forEach((j, n) => {
			if (!j) return;
			const items =
				j.items || (batches[n].length === 1 ? { [batches[n][0]]: j } : {});
			Object.keys(items).forEach((id) => {
				const x = items[id];
				const p = x && (x.averagePrice || x.currentAveragePrice);
				c.prices[id] = p ? Math.round(p) : 0;
			});
		});
		c.at = Date.now();
		try {
			(globalThis as any).localStorage.setItem(CACHE_KEY, JSON.stringify(c));
		} catch (_e) {
			/* private window */
		}
		return c;
	});
};
