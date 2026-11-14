import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as vm from "node:vm";

export const CC = process.cwd();
export const REF = join(CC, "tests", "reference", "submersibles");

export function legacyApi(): any {
	const ctx: Record<string, any> = vm.createContext({
		console,
		URL,
		atob,
		btoa,
		unescape,
		escape,
		encodeURIComponent,
		decodeURIComponent,
		navigator: {},
		location: { href: "http://x/submersibles/" },
		setInterval,
		clearInterval,
		setTimeout,
		clearTimeout,
	}) as Record<string, any>;
	ctx.globalThis = ctx;
	for (const f of ["fleet", "advisor", "push", "earn"]) {
		vm.runInContext(readFileSync(join(REF, `${f}.js`), "utf8"), ctx, {
			filename: `${f}.js`,
		});
	}
	return ctx;
}

export function loadData(): any {
	return JSON.parse(
		readFileSync(join(CC, "..", "data", "submarines.json"), "utf8"),
	);
}

export function extractSubsFn(name: string, scope: Record<string, any>): any {
	const src = readFileSync(join(REF, "subs.js"), "utf8");
	const marker = `\n  function ${name}(`;
	const at = src.indexOf(marker);
	if (at < 0) throw new Error(`subs.js: function ${name} not found`);
	let i = src.indexOf("{", at);
	let depth = 0;
	let end = -1;
	for (; i < src.length; i++) {
		if (src[i] === "{") depth++;
		else if (src[i] === "}") {
			depth--;
			if (depth === 0) {
				end = i + 1;
				break;
			}
		}
	}
	if (end < 0) throw new Error(`subs.js: function ${name} unterminated`);
	const fnText = src.slice(at + 1, end);
	const keys = Object.keys(scope);
	const factory = new Function(...keys, `${fnText}\n  return ${name};`) as (
		...args: any[]
	) => any;
	return factory(...keys.map((k) => scope[k]));
}

export function extractSubsFns(
	names: string[],
	scope: Record<string, any>,
): Record<string, any> {
	const src = readFileSync(join(REF, "subs.js"), "utf8");
	const parts: string[] = [];
	for (const name of names) {
		const marker = `\n  function ${name}(`;
		const at = src.indexOf(marker);
		if (at < 0) throw new Error(`subs.js: function ${name} not found`);
		let i = src.indexOf("{", at);
		let depth = 0;
		let end = -1;
		for (; i < src.length; i++) {
			if (src[i] === "{") depth++;
			else if (src[i] === "}") {
				depth--;
				if (depth === 0) {
					end = i + 1;
					break;
				}
			}
		}
		if (end < 0) throw new Error(`subs.js: function ${name} unterminated`);
		parts.push(src.slice(at + 1, end));
	}
	const keys = Object.keys(scope);
	const factory = new Function(
		...keys,
		`${parts.join("\n")}\n  return { ${names.join(", ")} };`,
	) as (...args: any[]) => any;
	return factory(...keys.map((k) => scope[k]));
}

export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
