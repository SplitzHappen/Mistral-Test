import type { SubData } from "../data.ts";
import { createAdvisor } from "../voyage.ts";

const advisor = createAdvisor({
	sectors: [],
	seas: [],
	parts: [],
	classes: [],
	ranks: [
		{
			rank: 1,
			expToNext: 1,
			capacity: 0,
			surveillanceBonus: 0,
			retrievalBonus: 0,
			speedBonus: 0,
			rangeBonus: 0,
			favorBonus: 0,
		},
	],
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

export const ADVISOR: Record<string, any> = {};
ADVISOR.init = (d: SubData) => advisor.init(d);
ADVISOR.LABEL = advisor.LABEL;
ADVISOR.stats = advisor.stats;
ADVISOR.evalRoute = advisor.evalRoute;
ADVISOR.rankAfter = advisor.rankAfter;
ADVISOR.afterVoyage = advisor.afterVoyage;
ADVISOR.children = advisor.children;
ADVISOR.sectorName = advisor.sectorName;
ADVISOR.routeText = advisor.routeText;
ADVISOR.STEPS = advisor.STEPS;
ADVISOR.advise = advisor.advise;
