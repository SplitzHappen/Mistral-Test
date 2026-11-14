export interface Env {
	now(): number;
	random(): number;
	id(): string;
}

export const env: Env = {
	now: () => Date.now(),
	random: () => Math.random(),
	id: () =>
		`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
};
