// Port of tracker/src/core/merge.js: the three-way merge used by cloud sync. Explicit imports replace CC/ET.
import { env as defaultEnv } from "../env.ts";
import * as model from "./model.ts";
import * as save from "./save.ts";
import { plain } from "./util.ts";

const SETTINGS = ["countLimited", "countGone", "countUnknown", "links", "gold"];
function flat(p: unknown): Map<string, string> {
	const m = new Map<string, string>();
	if (!p || typeof p !== "object") return m;
	const obj = (o: unknown) => (plain(o) ? o : {});
	const okC = (c: unknown) => typeof c === "string" && model.CHAR_ID.test(c);
	const okK = (k: unknown) => typeof k === "string" && model.ENTRY_KEY.test(k);
	const pp = p as Record<string, unknown>;
	for (const [c, t] of Object.entries(obj(pp.ticks)))
		if (okC(c))
			for (const k of Object.keys(obj(t)))
				if (okK(k)) m.set(`t|${c}|${k}`, "1");
	for (const [c, t] of Object.entries(obj(pp.excl)))
		if (okC(c))
			for (const k of Object.keys(obj(t)))
				if (okK(k)) m.set(`e|${c}|${k}`, "1");
	for (const [c, t] of Object.entries(obj(pp.vals)))
		if (okC(c))
			for (const [k, v] of Object.entries(obj(t)))
				if (okK(k) && Number.isFinite(Number(v)))
					m.set(`v|${c}|${k}`, String(Number(v)));
	for (const [k, v] of Object.entries(obj(pp.avail)))
		if (okK(k) && (v === "x" || v === "ok")) m.set(`a|${k}`, v as string);
	for (const c of Array.isArray(pp.chars) ? pp.chars : []) {
		if (!plain(c) || typeof c.id !== "string" || !okC(c.id)) continue;
		m.set(`n|${c.id}`, String(c.name || ""));
		if (c.lodestone) m.set(`l|${c.id}`, String(c.lodestone));
		if (c.cls || c.city)
			m.set(`k|${c.id}`, (c.cls as string) || `city:${c.city as string}`);
		if (c.gc) m.set(`g|${c.id}`, String(c.gc));
	}
	for (const [k, v] of Object.entries(obj(pp.settings)))
		if (SETTINGS.includes(k)) m.set(`s|${k}`, String(v === true));
	if (pp.modules) save.flatModules(pp.modules, m);
	return m;
}

export const isPlaceholderName = (n: unknown): boolean =>
	/^Character \d+$/.test(String(n || ""));

export interface MergeResult {
	merged: Map<string, string>;
	conflicts: { id: string; local: string | null; remote: string | null }[];
}

export function threeWay(
	base: unknown,
	local: unknown,
	remote: unknown,
): MergeResult {
	const fill = (x: unknown, from: unknown) =>
		x &&
		typeof x === "object" &&
		(x as Record<string, unknown>).modules === undefined &&
		from &&
		(from as Record<string, unknown>).modules !== undefined
			? Object.assign({}, x as object, {
					modules: (from as Record<string, unknown>).modules,
				})
			: x;
	local = fill(local, base || remote);
	remote = fill(remote, base || local);
	const B = flat(base);
	const L = flat(local);
	const R = flat(remote);
	const keys = new Set([...B.keys(), ...L.keys(), ...R.keys()]);
	const merged = new Map<string, string>();
	const conflicts: MergeResult["conflicts"] = [];
	for (const k of keys) {
		const b = B.get(k);
		const l = L.get(k);
		const r = R.get(k);
		if (l === r) {
			if (l !== undefined) merged.set(k, l);
			continue;
		}
		if (k.startsWith("n|")) {
			const lr = l !== undefined && !isPlaceholderName(l);
			const rr = r !== undefined && !isPlaceholderName(r);
			if (lr !== rr) {
				merged.set(k, lr ? (l as string) : (r as string));
				continue;
			}
		}
		if (l === b) {
			if (r !== undefined) merged.set(k, r);
			continue;
		}
		if (r === b) {
			if (l !== undefined) merged.set(k, l);
			continue;
		}
		conflicts.push({
			id: k,
			local: l === undefined ? null : l,
			remote: r === undefined ? null : r,
		});
		if (l !== undefined) merged.set(k, l);
	}
	return { merged, conflicts };
}

export function applyMerge(
	st: model.State,
	result: MergeResult,
	choices?: Record<string, string>,
): model.State {
	const m = new Map(result.merged);
	for (const c of result.conflicts) {
		const pick = choices?.[c.id] === "remote" ? c.remote : c.local;
		if (pick === null) m.delete(c.id);
		else m.set(c.id, pick);
	}
	const chars = new Map(st.chars.map((c) => [c.id, c] as [string, model.Char]));
	const ticks: Record<string, Record<string, number>> = {};
	const excl: Record<string, Record<string, number>> = {};
	const vals: Record<string, Record<string, number>> = {};
	const avail: Record<string, string> = {};
	const settings = Object.assign({}, st.settings);
	const units = new Map<string, string>();
	for (const [k, v] of m) {
		if (k.startsWith("m|")) {
			units.set(k, v);
			continue;
		}
		const [kind, a, ...rest] = k.split("|");
		if (kind === "t") {
			if (!chars.has(a))
				chars.set(a, { id: a, name: a, lodestone: null, cls: null, gc: null });
			(ticks[a] = ticks[a] || {})[rest.join("|")] = 1;
		} else if (kind === "v") {
			(vals[a] = vals[a] || {})[rest.join("|")] = Number(v);
		} else if (kind === "e") {
			(excl[a] = excl[a] || {})[rest.join("|")] = 1;
		} else if (kind === "a") avail[a] = v;
		else if (kind === "n") {
			if (!chars.has(a))
				chars.set(a, { id: a, name: v, lodestone: null, cls: null, gc: null });
			else chars.get(a)!.name = v;
		} else if (kind === "l") {
			if (chars.has(a)) chars.get(a)!.lodestone = v;
		} else if (kind === "k") {
			if (chars.has(a)) {
				const ch = chars.get(a)!;
				if (v.startsWith("city:")) {
					ch.city = v.slice(5);
					ch.cls = null;
				} else {
					ch.cls = v;
					ch.city = null;
				}
			}
		} else if (kind === "g") {
			if (chars.has(a)) chars.get(a)!.gc = Number(v);
		} else if (kind === "s")
			(settings as Record<string, unknown>)[a] =
				v === "true" ? true : v === "false" ? false : v;
	}
	const ordered = [...chars.values()]
		.sort((x, y) => Number(x.id.slice(1)) - Number(y.id.slice(1)))
		.slice(0, model.MAX_CHARS);
	for (const c of ordered) {
		if (!m.has(`l|${c.id}`)) c.lodestone = null;
		if (!m.has(`k|${c.id}`)) {
			c.cls = null;
			c.city = null;
		}
		if (!m.has(`g|${c.id}`)) c.gc = null;
	}
	st.chars = ordered;
	st.ticks = {};
	st.excl = {};
	st.vals = {};
	for (const c of ordered) {
		st.ticks[c.id] = ticks[c.id] || {};
		st.excl[c.id] = excl[c.id] || {};
		st.vals[c.id] = vals[c.id] || {};
	}
	st.avail = avail;
	st.settings = settings;
	if (units.size || st.modules !== undefined)
		st.modules = save.unflatModules(units);
	st.updated = defaultEnv.now();
	return model.validateState(st);
}

export function describeConflict(
	c: { id: string; local: string | null; remote: string | null },
	idx: model.Idx | null,
	st: model.State,
) {
	const who = (id: string) =>
		(st.chars.find((x) => x.id === id) || { name: id }).name;
	if (c.id.startsWith("m|"))
		return save.describeUnit(c.id, c.local, c.remote, who);
	const [kind, a, ...rest] = c.id.split("|");
	const what = (k: string) => {
		const h = idx?.byKey.get(k);
		return h ? `${(h.e.n as string) || ""} (${h.s.t})` : k;
	};
	if (kind === "t")
		return {
			who: who(a),
			what: what(rest.join("|")),
			local: c.local ? "ticked" : "not ticked",
			remote: c.remote ? "ticked" : "not ticked",
		};
	if (kind === "v")
		return {
			who: who(a),
			what: what(rest.join("|")),
			local: c.local == null ? "(none)" : `level ${c.local}`,
			remote: c.remote == null ? "(none)" : `level ${c.remote}`,
		};
	if (kind === "e")
		return {
			who: who(a),
			what: what(rest.join("|")),
			local: c.local ? "does not apply" : "applies",
			remote: c.remote ? "does not apply" : "applies",
		};
	if (kind === "a") {
		const lab = (v: string | null) =>
			v === "x"
				? "marked unobtainable"
				: v === "ok"
					? "marked obtainable"
					: "automatic";
		return {
			who: "",
			what: what(a),
			local: lab(c.local),
			remote: lab(c.remote),
		};
	}
	if (kind === "n")
		return {
			who: "",
			what: `Name of ${a}`,
			local: c.local || "(none)",
			remote: c.remote || "(none)",
		};
	if (kind === "l")
		return {
			who: who(a),
			what: "Lodestone character number",
			local: c.local || "(none)",
			remote: c.remote || "(none)",
		};
	if (kind === "k")
		return {
			who: who(a),
			what: "Starting class",
			local: c.local || "(none)",
			remote: c.remote || "(none)",
		};
	if (kind === "g")
		return {
			who: who(a),
			what: "Grand Company",
			local: model.GCS[Number(c.local)] || "(none)",
			remote: model.GCS[Number(c.remote)] || "(none)",
		};
	return {
		who: "",
		what: `Setting: ${a}`,
		local: String(c.local),
		remote: String(c.remote),
	};
}
