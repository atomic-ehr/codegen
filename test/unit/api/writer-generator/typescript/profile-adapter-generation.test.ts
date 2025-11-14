import { describe, expect, test } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import type { ProfileTypeSchema } from "@root/typeschema/types";

describe("Profile Adapter Generation (Integration)", () => {
	test("generates adapter class for simple profile", async () => {
		const mockProfile: ProfileTypeSchema = {
			identifier: {
				kind: "profile",
				name: "TestProfile",
				url: "http://example.org/StructureDefinition/test-profile",
				package: "test.package",
				version: "1.0.0",
			},
			base: {
				kind: "resource",
				name: "Patient",
				url: "http://hl7.org/fhir/StructureDefinition/Patient",
				package: "hl7.fhir.r4.core",
				version: "4.0.1",
			},
			fields: {
				birthDate: {
					type: {
						kind: "primitive-type",
						name: "date",
						url: "http://hl7.org/fhir/StructureDefinition/date",
						package: "hl7.fhir.r4.core",
						version: "4.0.1",
					},
					required: true,
					array: false,
					excluded: false,
				},
			},
		};

		const api = await new APIBuilder({
			outputDir: ".tmp/profile-adapter-test",
		}).loadSchemas([mockProfile]);

		// Generate TypeScript code
		await api.typescript();

		// Check that files were generated
		const generatedFile = Bun.file(
			".tmp/profile-adapter-test/test-package/test-profile.ts",
		);
		const exists = await generatedFile.exists();
		expect(exists).toBe(true);

		if (exists) {
			const content = await generatedFile.text();

			// Verify adapter class structure
			expect(content).toContain("export class TestProfile");
			expect(content).toContain("static readonly profileUrl");
			expect(content).toContain(
				"http://example.org/StructureDefinition/test-profile",
			);
			expect(content).toContain("constructor(private _resource: Patient)");
			expect(content).toContain("get resource(): Patient");

			// Verify field accessor
			expect(content).toContain("get birthDate()");
			expect(content).toContain("set birthDate(value:");

			// Verify factory function
			expect(content).toContain("export function TestProfile(resource?:");
			expect(content).toContain("return new TestProfile(actual)");
		}
	});
});
