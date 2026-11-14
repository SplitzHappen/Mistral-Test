// The base's public surface for modules. Modules import ONLY this file (and nothing from each other):
// tests/connector/import-boundary.test.ts enforces it.

export {
	APP,
	CHECK,
	CHECK_ORDER,
	type Char,
	checkAtelier,
	checkChars,
	checkDoc,
	checkModules,
	checkProfile,
	checkSettings,
	checkSubmersibles,
	clean,
	type Doc,
	emptyDoc,
	flatModules,
	MAX_CHARS,
	MODULE,
	mergeModules,
	safeKey,
	UNIT_DEPTH,
	unflatModules,
	VERSION,
} from "./checkers.ts";
export {
	type ConnectContext,
	connect,
	DEVICE_KEY,
	type Nav,
	type SectionApi,
} from "./connect.ts";
export {
	type Manifest,
	type SaveSection,
	validateManifest,
} from "./manifest.ts";
export { exampleModule, type RegistryEntry, registry } from "./registry.ts";
export {
	MemoryStore,
	type ReadResult,
	type SaveStore,
	type SectionWrite,
	type WriteResult,
} from "./store.ts";
