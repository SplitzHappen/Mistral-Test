import assert from "node:assert/strict";
import { test } from "node:test";

import {
	connect,
	type Doc,
	exampleModule,
	MemoryStore,
	registry,
} from "../../src/base/connector/index.ts";
import { type Env, env as realEnv } from "../../src/base/env.ts";

const fixedEnv = (t: number): Env => {
	let seq = 0;
	return {
		now: () => t,
		random: () => (seq += 1) / 1000,
		id: () => `id-${t}-${seq}`,
	};
};

function memStorage() {
	const map = new Map<string, string>();
	return {
		getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
		setItem: (k: string, v: string) => void map.set(k, v),
		map,
	};
}

const URL_ = "https://example.test/Eveniunt-Command-Center/";

test("connect: section get/set/subscribe against the store, with merged set", async () => {
	const store = new MemoryStore(fixedEnv(1000));
	const c = connect(exampleModule(), {
		url: URL_,
		env: fixedEnv(1000),
		store,
		storage: memStorage(),
	});
	assert.deepEqual(await c.section.get(), { count: 0 }); // empty default from the manifest
	let seen = 0;
	c.section.subscribe(() => seen++);
	const r1 = await c.section.set({ count: 5 });
	assert.equal(r1.merged, false);
	assert.deepEqual(await c.section.get(), { count: 5 });
	assert.ok(seen >= 1);
	// another writer saved since: the set merges units instead of overwriting the section
	await store.writeSection("example", { count: 99 }, null, 1001); // a second page, known=null
	const r2 = await c.section.set({ count: 6 });
	assert.equal(r2.merged, true);
	assert.deepEqual(await c.section.get(), { count: 6 });
});

test("connect: set runs the section through the manifest checker", async () => {
	const store = new MemoryStore(fixedEnv(1000));
	const c = connect(exampleModule(), {
		url: URL_,
		env: fixedEnv(1000),
		store,
		storage: memStorage(),
	});
	await c.section.set({ count: -50, extra: "dropped" });
	assert.deepEqual(await c.section.get(), { count: 0 }); // clamped by the checker, unknown field dropped
});

test("connect: characters are read-only and checked", async () => {
	const store = new MemoryStore(fixedEnv(1000));
	const c = connect(exampleModule(), {
		url: URL_,
		env: fixedEnv(1000),
		store,
		storage: memStorage(),
	});
	await store.transact(() => {
		const doc = {
			app: "eveniunt-command-center",
			v: 1,
			updated: 1,
			chars: [
				{ id: "c1", name: " Ann " },
				{ id: "x", name: "bad" },
			],
			modules: {},
			device: {},
			moved: {},
		} as unknown as Doc;
		return doc;
	});
	const chars = await c.characters.list();
	assert.deepEqual(chars, [
		{ id: "c1", name: "Ann", lodestone: null, gc: null },
	]);
	assert.equal("set" in c.characters, false); // no writer
});

test("connect: the base owns the settings section; its checker is in the same table", async () => {
	const store = new MemoryStore(fixedEnv(1000));
	const c = connect(exampleModule(), {
		url: URL_,
		env: fixedEnv(1000),
		store,
		storage: memStorage(),
	});
	await c.settings.set({
		notify: { night: "quiet", quietHours: { from: 1320, to: 480 } },
		junk: 1,
	});
	const s = (await c.settings.get()) as {
		notify: { night: string; quietHours: { from: number; to: number } };
	};
	assert.equal(s.notify.night, "quiet");
	assert.deepEqual(s.notify.quietHours, { from: 1320, to: 480 });
	assert.equal("junk" in s, false);
	assert.equal(
		await c.notify.quietAt(new Date("2026-01-01T23:00:00").getTime()),
		true,
	);
	assert.equal(
		await c.notify.quietAt(new Date("2026-01-01T12:00:00").getTime()),
		false,
	);
});

test("connect: device storage uses the existing device key, one sub-object per module, never the save", async () => {
	const store = new MemoryStore(fixedEnv(1000));
	const storage = memStorage();
	const c = connect(exampleModule(), {
		url: URL_,
		env: fixedEnv(1000),
		store,
		storage,
	});
	await c.device.set({ sound: true });
	assert.deepEqual(
		JSON.parse(storage.map.get("eveniunt-command-center-device") as string),
		{ example: { sound: true } },
	);
	assert.deepEqual(await c.device.get(), { sound: true });
	const r = await store.read();
	assert.equal(JSON.stringify(r.raw).includes("sound"), false); // device-only: never in the save
});

test("connect: nav comes from the page known place, never from a script address", () => {
	const store = new MemoryStore(fixedEnv(1000));
	const shell = connect(exampleModule(), {
		url: "https://example.test/Eveniunt-Command-Center/",
		env: fixedEnv(1),
		store,
		storage: memStorage(),
	});
	assert.equal(
		shell.nav.siteRoot,
		"https://example.test/Eveniunt-Command-Center/",
	);
	assert.equal(
		shell.nav.address,
		"https://example.test/Eveniunt-Command-Center/example/",
	);
	const onModulePage = connect(exampleModule(), {
		url: "https://example.test/Eveniunt-Command-Center/example/",
		env: fixedEnv(1),
		store,
		storage: memStorage(),
	});
	assert.equal(
		onModulePage.nav.siteRoot,
		"https://example.test/Eveniunt-Command-Center/",
	);
	const subs = registry().find((e) => e.manifest.id === "submersibles");
	if (!subs) assert.fail("submersibles missing");
	assert.equal(
		shell.nav.for(subs.manifest),
		"https://example.test/Eveniunt-Command-Center/submersibles/",
	);
});

test("connect: env is the one small injectable env object", () => {
	const store = new MemoryStore(fixedEnv(1));
	const e = fixedEnv(42);
	const c = connect(exampleModule(), {
		url: URL_,
		env: e,
		store,
		storage: memStorage(),
	});
	assert.equal(c.env.now(), 42);
	const c2 = connect(exampleModule(), {
		url: URL_,
		store: new MemoryStore(realEnv),
		storage: memStorage(),
	});
	assert.ok(c2.env.now() > 0); // defaults to the real env
});

test("connect: an invalid manifest is refused", () => {
	const store = new MemoryStore(fixedEnv(1));
	assert.throws(
		() =>
			connect(
				{ contract: 1, id: "x" },
				{ url: URL_, env: fixedEnv(1), store, storage: memStorage() },
			),
		/bad module manifest/,
	);
});
