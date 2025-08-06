/**
 * Tests for naming utilities
 */

import { expect, test, describe } from "bun:test";
import { 
    toValidInterfaceName, 
    toValidFileName, 
    toCamelCase, 
    toSnakeCase,
    testCases 
} from "../src/lib/utils/naming";

describe("Naming Utilities", () => {
    
    describe("toValidInterfaceName", () => {
        test("should handle test cases correctly", () => {
            // Test the most important cases manually 
            expect(toValidInterfaceName("ADXP-careOf")).toBe("ADXPCareOf");
            expect(toValidInterfaceName("AD-use")).toBe("ADUse");
            expect(toValidInterfaceName("Actual Group")).toBe("ActualGroup");
            expect(toValidInterfaceName("activity-title")).toBe("ActivityTitle");
            expect(toValidInterfaceName("observation-bp")).toBe("ObservationBp");
        });

        test("should handle edge cases", () => {
            expect(toValidInterfaceName("")).toBe("Unknown");
            expect(toValidInterfaceName("   ")).toBe("Unknown");
            expect(toValidInterfaceName("123")).toBe("I123");
            expect(toValidInterfaceName("$valid")).toBe("IValid"); // $ gets replaced
            expect(toValidInterfaceName("_valid")).toBe("IValid"); // _ gets replaced
        });

        test("should preserve existing PascalCase", () => {
            expect(toValidInterfaceName("MyValidInterface")).toBe("MyValidInterface");
            expect(toValidInterfaceName("XMLHttpRequest")).toBe("XMLHttpRequest");
        });

        test("should handle special characters", () => {
            expect(toValidInterfaceName("name@domain.com")).toBe("NameDomainCom");
            expect(toValidInterfaceName("hello/world")).toBe("HelloWorld");
            expect(toValidInterfaceName("test(1)")).toBe("Test1");
        });
    });

    describe("toValidFileName", () => {
        test("should convert to kebab-case", () => {
            expect(toValidFileName("ADXP-careOf")).toBe("adxp-careof");
            expect(toValidFileName("Actual Group")).toBe("actual-group");
            expect(toValidFileName("activity_title")).toBe("activity-title");
        });

        test("should handle edge cases", () => {
            expect(toValidFileName("")).toBe("unknown");
            expect(toValidFileName("   ")).toBe("unknown");
            expect(toValidFileName("---")).toBe("unknown");
        });
    });

    describe("toCamelCase", () => {
        test("should convert to camelCase", () => {
            expect(toCamelCase("ADXP-careOf")).toBe("adxpCareOf");
            expect(toCamelCase("Actual Group")).toBe("actualGroup");
            expect(toCamelCase("activity-title")).toBe("activityTitle");
        });
    });

    describe("toSnakeCase", () => {
        test("should convert to snake_case", () => {
            expect(toSnakeCase("ADXP-careOf")).toBe("adxp_care_of");
            expect(toSnakeCase("Actual Group")).toBe("actual_group");
            expect(toSnakeCase("ActivityTitle")).toBe("activity_title");
        });
    });
});