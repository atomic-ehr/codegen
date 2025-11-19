import { typeSchemaInfo } from "@root/api/writer-generator/utils";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import type { Writer } from "@root/api/writer-generator/writer";
import type { ProfileTypeSchema } from "@root/typeschema/types";
import {
	isChoiceDeclarationField,
	isNestedIdentifier,
	isNotChoiceDeclarationField,
	isPrimitiveIdentifier,
	isSpecializationTypeSchema,
} from "@root/typeschema/types";
import {
	resolvePrimitiveType,
	tsFieldName,
	tsGet,
	tsResourceName,
} from "./utils";

/**
 * Generate profile interface (current implementation)
 * NOTE: This will be replaced with adapter class in Task 4
 */
export function generateProfileType(
	writer: Writer,
	tsIndex: TypeSchemaIndex,
	flatProfile: ProfileTypeSchema,
): void {
	writer.debugComment("flatProfile", flatProfile);
	const tsName = tsResourceName(flatProfile.identifier);
	writer.debugComment("identifier", flatProfile.identifier);
	writer.debugComment("base", flatProfile.base);

	writer.curlyBlock(["export", "interface", tsName], () => {
		writer.lineSM(`__profileUrl: "${flatProfile.identifier.url}"`);
		writer.line();

		for (const [fieldName, field] of Object.entries(
			flatProfile.fields ?? {},
		)) {
			if (isChoiceDeclarationField(field)) continue;
			writer.debugComment(fieldName, field);

			const tsName = tsFieldName(fieldName);

			let tsType: string;
			if (field.enum) {
				tsType = field.enum.map((e) => `'${e}'`).join(" | ");
			} else if (field.reference && field.reference.length > 0) {
				const specialization = tsIndex.findLastSpecialization(flatProfile);
				if (!isSpecializationTypeSchema(specialization)) {
					throw new Error(`Invalid specialization for ${flatProfile.identifier}`);
				}

				const sField = specialization.fields?.[fieldName];
				if (
					sField === undefined ||
					isChoiceDeclarationField(sField) ||
					sField.reference === undefined
				) {
					throw new Error(`Invalid field declaration for ${fieldName}`);
				}

				const sRefs = sField.reference.map((e) => e.name);
				const references = field.reference
					.map((ref) => {
						const resRef = tsIndex.findLastSpecializationByIdentifier(ref);
						if (resRef.name !== ref.name) {
							return `"${resRef.name}" /*${ref.name}*/`;
						}
						return `'${ref.name}'`;
					})
					.join(" | ");

				if (
					sRefs.length === 1 &&
					sRefs[0] === "Resource" &&
					references !== '"Resource"'
				) {
					// FIXME: should be generalized to type families
					tsType = `Reference<"Resource" /* ${references} */ >`;
				} else {
					tsType = `Reference<${references}>`;
				}
			} else if (isNestedIdentifier(field.type)) {
				tsType = tsResourceName(field.type);
			} else if (isPrimitiveIdentifier(field.type)) {
				tsType = resolvePrimitiveType(field.type.name);
			} else if (field.type === undefined) {
				throw new Error(
					`Undefined type for '${fieldName}' field at ${typeSchemaInfo(flatProfile)}`,
				);
			} else {
				tsType = field.type.name;
			}

			writer.lineSM(
				`${tsName}${!field.required ? "?" : ""}: ${tsType}${field.array ? "[]" : ""}`,
			);
		}
	});

	writer.line();
}

/**
 * Generate attachProfile helper function
 * NOTE: Will be replaced with factory function in Task 4
 */
export function generateAttachProfile(
	writer: Writer,
	flatProfile: ProfileTypeSchema,
): void {
	const tsBaseResourceName = tsResourceName(flatProfile.base);
	const tsProfileName = tsResourceName(flatProfile.identifier);
	const profileFields = Object.entries(flatProfile.fields || {})
		.filter(([_fieldName, field]) => {
			return field && isNotChoiceDeclarationField(field) && field.type !== undefined;
		})
		.map(([fieldName]) => tsFieldName(fieldName));

	writer.curlyBlock(
		[
			`export const attach_${tsProfileName}_to_${tsBaseResourceName} =`,
			`(resource: ${tsBaseResourceName}, profile: ${tsProfileName}): ${tsBaseResourceName}`,
			"=>",
		],
		() => {
			writer.curlyBlock(["return"], () => {
				writer.line("...resource,");
				// FIXME: don't rewrite all profiles
				writer.curlyBlock(["meta:"], () => {
					writer.line(`profile: ['${flatProfile.identifier.url}']`);
				}, [","]);
				for (const fieldName of profileFields) {
					writer.line(`${fieldName}: ${tsGet("profile", fieldName)},`);
				}
			});
		},
	);
	writer.line();
}

/**
 * Generate extractProfile helper function
 * NOTE: Will be removed in Task 4 (not needed for adapter pattern)
 */
export function generateExtractProfile(
	writer: Writer,
	tsIndex: TypeSchemaIndex,
	flatProfile: ProfileTypeSchema,
): void {
	const tsBaseResourceName = tsResourceName(flatProfile.base);
	const tsProfileName = tsResourceName(flatProfile.identifier);

	const profileFields = Object.entries(flatProfile.fields || {})
		.filter(([_fieldName, field]) => {
			return isNotChoiceDeclarationField(field) && field.type !== undefined;
		})
		.map(([fieldName]) => fieldName);

	const specialization = tsIndex.findLastSpecialization(flatProfile);
	if (!isSpecializationTypeSchema(specialization)) {
		throw new Error(
			`Specialization not found for ${flatProfile.identifier.url}`,
		);
	}

	const shouldCast: Record<string, boolean> = {};
	writer.curlyBlock(
		[
			`export const extract_${tsProfileName}_from_${tsBaseResourceName} =`,
			`(resource: ${tsBaseResourceName}): ${tsProfileName}`,
			"=>",
		],
		() => {
			for (const fieldName of profileFields) {
				const tsField = tsFieldName(fieldName);
				const pField = flatProfile.fields?.[fieldName];
				const rField = specialization.fields?.[fieldName];
				if (
					!isNotChoiceDeclarationField(pField) ||
					!isNotChoiceDeclarationField(rField)
				)
					continue;

				if (pField.required && !rField.required) {
					writer.curlyBlock([`if (${tsGet("resource", tsField)} === undefined)`], () =>
						writer.lineSM(
							`throw new Error("'${tsField}' is required for ${flatProfile.identifier.url}")`,
						),
					);
				}

				const pRefs = pField?.reference?.map((ref) => ref.name);
				const rRefs = rField?.reference?.map((ref) => ref.name);
				if (pRefs && rRefs && pRefs.length !== rRefs.length) {
					const predName = `reference_is_valid_${tsField}`;
					writer.curlyBlock(["const", predName, "=", "(ref?: Reference)", "=>"], () => {
						writer.line("return !ref");
						writer.indentBlock(() => {
							for (const ref of rRefs) {
								writer.line(`|| ref.reference?.startsWith('${ref}/')`);
							}
							writer.line(";");
						});
					});
					let cond: string = !pField?.required
						? `!${tsGet("resource", tsField)} || `
						: "";
					if (pField.array) {
						cond += `${tsGet("resource", tsField)}.every( (ref) => ${predName}(ref) )`;
					} else {
						cond += `!${predName}(${tsGet("resource", tsField)})`;
					}
					writer.curlyBlock(["if (", cond, ")"], () => {
						writer.lineSM(
							`throw new Error("'${fieldName}' has different references in profile and specialization")`,
						);
					});
					writer.line();
					shouldCast[fieldName] = true;
				}
			}
			writer.curlyBlock(["return"], () => {
				writer.line(`__profileUrl: '${flatProfile.identifier.url}',`);
				for (const fieldName of profileFields) {
					const tsField = tsFieldName(fieldName);
					if (shouldCast[fieldName]) {
						writer.line(
							`${tsField}:`,
							`${tsGet("resource", tsField)} as ${tsProfileName}['${tsField}'],`,
						);
					} else {
						writer.line(`${tsField}:`, `${tsGet("resource", tsField)},`);
					}
				}
			});
		},
	);
}
