import assert from "node:assert/strict";
import { test } from "node:test";

import {
	exampleModule,
	registry,
	validateManifest,
} from "../../src/base/connector/index.ts";

test("contract: every registry manifest validates", () => {
	for (const entry of registry()) {
		const m = validateManifest(entry.manifest);
		assert.equal(m.contract, 1);
		assert.equal(m.id, entry.manifest.id);
	}
	assert.equal(validateManifest(exampleModule()).id, "example");
});

test("contract: unknown manifest fields are refused", () => {
	const m = exampleModule() as unknown as Record<string, unknown>;
	assert.throws(
		() => validateManifest({ ...m, surprise: 1 }),
		/unknown field "surprise"/,
	);
	assert.throws(
		() =>
			validateManifest({
				...m,
				save: { ...(m.save as object), extra: 1 } as unknown,
			}),
		/unknown field "extra"|save/,
	);
});

test("contract: contract must be 1 and id must be a section name", () => {
	const m = exampleModule() as unknown as Record<string, unknown>;
	assert.throws(() => validateManifest({ ...m, contract: 2 }), /contract/);
	assert.throws(() => validateManifest({ ...m, id: "Not A Section" }), /id/);
	assert.throws(() => validateManifest({ ...m, id: "tracker-2x!" }), /id/);
});

test("contract: save raw:true is the Tracker only", () => {
	const tracker = registry().find((e) => e.manifest.id === "tracker");
	if (!tracker) assert.fail("tracker missing");
	assert.deepEqual((tracker.manifest.save as { raw: boolean }).raw, true);
	const example = exampleModule() as unknown as Record<string, unknown>;
	assert.throws(
		() => validateManifest({ ...example, id: "example", save: { raw: true } }),
		/only the Tracker/,
	);
});

test("contract: wrong field types are refused", () => {
	const m = exampleModule() as unknown as Record<string, unknown>;
	assert.throws(() => validateManifest({ ...m, title: "" }), /title/);
	assert.throws(() => validateManifest({ ...m, path: "example" }), /path/);
	assert.throws(() => validateManifest({ ...m, order: { menu: 1 } }), /order/);
	assert.throws(
		() =>
			validateManifest({ ...m, page: { isolated: "yes", ownWorker: false } }),
		/page/,
	);
	assert.throws(() => validateManifest({ ...m, summary: "nope" }), /summary/);
	assert.throws(
		() => validateManifest({ ...m, alerts: { link: "example/" } }),
		/alerts/,
	);
});
