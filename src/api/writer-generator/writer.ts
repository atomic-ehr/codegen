import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as Path from "node:path";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import type { Logger } from "@root/utils/logger";

export type FileSystemWriterOptions = {
    outputDir: string;
    inMemoryOnly?: boolean;
    logger?: Logger;
    resolveAssets?: (fn: string) => string;
};

export type WriterOptions = FileSystemWriterOptions & {
    tabSize: number;
    withDebugComment?: boolean;
    commentLinePrefix: string;
    generateProfile?: boolean;
};

type FileBufferInternal = { relPath: string; absPath: string; tokens: string[] };
export type FileBuffer = { relPath: string; absPath: string; content: string };

export abstract class FileSystemWriter<T extends FileSystemWriterOptions = FileSystemWriterOptions> {
    opts: T;
    currentDir?: string;
    currentFile?: { relPath: string; descriptor: number };
    writtenFilesBuffer: Record<string, FileBufferInternal> = {};

    constructor(opts: T) {
        this.opts = opts;
    }

    setOutputDir(path: string) {
        if (this.currentDir) throw new Error("Can't change output dir while writing");
        this.opts.outputDir = path;
    }

    logger(): Logger | undefined {
        return this.opts.logger;
    }

    onDiskMkDir(path: string) {
        if (this.opts.inMemoryOnly) return;
        if (!fs.existsSync(path)) {
            fs.mkdirSync(path, { recursive: true });
        }
    }

    onDiskOpenFile(relPath: string): number {
        if (this.opts.inMemoryOnly) return -1;
        return fs.openSync(relPath, "w");
    }

    onDiskCloseFile(descriptor: number) {
        if (this.opts.inMemoryOnly) return;
        fs.fsyncSync(descriptor);
        fs.closeSync(descriptor);
    }

    onDiskWrite(descriptor: number, token: string) {
        if (this.opts.inMemoryOnly) return;
        fs.writeSync(descriptor, token);
    }

    cd(path: string, gen: () => void) {
        const prev = this.currentDir;
        this.currentDir = path.startsWith("/")
            ? Path.join(this.opts.outputDir, path)
            : Path.join(this.currentDir ?? this.opts.outputDir, path);
        this.onDiskMkDir(this.currentDir);
        this.logger()?.debug(`cd '${this.currentDir}'`);
        gen();
        this.currentDir = prev;
    }

    cat(fn: string, gen: () => void) {
        if (!this.currentDir) throw new Error("Should be in a directory (`cd`)");
        if (this.currentFile) throw new Error("Can't open file when another file is open");
        if (fn.includes("/")) throw new Error(`Change file path separatly: ${fn}`);

        const relPath = Path.normalize(`${this.currentDir}/${fn}`);

        if (this.writtenFilesBuffer[relPath]) {
            this.logger()?.warn(`File will be rewritten '${relPath}'`);
            this.logger()?.debug(`File content: ${this.writtenFilesBuffer[relPath].tokens.join("")}`);
        }

        try {
            const descriptor = this.onDiskOpenFile(relPath);

            this.logger()?.debug(`cat > '${relPath}'`);
            this.currentFile = { descriptor, relPath };
            this.writtenFilesBuffer[this.currentFile.relPath] = {
                relPath,
                absPath: Path.resolve(relPath),
                tokens: [],
            };

            gen();
        } finally {
            if (this.currentFile) this.onDiskCloseFile(this.currentFile.descriptor);
            this.currentFile = undefined;
        }
    }

    write(str: string) {
        if (!this.currentFile) throw new Error("No file opened");
        this.onDiskWrite(this.currentFile.descriptor, str);

        const buf = this.writtenFilesBuffer[this.currentFile.relPath];
        if (!buf) throw new Error("No buffer found");
        buf.tokens.push(str);
    }

    copyAssets(source: string, destination: string) {
        const content = fs.readFileSync(source, "utf8");
        this.writtenFilesBuffer[destination] = {
            relPath: destination,
            absPath: Path.resolve(destination),
            tokens: [content],
        };
        fs.cpSync(source, destination);
    }

    cp(source: string, destination: string) {
        if (!this.opts.resolveAssets) throw new Error("resolveAssets is not defined");
        source = Path.resolve(this.opts.resolveAssets(source));
        destination = Path.normalize(`${this.currentDir ?? this.opts.outputDir}/${destination}`);
        const content = fs.readFileSync(source, "utf8");
        this.writtenFilesBuffer[destination] = {
            relPath: destination,
            absPath: Path.resolve(destination),
            tokens: [content],
        };
        fs.cpSync(source, destination);
    }

    abstract generate(_tsIndex: TypeSchemaIndex): Promise<void>;

    writtenFiles(): FileBuffer[] {
        return Object.values(this.writtenFilesBuffer)
            .map(({ relPath, absPath, tokens }) => {
                return { relPath, absPath, content: tokens.join("") };
            })
            .sort((a, b) => a.relPath.localeCompare(b.relPath));
    }

    async flushAsync(): Promise<void> {
        const files = this.writtenFiles();
        const dirs = new Set<string>();

        for (const file of files) {
            dirs.add(Path.dirname(file.absPath));
        }

        await Promise.all(Array.from(dirs).map((dir) => fsPromises.mkdir(dir, { recursive: true })));

        await Promise.all(files.map((file) => fsPromises.writeFile(file.absPath, file.content)));
    }

    async generateAsync(tsIndex: TypeSchemaIndex): Promise<void> {
        const originalInMemoryOnly = this.opts.inMemoryOnly;
        this.opts.inMemoryOnly = true;

        try {
            await this.generate(tsIndex);
        } finally {
            this.opts.inMemoryOnly = originalInMemoryOnly;
        }

        await this.flushAsync();
    }
}

export abstract class Writer<T extends WriterOptions = WriterOptions> extends FileSystemWriter<T> {
    currentIndent: number = 0;

    private indent() {
        this.currentIndent += this.opts.tabSize;
    }

    private deindent() {
        this.currentIndent -= this.opts.tabSize;
    }

    private writeIndent() {
        this.write(" ".repeat(this.currentIndent));
    }

    line(...tokens: string[]) {
        if (tokens.length === 0) {
            this.write("\n");
        } else {
            this.writeIndent();
            this.write(`${tokens.join(" ")}\n`);
        }
    }

    lineSM(...tokens: string[]) {
        this.writeIndent();
        this.write(`${tokens.join(" ")};\n`);
    }

    comment(...tokens: string[]) {
        const lines = tokens.join(" ").split("\n");
        for (const line of lines) {
            this.line(this.opts.commentLinePrefix, line);
        }
    }

    debugComment(...tokens: (string | any)[]) {
        if (this.opts.withDebugComment) {
            tokens = tokens.map((token) => {
                if (typeof token === "string") {
                    return token;
                } else {
                    return JSON.stringify(token, null, 2);
                }
            });
            this.comment(...tokens);
        }
    }

    disclaimer() {
        return [
            "WARNING: This file is autogenerated by @atomic-ehr/codegen.",
            "GitHub: https://github.com/atomic-ehr/codegen",
            "Any manual changes made to this file may be overwritten.",
        ];
    }

    generateDisclaimer() {
        this.disclaimer().forEach((e) => {
            this.comment(e);
        });
        this.line();
    }

    indentBlock(gencontent: () => void) {
        this.indent();
        gencontent();
        this.deindent();
    }

    curlyBlock(tokens: (string | undefined)[], gencontent: () => void, endTokens?: string[]) {
        this.line(`${tokens.filter(Boolean).join(" ")} {`);
        this.indent();
        gencontent();
        this.deindent();
        this.line(`}${endTokens?.filter(Boolean).join(" ") ?? ""}`);
    }

    squareBlock(tokens: (string | undefined)[], gencontent: () => void, endTokens?: string[]) {
        this.line(`${tokens.filter(Boolean).join(" ")} [`);
        this.indent();
        gencontent();
        this.deindent();
        this.line(`]${endTokens?.filter(Boolean).join(" ") ?? ""}`);
    }
}
