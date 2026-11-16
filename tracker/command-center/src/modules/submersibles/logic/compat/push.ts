import * as alerts from "../alerts.ts";

const HERE =
	(globalThis as any).document?.currentScript?.src ||
	(typeof (globalThis as any).location !== "undefined"
		? (globalThis as any).location.href
		: "http://x/submersibles/");

export const PUSH: Record<string, any> = {};
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
