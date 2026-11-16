import * as time from "../time.ts";

function esc(s: unknown): string {
	return String(s).replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c as string
			] as string,
	);
}

export function banner(group: any[], link: string | null, now: number): string {
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

export function download(name: string, text: string, type?: string): void {
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
