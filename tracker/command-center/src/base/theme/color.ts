export function hexRgb(h: unknown): [number, number, number] | null {
	let s = String(h || "")
		.trim()
		.replace("#", "");
	if (s.length === 3) s = s.replace(/./g, "$&$&");
	const n = Number.parseInt(s, 16);
	return !/^[0-9a-f]{6}$/i.test(s)
		? null
		: [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbHex(r: number[]): string {
	return (
		"#" +
		r
			.map((x) =>
				("0" + Math.max(0, Math.min(255, Math.round(x))).toString(16)).slice(
					-2,
				),
			)
			.join("")
	);
}

export function lum(r: number[]): number {
	const c = r.map((v) => {
		v /= 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function mix(a: number[], b: number[], t: number): string {
	return rgbHex(a.map((x, i) => x + (b[i] - x) * t));
}
