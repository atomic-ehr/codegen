/**
 * Profile Factory Function Generation
 *
 * Generates factory functions for creating profile adapter instances.
 * Factory functions provide convenient creation with automatic meta.profile setup.
 */

import type { Writer } from "@root/api/writer-generator/writer";
import type { ProfileTypeSchema } from "@root/typeschema/types";
import { tsResourceName } from "./utils";

/**
 * Generate factory function for profile adapter
 *
 * Provides convenient creation:
 * ```typescript
 * // Create new resource with profile
 * const patient = USCorePatient();
 *
 * // Wrap existing resource
 * const patient = USCorePatient(existingPatient);
 * ```
 */
export function generateProfileFactory(
	writer: Writer,
	profile: ProfileTypeSchema,
): void {
	const className = tsResourceName(profile.identifier);
	const baseResourceName = tsResourceName(profile.base);
	const functionName = className; // Same name as class (uses function/class overloading)

	writer.comment("Factory function for " + className);
	writer.comment(
		"Creates new resource or wraps existing one with profile adapter",
	);
	writer.line();

	// Function signature
	writer.curlyBlock(
		[
			"export",
			"function",
			functionName + "(resource?:",
			baseResourceName,
			"):",
			className,
		],
		() => {
			// Create or use provided resource
			writer.comment("Create minimal resource if not provided");
			writer.curlyBlock(["const actual = resource ??"], () => {
				writer.lineSM('resourceType: "' + profile.base.name + '" as const,');
				writer.lineSM("meta: { profile: [] },");
			});
			writer.line();

			// Ensure meta structure exists
			writer.comment("Ensure meta structure exists");
			writer.curlyBlock(["if (!actual.meta)"], () => {
				writer.lineSM("actual.meta = {}");
			});
			writer.curlyBlock(["if (!actual.meta.profile)"], () => {
				writer.lineSM("actual.meta.profile = []");
			});
			writer.line();

			// Add profile URL if not present
			writer.comment("Add profile URL to meta.profile if not present");
			writer.curlyBlock(
				["if (!actual.meta.profile.includes(", className, ".profileUrl))"],
				() => {
					writer.lineSM("actual.meta.profile.push(" + className + ".profileUrl)");
				},
			);
			writer.line();

			// Return adapter instance
			writer.lineSM("return new " + className + "(actual)");
		},
	);
}
