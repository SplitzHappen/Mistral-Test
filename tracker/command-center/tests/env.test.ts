import assert from "node:assert/strict";
import { test } from "node:test";
import { h } from "preact";
import render from "preact-render-to-string";

import { type Env, env } from "../src/base/env.ts";

test("env: injectable clock and randomness", () => {
	const fixed: Env = {
		now: () => 1700000000000,
		random: () => 0.5,
		id: () => "fixed-id",
	};
	assert.equal(fixed.now(), 1700000000000);
	assert.equal(fixed.random(), 0.5);
	assert.equal(fixed.id(), "fixed-id");
	assert.equal(typeof env.now(), "number");
	assert.ok(env.now() > 0);
	assert.ok(env.random() >= 0 && env.random() < 1);
	assert.equal(typeof env.id(), "string");
});

test("toolchain: preact renders to a string with the automatic JSX runtime", () => {
	const html = render(h("p", { class: "x" }, "hello"));
	assert.equal(html, '<p class="x">hello</p>');
});
