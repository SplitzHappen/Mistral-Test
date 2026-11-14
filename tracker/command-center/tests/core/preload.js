// Preload for running the UNCHANGED legacy suite through the ported core: node --require <this> tests/core.test.js
// Redirects ONLY the six ported files (tracker/src/core/{save,model,codec,merge,cloud,storage}.js) to the compat
// layer; ffxivcollect.js, links.js and importer.js stay legacy. Plain CJS (this package has no "type" field).
const Module = require("node:module");
const path = require("node:path");
const CC = path.resolve(__dirname, "..", "..");
const T = path.resolve(CC, "..");
const REDIRECT = new Set(
	["save", "model", "codec", "merge", "cloud", "storage"].map((f) =>
		path.join(T, "src", "core", `${f}.js`),
	),
);
const COMPAT = path.join(CC, "src", "base", "core", "compat.ts");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
	const resolved = orig.call(this, request, parent, isMain, options);
	if (REDIRECT.has(resolved)) return COMPAT;
	return resolved;
};
