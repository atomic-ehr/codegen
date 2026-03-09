import { beforeEach, describe, expect, it, mock } from "bun:test";
import { type ExtendLogManager, type LogEntry, type LogManager, mkLogger } from "@root/utils/log";

type BufferFilter<T extends string> = { level?: string; tag?: T; suppressed?: boolean };

const bufferFilter = <T extends string>(logger: LogManager<T>, filter: BufferFilter<T>): LogEntry<T>[] =>
    logger.buffer().filter((e) => {
        if (filter.level !== undefined && e.level !== filter.level) return false;
        if (filter.tag !== undefined && e.tag !== filter.tag) return false;
        if (filter.suppressed !== undefined && e.suppressed !== filter.suppressed) return false;
        return true;
    });

type TestTags = "TAG_A" | "TAG_B" | "TAG_C";

describe("mkLogger", () => {
    let logger: LogManager<TestTags>;

    beforeEach(() => {
        logger = mkLogger<TestTags>({ prefix: "test" });
        mock.module("console", () => ({})); // silence console in tests
    });

    describe("untagged logging", () => {
        it("buffers info messages", () => {
            logger.info("hello");
            const entry = logger.buffer()[0];
            expect(entry).toBeDefined();
            expect(entry?.level).toBe("INFO");
            expect(entry?.message).toBe("hello");
            expect(entry?.tag).toBeUndefined();
            expect(entry?.suppressed).toBe(false);
            expect(entry?.prefix).toBe("test");
        });

        it("untagged messages are never suppressed", () => {
            const l = mkLogger<TestTags>({ suppressTags: ["TAG_A", "TAG_B", "TAG_C"] });
            l.info("still visible");
            l.warn("still visible");
            l.error("still visible");
            l.debug("still visible");
            expect(bufferFilter(l, { suppressed: true })).toHaveLength(0);
            expect(l.buffer()).toHaveLength(4);
        });
    });

    describe("tagged logging", () => {
        it("buffers tagged messages with tag field set", () => {
            logger.info("TAG_A", "tagged info");
            const entry = logger.buffer()[0];
            expect(entry).toBeDefined();
            expect(entry?.tag).toBe("TAG_A");
            expect(entry?.message).toBe("tagged info");
            expect(entry?.level).toBe("INFO");
        });

        it("works for all log levels", () => {
            logger.info("TAG_A", "i");
            logger.warn("TAG_B", "w");
            logger.error("TAG_C", "e");
            logger.debug("TAG_A", "d");
            expect(logger.buffer().map((e) => e.level)).toEqual(["INFO", "WARN", "ERROR", "DEBUG"]);
            expect(logger.buffer().every((e) => e.tag !== undefined)).toBe(true);
        });

        it("increments tag counts", () => {
            logger.warn("TAG_A", "one");
            logger.warn("TAG_A", "two");
            logger.info("TAG_B", "three");
            expect(logger.tagCounts().TAG_A).toBe(2);
            expect(logger.tagCounts().TAG_B).toBe(1);
            expect(logger.tagCounts().TAG_C).toBeUndefined();
        });

        it("does not increment tag counts for untagged messages", () => {
            logger.info("no tag");
            expect(Object.keys(logger.tagCounts())).toHaveLength(0);
        });
    });

    describe("suppression", () => {
        it("suppresses tagged messages matching suppressTags", () => {
            const l = mkLogger<TestTags>({ suppressTags: ["TAG_A"] });
            l.warn("TAG_A", "suppressed");
            l.warn("TAG_B", "visible");

            expect(l.buffer()).toHaveLength(2);
            expect(l.buffer()[0]?.suppressed).toBe(true);
            expect(l.buffer()[1]?.suppressed).toBe(false);
        });

        it("still counts suppressed tags", () => {
            const l = mkLogger<TestTags>({ suppressTags: ["TAG_A"] });
            l.warn("TAG_A", "one");
            l.warn("TAG_A", "two");
            expect(l.tagCounts().TAG_A).toBe(2);
        });
    });

    describe("dryWarn deduplication", () => {
        it("deduplicates identical tag+message pairs", () => {
            logger.dryWarn("TAG_A", "same");
            logger.dryWarn("TAG_A", "same");
            logger.dryWarn("TAG_A", "same");
            // all 3 buffered
            expect(logger.buffer()).toHaveLength(3);
            // but only 1 was not suppressed (the first), the rest are deduped at console level
            // all are marked suppressed=false since TAG_A is not in suppressTags
            expect(bufferFilter(logger, { suppressed: false })).toHaveLength(3);
            expect(logger.tagCounts().TAG_A).toBe(3);
        });

        it("different messages are not deduped", () => {
            logger.dryWarn("TAG_A", "msg1");
            logger.dryWarn("TAG_A", "msg2");
            expect(logger.buffer()).toHaveLength(2);
        });

        it("same message with different tags are not deduped", () => {
            logger.dryWarn("TAG_A", "same");
            logger.dryWarn("TAG_B", "same");
            expect(logger.buffer()).toHaveLength(2);
        });

        it("untagged dryWarn deduplicates by message", () => {
            logger.dryWarn("same msg");
            logger.dryWarn("same msg");
            logger.dryWarn("different msg");
            expect(logger.buffer()).toHaveLength(3);
        });
    });

    describe("fork", () => {
        it("creates child with combined prefix", () => {
            const child = logger.fork("child");
            child.info("hello");
            expect(child.buffer()[0]?.prefix).toBe("test/child");
        });

        it("creates child from root without parent prefix", () => {
            const root = mkLogger<TestTags>({});
            const child = root.fork("child");
            child.info("hello");
            expect(child.buffer()[0]?.prefix).toBe("child");
        });

        it("inherits parent suppressTags", () => {
            const parent = mkLogger<TestTags>({ suppressTags: ["TAG_A"] });
            const child = parent.fork("child");
            child.warn("TAG_A", "inherited suppression");
            expect(child.buffer()[0]?.suppressed).toBe(true);
        });

        it("adds child-specific suppressTags", () => {
            const parent = mkLogger<TestTags>({ suppressTags: ["TAG_A"] });
            const child = parent.fork("child", { suppressTags: ["TAG_B"] });
            child.warn("TAG_A", "from parent");
            child.warn("TAG_B", "from child");
            child.warn("TAG_C", "not suppressed");
            expect(bufferFilter(child, { suppressed: true })).toHaveLength(2);
            expect(child.buffer()[2]?.suppressed).toBe(false);
        });

        it("child has independent buffer", () => {
            const child = logger.fork("child");
            logger.info("parent");
            child.info("child");
            expect(logger.buffer()).toHaveLength(1);
            expect(child.buffer()).toHaveLength(1);
            expect(logger.buffer()[0]?.message).toBe("parent");
            expect(child.buffer()[0]?.message).toBe("child");
        });

        it("child has independent tag counts", () => {
            const child = logger.fork("child");
            logger.warn("TAG_A", "parent");
            child.warn("TAG_A", "child");
            child.warn("TAG_A", "child2");
            expect(logger.tagCounts().TAG_A).toBe(1);
            expect(child.tagCounts().TAG_A).toBe(2);
        });

        it("narrows tag set via as()", () => {
            type Narrow = "TAG_A";
            const child = logger.fork("narrow").as<Narrow>();
            child.warn("TAG_A", "valid");
            expect(child.buffer()[0]?.tag).toBe("TAG_A");
        });
    });

    describe("as (narrowing)", () => {
        it("returns the same logger instance with narrowed type", () => {
            type Narrow = "TAG_A" | "TAG_B";
            const narrow = logger.as<Narrow>();
            narrow.warn("TAG_A", "works");
            expect(logger.buffer()).toHaveLength(1);
            expect(narrow.buffer()).toHaveLength(1);
        });

        it("narrowed logger inherits suppression from original", () => {
            const parent = mkLogger<TestTags>({ suppressTags: ["TAG_A"] });
            type Narrow = "TAG_A";
            const narrow = parent.as<Narrow>();
            narrow.warn("TAG_A", "suppressed via parent");
            expect(narrow.buffer()[0]?.suppressed).toBe(true);
        });
    });

    describe("ExtendLogManager (extending)", () => {
        type BaseTags = "BASE_A" | "BASE_B";
        type ExtraTags = "EXTRA_X" | "EXTRA_Y";
        type Combined = ExtendLogManager<ExtraTags, LogManager<BaseTags>>;

        it("extended logger accepts both base and extra tags", () => {
            const l: Combined = mkLogger<BaseTags | ExtraTags>({});
            l.warn("BASE_A", "base tag");
            l.warn("EXTRA_X", "extra tag");
            expect(l.buffer()).toHaveLength(2);
            expect(l.buffer()[0]?.tag).toBe("BASE_A");
            expect(l.buffer()[1]?.tag).toBe("EXTRA_X");
        });

        it("extended logger suppresses both base and extra tags", () => {
            const l: Combined = mkLogger<BaseTags | ExtraTags>({
                suppressTags: ["BASE_A", "EXTRA_X"],
            });
            l.warn("BASE_A", "suppressed base");
            l.warn("BASE_B", "visible base");
            l.warn("EXTRA_X", "suppressed extra");
            l.warn("EXTRA_Y", "visible extra");
            expect(bufferFilter(l, { suppressed: true })).toHaveLength(2);
            expect(bufferFilter(l, { suppressed: false })).toHaveLength(2);
        });

        it("base logger can be passed where extended is expected via as()", () => {
            const base = mkLogger<BaseTags>({});
            const extended = base.as<BaseTags | ExtraTags>();
            extended.warn("EXTRA_X", "works at runtime");
            expect(base.buffer()).toHaveLength(1);
            expect(extended.buffer()[0]?.tag).toBe("EXTRA_X");
        });

        it("fork from extended logger can narrow to base tags", () => {
            const extended: Combined = mkLogger<BaseTags | ExtraTags>({
                prefix: "root",
                suppressTags: ["BASE_A"],
            });
            const child = extended.fork("child").as<BaseTags>();
            child.warn("BASE_A", "suppressed from parent");
            child.warn("BASE_B", "visible");
            expect(bufferFilter(child, { suppressed: true })).toHaveLength(1);
            expect(child.buffer()[0]?.tag).toBe("BASE_A");
            expect(child.buffer()[1]?.prefix).toBe("root/child");
        });
    });

    describe("buffer", () => {
        it("returns entries in insertion order", () => {
            logger.info("first");
            logger.warn("second");
            logger.error("third");
            expect(logger.buffer().map((e) => e.message)).toEqual(["first", "second", "third"]);
        });

        it("includes timestamp", () => {
            const before = Date.now();
            logger.info("timed");
            const after = Date.now();
            const ts = logger.buffer()[0]?.timestamp;
            expect(ts).toBeGreaterThanOrEqual(before);
            expect(ts).toBeLessThanOrEqual(after);
        });
    });

    describe("bufferFilter", () => {
        beforeEach(() => {
            const l = mkLogger<TestTags>({ prefix: "f", suppressTags: ["TAG_C"] });
            l.info("untagged info");
            l.warn("TAG_A", "tagged warn");
            l.error("TAG_B", "tagged error");
            l.debug("untagged debug");
            l.info("TAG_C", "suppressed info");
            logger = l;
        });

        it("filters by level", () => {
            expect(bufferFilter(logger, { level: "INFO" })).toHaveLength(2);
            expect(bufferFilter(logger, { level: "WARN" })).toHaveLength(1);
            expect(bufferFilter(logger, { level: "ERROR" })).toHaveLength(1);
            expect(bufferFilter(logger, { level: "DEBUG" })).toHaveLength(1);
        });

        it("filters by tag", () => {
            expect(bufferFilter(logger, { tag: "TAG_A" })).toHaveLength(1);
            expect(bufferFilter(logger, { tag: "TAG_B" })).toHaveLength(1);
            expect(bufferFilter(logger, { tag: "TAG_C" })).toHaveLength(1);
        });

        it("filters by suppressed", () => {
            expect(bufferFilter(logger, { suppressed: true })).toHaveLength(1);
            expect(bufferFilter(logger, { suppressed: false })).toHaveLength(4);
        });

        it("combines filters", () => {
            expect(bufferFilter(logger, { level: "INFO", suppressed: true })).toHaveLength(1);
            expect(bufferFilter(logger, { level: "INFO", suppressed: false })).toHaveLength(1);
            expect(bufferFilter(logger, { level: "WARN", tag: "TAG_A" })).toHaveLength(1);
            expect(bufferFilter(logger, { level: "WARN", tag: "TAG_B" })).toHaveLength(0);
        });
    });

    describe("bufferClear", () => {
        it("empties the buffer", () => {
            logger.info("a");
            logger.warn("b");
            expect(logger.buffer()).toHaveLength(2);
            logger.bufferClear();
            expect(logger.buffer()).toHaveLength(0);
        });

        it("does not reset tag counts", () => {
            logger.warn("TAG_A", "msg");
            logger.bufferClear();
            expect(logger.tagCounts().TAG_A).toBe(1);
        });
    });

    describe("printTagSummary", () => {
        it("prints warning summary with all tag counts", () => {
            const l = mkLogger<TestTags>({ prefix: "test", suppressTags: ["TAG_A"] });
            l.warn("TAG_A", "a1");
            l.warn("TAG_A", "a2");
            l.warn("TAG_B", "b1");
            l.printTagSummary();
            // printTagSummary writes directly to console, doesn't buffer
            expect(l.tagCounts().TAG_A).toBe(2);
            expect(l.tagCounts().TAG_B).toBe(1);
        });

        it("does nothing when no tags exist", () => {
            logger.info("no tags");
            logger.printTagSummary();
            // no crash, no extra output
        });
    });

    describe("prefix", () => {
        it("uses empty prefix by default", () => {
            const l = mkLogger<TestTags>({});
            l.info("msg");
            expect(l.buffer()[0]?.prefix).toBe("");
        });

        it("nests prefixes through multiple forks", () => {
            const child = logger.fork("a").fork("b");
            child.info("deep");
            expect(child.buffer()[0]?.prefix).toBe("test/a/b");
        });
    });

    describe("log level filtering", () => {
        it("defaults to info level (debug messages not printed but buffered)", () => {
            const l = mkLogger<TestTags>({});
            l.debug("hidden");
            l.info("visible");
            expect(l.buffer()).toHaveLength(2);
        });

        it("filters messages below configured level", () => {
            const l = mkLogger<TestTags>({ level: "WARN" });
            l.debug("d");
            l.info("i");
            l.warn("w");
            l.error("e");
            // all 4 buffered
            expect(l.buffer()).toHaveLength(4);
        });

        it("fork inherits parent level", () => {
            const parent = mkLogger<TestTags>({ level: "WARN" });
            const child = parent.fork("child");
            child.debug("d");
            child.info("i");
            child.warn("w");
            expect(child.buffer()).toHaveLength(3);
        });

        it("fork can override parent level", () => {
            const parent = mkLogger<TestTags>({ level: "WARN" });
            const child = parent.fork("child", { level: "DEBUG" });
            child.debug("d");
            expect(child.buffer()).toHaveLength(1);
        });

        it("level filtering works alongside tag suppression", () => {
            const l = mkLogger<TestTags>({ level: "WARN", suppressTags: ["TAG_A"] });
            l.info("TAG_A", "suppressed + below level");
            l.warn("TAG_A", "suppressed at level");
            l.warn("TAG_B", "visible");
            expect(l.buffer()).toHaveLength(3);
            expect(bufferFilter(l, { suppressed: true })).toHaveLength(2);
        });

        it("silent level suppresses all console output but still buffers", () => {
            const l = mkLogger<TestTags>({ level: "SILENT" });
            l.debug("d");
            l.info("i");
            l.warn("w");
            l.error("e");
            expect(l.buffer()).toHaveLength(4);
        });
    });
});
