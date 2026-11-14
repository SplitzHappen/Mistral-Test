export interface Sector {
	id: number;
	sea: number;
	letter: string;
	name: string;
	rank: number;
	tanks: number;
	survey: number;
	exp: number;
	surveyDistance: number;
	stars: number;
	x: number;
	y: number;
	z: number;
}

export interface Sea {
	id: number;
	name: string;
	image: number;
	start: number;
	x: number;
	y: number;
	z: number;
	sectors: number;
}

export interface Part {
	id: number;
	class: number;
	slot: number;
	rank: number;
	surveillance: number;
	retrieval: number;
	speed: number;
	range: number;
	favor: number;
	components: number;
	repairMaterials: number;
	item: number;
	name: string;
	slotName: string;
}

export interface Class {
	id: number;
	name: string;
	rank: number;
	parts: number[];
}

export interface Rank {
	rank: number;
	expToNext: number;
	capacity: number;
	surveillanceBonus: number;
	retrievalBonus: number;
	speedBonus: number;
	rangeBonus: number;
	favorBonus: number;
}

export interface Formula {
	label: string;
	fixedSeconds: number;
	distanceFactor: number;
	travelFactor: number;
	surveyFactor: number;
	minSpeed: number;
	maxSectors: number;
	steps: string[];
	experienceNote?: string;
}

export interface SubData {
	sectors: Sector[];
	seas: Sea[];
	parts: Part[];
	classes: Class[];
	ranks: Rank[];
	unlocks: Record<string, { by?: number; start?: number }>;
	subSlots: { slot: number; sector: number }[];
	items: Record<string, string>;
	itemInfo: Record<string, [number, number]>;
	loot: Record<string, number[]>;
	formula: Formula;
	commonRoutes?: { name: string; route: number[] }[];
	[key: string]: unknown;
}

export interface Sub {
	fcId: string;
	slot: number;
	name?: string;
	rank?: number;
	expIntoRank?: number;
	parts?: (number | null)[];
	voyage?: Voyage | null;
	[key: string]: unknown;
}

export interface Voyage {
	sentAt?: number;
	route?: number[];
	returnAt: number;
	calcAt?: number;
	gameSaid?: string;
	[key: string]: unknown;
}

export interface Fc {
	name?: string;
	unlockedSlots?: number;
	discovered?: number[];
	order?: number;
	world?: string;
	[key: string]: unknown;
}

export interface Trip {
	s: string;
	t: number;
	r?: number[];
	back?: number;
	items?: [number, number][];
	newSectors?: number[];
	calc?: number;
	said?: string;
	rankCalc?: number;
	rankAfter?: number;
	[key: string]: unknown;
}

export interface Section {
	fcs: Record<string, Fc>;
	subs: Record<string, Sub>;
	trips: Record<string, Trip>;
	settings: { prefs?: Record<string, unknown>; [key: string]: unknown };
	[key: string]: unknown;
}

export interface Loot {
	items: [number, number][];
	newSectors: number[];
	slot: boolean;
}
