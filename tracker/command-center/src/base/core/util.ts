// Shared small helpers, identical to the plain() helpers each legacy core file defines for itself.
export const plain = (o: unknown): o is Record<string, unknown> =>
	!!o && typeof o === "object" && !Array.isArray(o);

export const stamp = (): string =>
	new Date().toISOString().replace(/[:.]/g, "-");

export interface JsonMap {
	[k: string]: unknown;
}
