import { describe, expect, it } from "bun:test";
import { compareCollisionVariants } from "@root/typeschema/collision-order";

describe("collision ordering", () => {
    const variants = [
        {
            id: "more-sources",
            schemaHash: "c",
            sources: [
                { sourcePackage: "pkg#1", sourceCanonical: "http://example.org/z" },
                { sourcePackage: "pkg#1", sourceCanonical: "http://example.org/y" },
            ],
        },
        {
            id: "source-tie-break",
            schemaHash: "b",
            sources: [{ sourcePackage: "pkg#1", sourceCanonical: "http://example.org/a" }],
        },
        {
            id: "hash-tie-break",
            schemaHash: "a",
            sources: [{ sourcePackage: "pkg#1", sourceCanonical: "http://example.org/a" }],
        },
    ];

    it("orders variants independently of discovery order", () => {
        const forward = [...variants].sort(compareCollisionVariants).map((variant) => variant.id);
        const reversed = [...variants]
            .reverse()
            .sort(compareCollisionVariants)
            .map((variant) => variant.id);

        expect(forward).toEqual(["more-sources", "hash-tie-break", "source-tie-break"]);
        expect(reversed).toEqual(forward);
    });
});
