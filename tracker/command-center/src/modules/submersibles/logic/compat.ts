import * as alerts from "./alerts.ts";
import * as cal from "./calendar.ts";
import type { Section, SubData } from "./data.ts";
import * as earn from "./earn.ts";
import * as page from "./page.ts";
import * as time from "./time.ts";
import { createAdvisor } from "./voyage.ts";

const g = globalThis as Record<string, any>;

const DEVICE_KEY = "eveniunt-command-center-device";

function device(): Record<string, any> {
	try {
		const d = JSON.parse(
			(globalThis as any).localStorage.getItem(DEVICE_KEY) || "{}",
		);
		return d && typeof d === "object" ? d : {};
	} catch (_e) {
		return {};
	}
}
function deviceSubs(): Record<string, any> {
	const s = device().subs;
	return s && typeof s === "object" ? s : {};
}
function setDeviceSubs(fn: (s: Record<string, any>) => void): void {
	try {
		const d = device();
		const s = d.subs && typeof d.subs === "object" ? d.subs : {};
		fn(s);
		d.subs = s;
		(globalThis as any).localStorage.setItem(DEVICE_KEY, JSON.stringify(d));
	} catch (_e) {
		/* private window: nothing kept */
	}
}

function esc(s: unknown): string {
	return String(s).replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c as string
			] as string,
	);
}

let audio: any = null;
function chime(): void {
	try {
		const A =
			(globalThis as any).AudioContext ||
			(globalThis as any).webkitAudioContext;
		if (!A) return;
		audio = audio || new A();
		if (audio.state === "suspended") audio.resume();
		[
			[880, 0],
			[1320, 0.18],
		].forEach((n) => {
			const o = audio.createOscillator();
			const gg = audio.createGain();
			const t = audio.currentTime + n[1];
			o.frequency.value = n[0];
			o.type = "sine";
			gg.gain.setValueAtTime(0.0001, t);
			gg.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
			gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
			o.connect(gg);
			gg.connect(audio.destination);
			o.start(t);
			o.stop(t + 0.55);
		});
	} catch (_e) {
		/* no sound on this device */
	}
}
function unlockSound(): void {
	try {
		const A =
			(globalThis as any).AudioContext ||
			(globalThis as any).webkitAudioContext;
		if (A && !audio) audio = new A();
		if (audio && audio.state === "suspended") audio.resume();
	} catch (_e) {
		/* none */
	}
}

function banner(group: any[], link: string | null, now: number): string {
	const doc = (globalThis as any).document;
	let box = doc.getElementById("fleet-banners");
	if (!box) {
		box = doc.createElement("div");
		box.id = "fleet-banners";
		box.className = "fleet-banners";
		box.setAttribute("role", "status");
		box.setAttribute("aria-live", "assertive");
		doc.body.appendChild(box);
	}
	const at = time.fmtClock(group[0].sub.voyage.returnAt, now);
	const text =
		group.length === 1
			? `${time.subLabel(group[0])} is back (${at})`
			: group.length +
				" submarines are back (" +
				at +
				"): " +
				group.map(time.subLabel).join(", ");
	const b = doc.createElement("div");
	b.className = "fleet-banner";
	b.innerHTML =
		'<span class="fleet-banner-dot" aria-hidden="true"></span><span class="fleet-banner-text">' +
		esc(text) +
		"</span>" +
		(link
			? '<a class="fleet-banner-go" href="' +
				esc(link) +
				'">Open Submersibles</a>'
			: "") +
		'<button type="button" class="fleet-banner-x" aria-label="Dismiss">×</button>';
	b.querySelector(".fleet-banner-x").addEventListener("click", () => {
		b.remove();
	});
	box.appendChild(b);
	while (box.children.length > 4) box.removeChild(box.firstChild);
	return text;
}

function startAlerts(opts: {
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

function download(name: string, text: string, type?: string): void {
	const url = URL.createObjectURL(
		new Blob([text], { type: type || "text/calendar;charset=utf-8" }),
	);
	const a = (globalThis as any).document.createElement("a");
	a.href = url;
	a.download = name;
	(globalThis as any).document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => {
		URL.revokeObjectURL(url);
	}, 10000);
}

const FLEET: Record<string, any> = {};
FLEET.DEVICE_KEY = DEVICE_KEY;
FLEET.parseDuration = time.parseDuration;
FLEET.parseBackAt = time.parseBackAt;
FLEET.localInput = time.localInput;
FLEET.status = time.status;
FLEET.LABEL = time.LABEL;
FLEET.fmtDur = time.fmtDur;
FLEET.fmtClock = time.fmtClock;
FLEET.fleet = time.fleet;
FLEET.summary = time.summary;
FLEET.subLabel = time.subLabel;
FLEET.ics = (o: any) =>
	cal.ics({
		title: o.title,
		at: o.at,
		uid: o.uid,
		note: o.note,
		now: o.now == null ? Date.now() : o.now,
	});
FLEET.fileName = cal.fileName;
FLEET.download = download;
FLEET.newId = (prefix: string) => time.newId(prefix, Math.random);
FLEET.tripId = time.tripId;
FLEET.device = device;
FLEET.deviceSubs = deviceSubs;
FLEET.setDeviceSubs = setDeviceSubs;
FLEET.unlockSound = unlockSound;
FLEET.chime = chime;
FLEET.startAlerts = startAlerts;

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
const ADVISOR: Record<string, any> = {};
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

const HERE =
	(globalThis as any).document?.currentScript?.src ||
	(typeof (globalThis as any).location !== "undefined"
		? (globalThis as any).location.href
		: "http://x/submersibles/");

const PUSH: Record<string, any> = {};
PUSH.ROOT = new URL("../", HERE).href;
PUSH.GROUPINGS = alerts.GROUPINGS;
PUSH.modes = alerts.modes;
PUSH.alerts = alerts.alerts;
PUSH.config = () => {
	if (PUSH._cfg) return PUSH._cfg;
	PUSH._cfg = fetch(`${PUSH.ROOT}tracker/sync-config.json`, {
		cache: "no-cache",
	})
		.then((r: any) => (r.ok ? r.json() : null))
		.then((c: any) =>
			c && typeof c.helper === "string" && /^https?:\/\//.test(c.helper)
				? c.helper.replace(/\/$/, "")
				: null,
		)
		.catch(() => null);
	return PUSH._cfg;
};
PUSH.device = () => {
	try {
		const d = JSON.parse(
			(globalThis as any).localStorage.getItem("eveniunt-cloud-device") ||
				"null",
		);
		return d && /^[0-9a-f]{64}$/.test(d.device) ? d.device : null;
	} catch (_e) {
		return null;
	}
};
PUSH.call = (path: string, body: unknown) =>
	PUSH.config().then((h: string | null) => {
		if (!h)
			throw Object.assign(
				new Error(
					"Cloud sync is not set up on this site, so the helper is not known.",
				),
				{ code: "no-helper" },
			);
		if (path !== "/push/key" && !PUSH.device())
			throw Object.assign(
				new Error(
					"This app is not signed in for cloud sync yet: Command Center, Settings, Cloud sync, Sign in with Microsoft; then tap Turn on for this device. On an iPhone, the home-screen app signs in separately from Safari.",
				),
				{ code: "no-device" },
			);
		return fetch(h + path, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(
				Object.assign({ device: PUSH.device() }, body || {}),
			),
		}).then((r: any) =>
			r
				.json()
				.catch(() => ({}))
				.then((j: any) => {
					if (!r.ok)
						throw Object.assign(
							new Error(
								'The helper refused "' +
									path.replace("/push/", "") +
									'" (' +
									r.status +
									"): " +
									(j.message || "no reason given") +
									".",
							),
							{ code: j.error || "helper", status: r.status },
						);
					return j;
				}),
		);
	});
PUSH.supported = () =>
	"serviceWorker" in (globalThis as any).navigator &&
	"PushManager" in (globalThis as any).window &&
	"Notification" in (globalThis as any).window;
function keyBytes(b64: string): Uint8Array {
	const s = atob(
		b64.replace(/-/g, "+").replace(/_/g, "/") +
			"===".slice((b64.length + 3) % 4),
	);
	const b = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
	return b;
}
PUSH.registration = () =>
	(globalThis as any).navigator.serviceWorker
		.getRegistration(PUSH.ROOT)
		.then((r: any) => r || (globalThis as any).navigator.serviceWorker.ready);
PUSH.enable = () => {
	if (!PUSH.supported())
		return Promise.reject(
			new Error(
				"This browser cannot receive web notifications. On an iPhone or iPad, add the Command Center to the home screen and open it from there.",
			),
		);
	if (!PUSH.device())
		return Promise.reject(
			new Error(
				"Sign in for cloud sync once on this device first (Tracker, Settings, Cloud sync): that is how your helper knows the device is yours.",
			),
		);
	return (globalThis as any).Notification.requestPermission()
		.then((perm: string) => {
			if (perm !== "granted")
				throw new Error(
					"Notifications were not allowed. Allow them for this site in the browser settings, then try again.",
				);
			return Promise.all([PUSH.call("/push/key"), PUSH.registration()]);
		})
		.then((x: any[]) => {
			return x[1].pushManager.getSubscription().then(
				(old: any) =>
					old ||
					x[1].pushManager.subscribe({
						userVisibleOnly: true,
						applicationServerKey: keyBytes(x[0].key),
					}),
			);
		})
		.then((sub: any) => {
			const j = sub?.toJSON ? sub.toJSON() : null;
			if (
				!j ||
				typeof j.endpoint !== "string" ||
				!/^https:\/\//.test(j.endpoint)
			)
				throw new Error(
					"The browser gave no usable notification address (" +
						(j?.endpoint ? String(j.endpoint).split("/")[2] : "none") +
						").",
				);
			if (!j.keys?.p256dh || !j.keys.auth)
				throw new Error(
					"The browser gave a notification address on " +
						j.endpoint.split("/")[2] +
						" but no encryption keys.",
				);
			return PUSH.call("/push/subscribe", {
				subscription: {
					endpoint: j.endpoint,
					keys: { p256dh: String(j.keys.p256dh), auth: String(j.keys.auth) },
				},
			});
		});
};
PUSH.disable = () =>
	PUSH.registration()
		.then((r: any) => r?.pushManager.getSubscription())
		.then((s: any) => s?.unsubscribe())
		.catch(() => {
			/* nothing to undo here */
		})
		.then(() => PUSH.call("/push/unsubscribe"));
PUSH.sync = (al: unknown[], stamp: unknown) => {
	if (!PUSH.device()) return Promise.resolve(null);
	const sig = JSON.stringify([stamp, al]);
	try {
		if (
			(globalThis as any).sessionStorage.getItem("eveniunt-subs-push") === sig
		)
			return Promise.resolve(null);
	} catch (_e) {
		/* none */
	}
	return PUSH.call("/push/schedule", { stamp, alerts: al }).then(
		(r: unknown) => {
			try {
				(globalThis as any).sessionStorage.setItem("eveniunt-subs-push", sig);
			} catch (_e) {
				/* none */
			}
			return r;
		},
	);
};

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
const EARN: Record<string, any> = {};
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

export function installSubsGlobals(): void {
	g.FLEET = FLEET;
	g.ADVISOR = ADVISOR;
	g.PUSH = PUSH;
	g.EARN = EARN;
}

installSubsGlobals();

export { page };
