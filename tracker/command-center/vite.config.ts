import { defineConfig } from "vite";

export default defineConfig({
	oxc: {
		jsx: { runtime: "automatic", importSource: "preact" },
	},
	build: {
		outDir: "dist",
		lib: {
			entry: "src/base/env.ts",
			formats: ["es"],
			fileName: () => "env.js",
		},
	},
});
