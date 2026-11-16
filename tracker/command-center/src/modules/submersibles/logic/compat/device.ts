export const g = globalThis as Record<string, any>;

export const DEVICE_KEY = "eveniunt-command-center-device";

export function device(): Record<string, any> {
	try {
		const d = JSON.parse(
			(globalThis as any).localStorage.getItem(DEVICE_KEY) || "{}",
		);
		return d && typeof d === "object" ? d : {};
	} catch (_e) {
		return {};
	}
}
export function deviceSubs(): Record<string, any> {
	const s = device().subs;
	return s && typeof s === "object" ? s : {};
}
export function setDeviceSubs(fn: (s: Record<string, any>) => void): void {
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
