declare module "node:test" {
	export function test(name: string, fn: () => void | Promise<void>): void;
	export function describe(name: string, fn: () => void): void;
	export function it(name: string, fn: () => void | Promise<void>): void;
	export default test;
}

declare module "node:assert/strict" {
	export function equal(a: unknown, b: unknown, msg?: string): void;
	export function deepEqual(a: unknown, b: unknown, msg?: string): void;
	export function notDeepEqual(a: unknown, b: unknown, msg?: string): void;
	export function ok(v: unknown, msg?: string): void;
	export function throws(
		fn: () => unknown,
		expected?: RegExp | ((err: unknown) => boolean) | string,
		msg?: string,
	): void;
	export function match(s: string, re: RegExp, msg?: string): void;
	export function fail(msg?: string): never;
	const assert: {
		equal: typeof equal;
		deepEqual: typeof deepEqual;
		notDeepEqual: typeof notDeepEqual;
		ok: typeof ok;
		throws: typeof throws;
		match: typeof match;
		fail: typeof fail;
	};
	export default assert;
}

declare module "node:url" {
	export function fileURLToPath(url: string): string;
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

declare module "node:fs" {
	export function readFileSync(path: string, encoding: "utf8"): string;
	export function readdirSync(
		path: string,
		opts: { withFileTypes: true },
	): { name: string; isDirectory(): boolean; isFile(): boolean }[];
	export function existsSync(path: string): boolean;
	export function statSync(path: string): {
		isDirectory(): boolean;
		isFile(): boolean;
	};
}

declare module "node:path" {
	export function join(...parts: string[]): string;
	export function resolve(...parts: string[]): string;
	export function relative(from: string, to: string): string;
	export function dirname(p: string): string;
	export const sep: string;
}

declare module "node:process" {
	export function cwd(): string;
	const process: { cwd(): string; env: Record<string, string | undefined> };
	export default process;
}
