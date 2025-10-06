import { defineConfig } from "tsup";

export default defineConfig([
	// Library build - fully bundled for easy consumption
	{
		entry: ["src/index.ts"],
		format: ["esm"],
		dts: true,
		sourcemap: true,
		clean: true,
		outDir: "dist",
		bundle: true, // Bundle all dependencies
		splitting: false,
		treeshake: true,
		external: [], // Bundle everything - no external deps
		esbuildOptions(options) {
			options.platform = "node";
			options.target = "node20";
		},
	},
	// CLI build - fully bundled single file
	{
		entry: {
			"cli/index": "src/cli/index.ts",
		},
		format: ["esm"],
		dts: false,
		sourcemap: false,
		clean: false, // Don't clean - library already did
		outDir: "dist",
		bundle: true, // Fully bundle CLI into single file
		minify: true,
		splitting: false,
		treeshake: true,
		external: [], // Bundle everything
		esbuildOptions(options) {
			options.platform = "node";
			options.target = "node20";
		},
		async onSuccess() {
			const { chmodSync, readFileSync, writeFileSync } = await import("node:fs");
			const cliPath = "dist/cli/index.js";
			const content = readFileSync(cliPath, "utf-8");
			if (!content.startsWith("#!/usr/bin/env node")) {
				writeFileSync(cliPath, `#!/usr/bin/env node\n${content}`);
			}
			chmodSync(cliPath, 0o755);
		},
	},
]);
