// Redirects the four legacy Submersibles script paths to the typed compat layer,
// so the legacy suites run against the new modules under the same global names.
const path = require("node:path");
const Module = require("node:module");
const CC = path.resolve(__dirname, "..", "..");
const REDIRECT = new Map(
	["fleet", "advisor", "push", "earn"].map((f) => [
		path.join(CC, "src", "submersibles", `${f}.js`),
		path.join(CC, "src", "modules", "submersibles", "logic", "compat.ts"),
	]),
);
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
	const resolved = orig.call(this, request, ...rest);
	return REDIRECT.get(resolved) || resolved;
};
