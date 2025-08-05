#!/usr/bin/env bun

/**
 * Atomic Codegen CLI - Modern Command Structure
 *
 * Main entry point for the atomic-codegen CLI tool
 */

// Re-export the new CLI entry point
export { createCLI, runCLI } from "./commands";

// Import and run CLI if this file is executed directly
import { runCLI } from "./commands";

if (import.meta.main) {
	runCLI().catch((error) => {
		console.error("Unexpected error:", error.message);
		if (process.env.DEBUG) {
			console.error(error.stack);
		}
		process.exit(1);
	});
}
