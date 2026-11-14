import { MIN } from "./time.ts";

function icsText(s: unknown): string {
	return String(s)
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r?\n/g, "\\n");
}

function icsTime(t: number): string {
	return new Date(t)
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}/, "");
}

function fold(line: string): string {
	const out: string[] = [];
	let cur = "";
	let len = 0;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		const n = unescape(encodeURIComponent(ch)).length;
		if (len + n > (out.length ? 74 : 75)) {
			out.push(cur);
			cur = "";
			len = 0;
		}
		cur += ch;
		len += n;
	}
	out.push(cur);
	return out.join("\r\n ");
}

export interface IcsOptions {
	title: string;
	at: number;
	uid: string;
	note?: string;
	now: number;
}

export function ics(o: IcsOptions): string {
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Eveniunt Command Center//Submersibles//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		"BEGIN:VEVENT",
		`UID:${o.uid}@eveniunt-command-center`,
		`DTSTAMP:${icsTime(o.now)}`,
		`DTSTART:${icsTime(o.at)}`,
		`DTEND:${icsTime(o.at + 15 * MIN)}`,
		`SUMMARY:${icsText(o.title)}`,
		`DESCRIPTION:${icsText(o.note || "")}`,
		"BEGIN:VALARM",
		"ACTION:DISPLAY",
		`DESCRIPTION:${icsText(o.title)}`,
		"TRIGGER:PT0M",
		"END:VALARM",
		"END:VEVENT",
		"END:VCALENDAR",
	];
	return `${lines.map(fold).join("\r\n")}\r\n`;
}

export function fileName(title: unknown): string {
	return `${
		String(title)
			.normalize("NFKD")
			.replace(/[^\w\s-]/g, "")
			.trim()
			.replace(/\s+/g, "-")
			.toLowerCase()
			.slice(0, 60) || "submarine"
	}.ics`;
}
