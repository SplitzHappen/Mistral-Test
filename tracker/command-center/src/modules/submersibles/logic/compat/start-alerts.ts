import type { Section } from "../data.ts";
import * as time from "../time.ts";
import { deviceSubs, g, setDeviceSubs } from "./device.ts";
import { banner } from "./dom.ts";
import { chime, unlockSound } from "./sound.ts";

export function startAlerts(opts: {
	link: string | null;
	section: () => Section | null;
	onAlert?: (due: any[]) => void;
}): any {
	const opened = Date.now();
	const api: any = { shown: [], opened };
	const _F = g.FLEET;
	function tick() {
		const sec = opts.section();
		if (!sec) return;
		const now = Date.now();
		const all = time.fleet(sec, now);
		const due: any[] = [];
		const seen: Record<string, number> = {};
		const marks = deviceSubs().alerted || {};
		let changed = false;
		all.forEach((x) => {
			const v = x.sub.voyage;
			if (!v) return;
			seen[x.id] = 1;
			if (v.returnAt > now || marks[x.id] === v.returnAt) return;
			marks[x.id] = v.returnAt;
			changed = true;
			if (v.returnAt <= opened || x.status === "locked") return;
			due.push(x);
		});
		Object.keys(marks).forEach((id) => {
			if (!seen[id]) {
				delete marks[id];
				changed = true;
			}
		});
		if (!changed) return;
		const fresh = deviceSubs().alerted || {};
		const due2 = due.filter((x) => fresh[x.id] !== x.sub.voyage.returnAt);
		setDeviceSubs((s) => {
			s.alerted = marks;
		});
		if (!due2.length) return;
		const groups: Record<string, any[]> = {};
		due2
			.sort((a, b) => a.sub.voyage.returnAt - b.sub.voyage.returnAt)
			.forEach((x) => {
				const k = Math.floor(x.sub.voyage.returnAt / time.MIN);
				(groups[k] = groups[k] || []).push(x);
			});
		Object.keys(groups).forEach((k) => {
			api.shown.push(banner(groups[k], opts.link, now));
		});
		if (deviceSubs().sound) chime();
		if (opts.onAlert) opts.onAlert(due2);
	}
	api.tick = tick;
	tick();
	api.timer = setInterval(tick, 1000);
	if (typeof (globalThis as any).document !== "undefined") {
		(globalThis as any).document.addEventListener("visibilitychange", () => {
			if ((globalThis as any).document.visibilityState === "visible") tick();
		});
		(globalThis as any).document.addEventListener(
			"pointerdown",
			function once() {
				if (deviceSubs().sound) unlockSound();
				(globalThis as any).document.removeEventListener("pointerdown", once);
			},
		);
	}
	return api;
}
