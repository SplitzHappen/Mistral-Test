// The compat layer: sets globalThis.CC and globalThis.ET with the SAME property names (and order) the legacy
// plain scripts set, assembled from the typed ported modules. Loaded only by tests (preload) and never by the
// published pages yet. tests/core/compat.test.ts proves Object.keys equality against the frozen reference copies.
import * as cloud from "./cloud.ts";
import * as codec from "./codec.ts";
import * as merge from "./merge.ts";
import * as model from "./model.ts";
import * as save from "./save.ts";
import * as storage from "./storage.ts";

export function installCompat(): {
	CC: Record<string, unknown>;
	ET: Record<string, unknown>;
} {
	const g = globalThis as Record<string, unknown>;
	// CC in the legacy insertion order (see tests/core/compat.test.ts, which compares against the reference run)
	const CC: Record<string, unknown> = {
		APP: save.APP,
		VERSION: save.VERSION,
		DB: save.DB_NAME,
		STORE: save.STORE_NAME,
		LS: save.LS_KEY,
		MAX_CHARS: save.MAX_CHARS,
		MODULE: save.MODULE_RE,
		safeKey: save.safeKey,
		clean: save.clean,
		checkChars: save.checkChars,
		checkProfile: save.checkProfile,
		SUB_SECTOR_MAX: save.SUB_SECTOR_MAX,
		SUB_PART_SLOTS: save.SUB_PART_SLOTS,
		isSubSector: save.isSubSector,
		checkSubmersibles: save.checkSubmersibles,
		checkSettings: save.checkSettings,
		checkModules: save.checkModules,
		others: save.others,
		checkDoc: save.checkDoc,
		emptyDoc: save.emptyDoc,
		UNIT_DEPTH: save.UNIT_DEPTH,
		flatModules: save.flatModules,
		unflatModules: save.unflatModules,
		mergeModules: save.mergeModules,
		describeUnit: save.describeUnit,
		read: save.read,
		transact: save.transact,
		putExtra: save.putExtra,
		extras: save.extras,
		resetMemory: save.resetMemory,
		writeSection: save.writeSection,
		PAGE_ID: save.PAGE_ID,
		onChange: save.onChange,
		pack: save.pack,
		unpack: save.unpack,
		byteLength: save.byteLength,
	};
	Object.defineProperty(CC, "kind", {
		get: () => save.kind,
		set: (v: string) => save.setKind(v),
		enumerable: true,
		configurable: true,
	});
	// place 'kind' where legacy has it (between describeUnit and read)
	const CCOrdered: Record<string, unknown> = {};
	for (const k of Object.keys(CC)) {
		if (k === "read") CCOrdered.kind = save.kind;
		CCOrdered[k] = CC[k];
	}
	Object.defineProperty(CCOrdered, "kind", {
		get: () => save.kind,
		set: (v: string) => save.setKind(v),
		enumerable: true,
		configurable: true,
	});

	// ET in the legacy insertion order (model, codec, merge, cloud, storage — the six files' load order)
	const ET: Record<string, unknown> = {
		MAX_CHARS: model.MAX_CHARS,
		STATE_VERSION: model.STATE_VERSION,
		key: model.key,
		indexData: model.indexData,
		newState: model.newState,
		CHAR_ID: model.CHAR_ID,
		ENTRY_KEY: model.ENTRY_KEY,
		cleanName: model.cleanName,
		validateState: model.validateState,
		renameCharacter: model.renameCharacter,
		setCharacterCount: model.setCharacterCount,
		availability: model.availability,
		setAvailability: model.setAvailability,
		toggleAvailability: model.toggleAvailability,
		getValue: model.getValue,
		setValue: model.setValue,
		START_CLASSES: model.START_CLASSES,
		CITIES: model.CITIES,
		GCS: model.GCS,
		cityOf: model.cityOf,
		setStart: model.setStart,
		notApplicable: model.notApplicable,
		isExcluded: model.isExcluded,
		setExcluded: model.setExcluded,
		isTicked: model.isTicked,
		setTick: model.setTick,
		toggleTick: model.toggleTick,
		setMany: model.setMany,
		tally: model.tally,
		sectionKeys: model.sectionKeys,
		migrateAliases: model.migrateAliases,
		summary: model.summary,
		percent: model.percent,
		portable: codec.portable,
		saveDoc: codec.saveDoc,
		fromSaveDoc: codec.fromSaveDoc,
		exportFile: codec.exportFile,
		importFile: codec.importFile,
		makeTransferCode: codec.makeTransferCode,
		readTransferCode: codec.readTransferCode,
		isPlaceholderName: merge.isPlaceholderName,
		threeWay: merge.threeWay,
		applyMerge: merge.applyMerge,
		describeConflict: merge.describeConflict,
		cloudConfig: cloud.cloudConfig,
		cloudResetConfig: cloud.cloudResetConfig,
		cloudState: cloud.cloudState,
		cloudReturnAddress: cloud.cloudReturnAddress,
		cloudBegin: cloud.cloudBegin,
		cloudComplete: cloud.cloudComplete,
		cloudToken: cloud.cloudToken,
		cloudForget: cloud.cloudForget,
		CLOUD_MAX_BYTES: cloud.CLOUD_MAX_BYTES,
		CLOUD_VERSION: cloud.CLOUD_VERSION,
		cloudDoc: cloud.cloudDoc,
		readCloud: cloud.readCloud,
		mergeLoss: cloud.mergeLoss,
		cloudSync: cloud.cloudSync,
		cloudFinish: cloud.cloudFinish,
		cloudOverwrite: cloud.cloudOverwrite,
		docFromState: storage.docFromState,
		stateFromDoc: storage.stateFromDoc,
		compareTracker: storage.compareTracker,
		moveSummary: storage.moveSummary,
		readOldSave: storage.readOldSave,
		saveMerge: storage.saveMerge,
		untouched: storage.untouched,
		catchUpMerge: storage.catchUpMerge,
		acceptLoaded: storage.acceptLoaded,
		loadState: storage.loadState,
		requestPersistence: storage.requestPersistence,
		TAB_ID: storage.TAB_ID,
		saveState: storage.saveState,
		hasPendingSave: storage.hasPendingSave,
		clearState: storage.clearState,
		confirmMove: storage.confirmMove,
		oldSaveDiff: storage.oldSaveDiff,
		goBack: storage.goBack,
	};
	// mutable properties, mirrored both ways
	const mutables: [string, () => unknown, (v: never) => void][] = [
		[
			"storageKind",
			() => storage.storageKind,
			(v) => storage.setStorageKind(v as string),
		],
		[
			"loadProblem",
			() => storage.loadProblem,
			(v) => storage.setLoadProblem(v as never),
		],
		[
			"moveProblem",
			() => storage.moveProblem,
			(v) => storage.setMoveProblem(v as never),
		],
		[
			"saveDisabled",
			() => storage.saveDisabled,
			(v) => storage.setSaveDisabled(v as boolean),
		],
		[
			"justMoved",
			() => storage.justMoved,
			(v) => storage.setJustMoved(v as boolean),
		],
		[
			"caughtUp",
			() => storage.caughtUp,
			(v) => storage.setCaughtUp(v as boolean),
		],
		[
			"onOtherTabSave",
			() => storage.onOtherTabSave,
			(v) => storage.setOnOtherTabSave(v as never),
		],
		[
			"onSaveResult",
			() => storage.onSaveResult,
			(v) => storage.setOnSaveResult(v as never),
		],
		[
			"onSaveMerged",
			() => storage.onSaveMerged,
			(v) => storage.setOnSaveMerged(v as never),
		],
		[
			"CLOUD_BASE",
			() => model.shared.CLOUD_BASE,
			(v) => {
				model.shared.CLOUD_BASE = v as string;
			},
		],
		[
			"CLOUD_MAX_BYTES",
			() => cloud.limits.CLOUD_MAX_BYTES,
			(v) => {
				cloud.limits.CLOUD_MAX_BYTES = v as number;
			},
		],
	];
	// legacy order: storageKind..goBack, with the mutables sitting where the legacy files first assigned them
	const ETOrdered: Record<string, unknown> = {};
	for (const k of Object.keys(ET)) {
		if (k === "docFromState") {
			ETOrdered.storageKind = storage.storageKind;
			ETOrdered.loadProblem = storage.loadProblem;
			ETOrdered.moveProblem = storage.moveProblem;
			ETOrdered.saveDisabled = storage.saveDisabled;
			ETOrdered.justMoved = storage.justMoved;
			ETOrdered.caughtUp = storage.caughtUp;
		}
		if (k === "saveState") {
			ETOrdered.TAB_ID = storage.TAB_ID;
			ETOrdered.onOtherTabSave = storage.onOtherTabSave;
			ETOrdered.onSaveResult = storage.onSaveResult;
			ETOrdered.onSaveMerged = storage.onSaveMerged;
		}
		if (k !== "TAB_ID") ETOrdered[k] = ET[k];
	}
	for (const [name, get, set] of mutables)
		Object.defineProperty(ETOrdered, name, {
			get,
			set: set as (v: unknown) => void,
			enumerable: name !== "CLOUD_BASE", // legacy only gains CLOUD_BASE when a page sets it
			configurable: true,
		});

	g.CC = CCOrdered;
	g.ET = ETOrdered;
	return { CC: CCOrdered, ET: ETOrdered };
}

installCompat();
