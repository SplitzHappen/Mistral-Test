import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import * as earnMod from "../../src/modules/submersibles/logic/earn.ts";
import * as page from "../../src/modules/submersibles/logic/page.ts";
import { createAdvisor } from "../../src/modules/submersibles/logic/voyage.ts";
import { CC, extractSubsFns, legacyApi, loadData } from "./ref.ts";

// Control script: one planted change per logic module, applied to a TEMPORARY COPY only (same directory, so
// its relative imports resolve; removed in finally — the tree stays clean), and each must be CAUGHT against
// the frozen legacy reference.

const legacy = legacyApi();
const D = loadData();
legacy.ADVISOR.init(D);
legacy.EARN.init(D);
const _adv = createAdvisor(D);
const _ea = earnMod.createEarn(D);
const _pg = page.createPageData(D);
const NOW0 = 1767225600000;

const FAULTS: Record<
	string,
	{ from: string; to: string; probe: (N: any) => boolean }
> = {
	"time.ts": {
		from: "const m = up ? Math.ceil(ms / MIN) : Math.floor(ms / MIN);",
		to: "const m = up ? Math.floor(ms / MIN) : Math.floor(ms / MIN);",
		probe: (N) => N.fmtDur(61000, true) === legacy.FLEET.fmtDur(61000, true),
	},
	"calendar.ts": {
		from: "if (len + n > (out.length ? 74 : 75)) {",
		to: "if (len + n > (out.length ? 75 : 75)) {",
		probe: (N) => {
			const o = {
				title: `T${"x".repeat(300)}`,
				at: NOW0,
				uid: "u",
				note: "",
				now: NOW0,
			};
			return N.ics(o) === legacy.FLEET.ics(o);
		},
	},
	"voyage.ts": {
		from: "range += Math.floor(l * F.distanceFactor) + s.surveyDistance;",
		to: "range += Math.round(l * F.distanceFactor) + s.surveyDistance;",
		probe: (N) => {
			const a2 = N.createAdvisor(D);
			const st = a2.stats(
				145,
				[1, 2, 3, 4].map((i) => D.parts[i].id),
			);
			const sea = D.seas[0];
			const route = D.sectors
				.filter((s: any) => s.sea === sea.id)
				.slice(0, 3)
				.map((s: any) => s.id);
			return (
				JSON.stringify(a2.evalRoute(route, st)) ===
				JSON.stringify(legacy.ADVISOR.evalRoute(route, st))
			);
		},
	},
	"alerts.ts": {
		from: "export const STRAGGLER = 30 * MIN;",
		to: "export const STRAGGLER = 31 * MIN;",
		probe: (N) => {
			const now = NOW0;
			const sec: any = {
				fcs: { fc0: { name: "A", unlockedSlots: 4 } },
				subs: {
					s0: { fcId: "fc0", slot: 1, voyage: { returnAt: now + 3600000 } },
					s1: {
						fcId: "fc0",
						slot: 2,
						voyage: { returnAt: now + 3600000 + 30 * 60000 + 30000 },
					},
				},
				trips: {},
				settings: {},
			};
			const prefs = { grouping: "fc" };
			const stageOf = () => "gil";
			return (
				JSON.stringify(N.alerts(sec, prefs, stageOf, now)) ===
				JSON.stringify(legacy.PUSH.alerts(sec, prefs, stageOf, now))
			);
		},
	},
	"earn.ts": {
		from: "const mk = tradable(id) && p ? Math.floor(p * (1 - TAX)) : 0;",
		to: "const mk = tradable(id) && p ? Math.round(p * (1 - TAX)) : 0;",
		probe: (N) => {
			const e2 = N.createEarn(D);
			const id = Number(
				Object.keys(D.items).find(
					(k) =>
						legacy.EARN.unitValue(Number(k), { [k]: 1001 }).how === "market",
				),
			);
			const prices = { [id]: 1001 };
			return (
				JSON.stringify(e2.unitValue(id, prices)) ===
				JSON.stringify(legacy.EARN.unitValue(id, prices))
			);
		},
	},
	"page.ts": {
		from: ".sort((a, b) => a - b);",
		to: ".sort((a, b) => b - a);",
		probe: (N) => {
			const mkSec = () => ({
				fcs: { fc0: { discovered: [5] } },
				subs: {},
				trips: {},
				settings: {},
			});
			const sec: any = mkSec();
			const loot = { items: [], newSectors: [9, 2, 7], slot: false };
			N.applyFinds(sec, "fc0", JSON.parse(JSON.stringify(loot)));
			const secL: any = mkSec();
			const scope: Record<string, any> = { S: secL };
			extractSubsFns(["applyFinds"], scope).applyFinds(
				"fc0",
				JSON.parse(JSON.stringify(loot)),
			);
			return JSON.stringify(sec) === JSON.stringify(secL);
		},
	},
};

test("control: one planted fault per logic module, on a temp copy only, each caught", async () => {
	const LOGIC = join(CC, "src", "modules", "submersibles", "logic");
	for (const f of Object.keys(FAULTS)) {
		const { from, to, probe } = FAULTS[f];
		const srcPath = join(LOGIC, f);
		const src = readFileSync(srcPath, "utf8");
		assert.ok(src.includes(from), `${f}: fault anchor not found`);
		const tmpPath = join(LOGIC, f.replace(/\.ts$/, ".controltmp.ts"));
		writeFileSync(tmpPath, src.replace(from, to));
		try {
			const N = await import(
				`../../src/modules/submersibles/logic/${f.replace(/\.ts$/, ".controltmp.ts")}`
			);
			assert.ok(!probe(N), `${f}: fault NOT caught`);
			console.log(`control: fault in ${f} caught`);
		} finally {
			rmSync(tmpPath, { force: true });
		}
	}
	const leftover = Object.keys(FAULTS)
		.map((f) => f.replace(/\.ts$/, ".controltmp.ts"))
		.filter((n) => {
			try {
				readFileSync(join(LOGIC, n));
				return true;
			} catch {
				return false;
			}
		});
	assert.deepEqual(leftover, []);
});
