#!/usr/bin/env bun

/**
 * Atomic Codegen CLI - Simplified High-Level API
 *
 * Clean, performant CLI with only essential commands:
 * - typeschema: Create and manage TypeSchema files
 * - generate: Generate code from TypeSchema
 * - dev: Development utilities
 */

import { runCLI } from "./commands";

// Export the simplified CLI

if (import.meta.main) {
	runCLI().catch((error) => {
		console.error("CLI Error:", error instanceof Error ? error.message : error);
		process.exit(1);
	});
}
