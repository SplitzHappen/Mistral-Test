declare module "node:test" {
	export function test(name: string, fn: () => void | Promise<void>): void;
	export function describe(name: string, fn: () => void): void;
	export function it(name: string, fn: () => void | Promise<void>): void;
	export default test;
}

declare module "node:assert/strict" {
	export function equal(a: unknown, b: unknown, msg?: string): void;
	export function deepEqual(a: unknown, b: unknown, msg?: string): void;
	export function ok(v: unknown, msg?: string): void;
	export function throws(fn: () => void, msg?: string): void;
	export function match(s: string, re: RegExp, msg?: string): void;
	const assert: {
		equal: typeof equal;
		deepEqual: typeof deepEqual;
		ok: typeof ok;
		throws: typeof throws;
		match: typeof match;
	};
	export default assert;
}

declare module "node:crypto" {
	export function createHash(algorithm: string): {
		update(data: string): unknown;
		digest(encoding: "hex"): string;
	};
	export function randomBytes(size: number): {
		toString(encoding: "hex"): string;
	};
}
