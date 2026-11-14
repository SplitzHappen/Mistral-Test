// The registry of modules. submersibles is real; tracker and atelier are manifest-only (their logic stays in
// the legacy pages until later phases). The example module is built and tested but never published: it is NOT
// in this list.
import { atelierManifest } from "../../modules/atelier/manifest.ts";
import { exampleManifest } from "../../modules/example/manifest.ts";
import { submersiblesManifest } from "../../modules/submersibles/manifest.ts";
import { trackerManifest } from "../../modules/tracker/manifest.ts";
import type { Manifest } from "./manifest.ts";

export interface RegistryEntry {
	manifest: Manifest;
	real: boolean; // false = manifest-only: listed, but its logic is not ported yet
}

export function registry(): RegistryEntry[] {
	return [
		{ manifest: trackerManifest as unknown as Manifest, real: false },
		{ manifest: atelierManifest as unknown as Manifest, real: false },
		{ manifest: submersiblesManifest as unknown as Manifest, real: true },
	];
}

export function exampleModule(): Manifest {
	return exampleManifest;
}
