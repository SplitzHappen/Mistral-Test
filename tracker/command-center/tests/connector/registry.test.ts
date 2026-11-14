import assert from "node:assert/strict";
import { test } from "node:test";

import {
	exampleModule,
	registry,
	validateManifest,
} from "../../src/base/connector/index.ts";

test("registry: submersibles real; tracker and atelier manifest-only", () => {
	const entries = registry();
	assert.deepEqual(
		entries.map((e) => [e.manifest.id, e.real]),
		[
			["tracker", false],
			["atelier", false],
			["submersibles", true],
		],
	);
	for (const e of entries) validateManifest(e.manifest); // all validate
});

test("registry: the example module is built and valid but never published", () => {
	const example = exampleModule();
	validateManifest(example);
	assert.equal(
		registry().some((e) => e.manifest.id === example.id),
		false,
	);
});

test("registry: page flags match today (atelier isolated with own worker; submersibles a shell page)", () => {
	const byId = new Map(registry().map((e) => [e.manifest.id, e.manifest]));
	assert.deepEqual(byId.get("atelier")?.page, {
		isolated: true,
		ownWorker: true,
	});
	assert.deepEqual(byId.get("submersibles")?.page, {
		isolated: false,
		ownWorker: false,
	});
	assert.deepEqual(byId.get("tracker")?.page, {
		isolated: false,
		ownWorker: true,
	});
});
