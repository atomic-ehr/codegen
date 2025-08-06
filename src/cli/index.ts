#!/usr/bin/env bun

/**
 * Atomic Codegen CLI - Modern Command Structure
 *
 * Main entry point for the atomic-codegen CLI tool
 */

// Re-export the new CLI entry point
export { createCLI, runCLI } from "./commands";

import { AtomicCodegenError } from "../lib/core/errors";
import { createLoggerFromConfig } from "../lib/core/logger";
// Import and run CLI if this file is executed directly
import { runCLI } from "./commands";

if (import.meta.main) {
	runCLI().catch(async (error) => {
		// Create logger for error handling
		const logger = createLoggerFromConfig({
			debug: !!process.env.DEBUG,
			verbose: !!process.env.VERBOSE,
			component: "CLI",
		});

		if (error instanceof AtomicCodegenError) {
			await logger.error("Command failed", error, undefined, "main");

			// Show formatted error message for better UX
			console.error("\n" + error.getFormattedMessage());
		} else {
			await logger.error("Unexpected error occurred", error, undefined, "main");
			console.error("Unexpected error:", error.message);
		}

		process.exit(1);
	});
}
