import type { Part, Rank, Sea, Sector, Sub, SubData } from "../data.ts";

export const STATS = ["surveillance", "retrieval", "speed", "range", "favor"];
export const SLOT_NAMES = ["hull", "stern", "bow", "bridge"];

export interface Stats {
	surveillance: number;
	retrieval: number;
	speed: number;
	range: number;
	favor: number;
}

export interface EvalRoute {
	range: number;
	maxRange: number;
	reachable: boolean;
	seconds: number;
	tanks: number;
	exp: number;
}

export interface AdviseInput {
	sub: Sub;
	fc: { unlockedSlots?: number; discovered?: number[]; [key: string]: unknown };
	slotsFilled?: number;
	pending?: number[];
}

export interface Advice {
	step?: number;
	stepName?: string;
	goal?: string;
	plan?: {
		route: number[];
		ev: EvalRoute;
		why: string;
		score?: number;
		label?: string;
	};
	alts?: {
		route: number[];
		ev: EvalRoute;
		why: string;
		score?: number;
		label?: string;
	}[];
	parts?: {
		slot: number;
		from: number | null | undefined;
		to: number;
		gain: number;
		why: string;
	} | null;
	note?: string;
	blocked?: string;
}

export interface Advisor {
	init(d: SubData): Advisor;
	LABEL(): string;
	stats(rank: number, parts: unknown): Stats | null;
	evalRoute(
		route: number[] | null | undefined,
		st: Stats | null,
	): EvalRoute | null;
	rankAfter(
		rank: number,
		into: number,
		exp: number,
	): { rank: number; into: number };
	afterVoyage(
		sub: Sub,
		route: number[] | null | undefined,
	): { exp: number; rank: number; into: number } | null;
	children(id: number): number[];
	sectorName(id: number): string;
	routeText(route: number[] | null | undefined): string;
	advise(input: AdviseInput): Advice;
	STEPS: string[];
}

export function dist(
	a: { x: number; y: number; z: number },
	b: { x: number; y: number; z: number },
): number {
	return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
