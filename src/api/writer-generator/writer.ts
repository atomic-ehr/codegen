import * as fs from "node:fs";
import * as Path from "node:path";
import type { TypeSchema } from "@root/typeschema";
import type { CodegenLogger } from "@root/utils/codegen-logger";

export interface WriterOptions {
    outputDir: string;
    tabSize: number;
    withDebugComment?: boolean;
    commentLinePrefix: string;
    logger?: CodegenLogger;
}

class FileSystemWriter {
    opts: WriterOptions;
    currentDir: string;
    currentFileDescriptor?: number;
    writtenFilesSet: Set<string> = new Set();

    constructor(opts: WriterOptions) {
        this.opts = opts;
        this.currentDir = opts.outputDir;
    }

    logger(): CodegenLogger | undefined {
        return this.opts.logger;
    }

    cd(path: string, gen: () => void) {
        this.currentDir = path.startsWith("/")
            ? Path.join(this.opts.outputDir, path)
            : Path.join(this.currentDir, path);
        if (!fs.existsSync(this.currentDir)) {
            fs.mkdirSync(this.currentDir, { recursive: true });
        }
        this.logger()?.debug(`cd '${this.currentDir}'`);
        gen();
    }

    cat(fn: string, gen: () => void) {
        if (this.currentFileDescriptor) throw new Error("Can't open file in file");
        if (fn.includes("/")) throw new Error(`Change file path separatly: ${fn}`);

        const fullFn = `${this.currentDir}/${fn}`;
        try {
            this.currentFileDescriptor = fs.openSync(fn, "w");
            this.writtenFilesSet.add(fn);
            this.logger()?.debug(`cat > '${fullFn}'`);
            gen();
        } finally {
            if (this.currentFileDescriptor) {
                fs.closeSync(this.currentFileDescriptor);
            }
            this.currentFileDescriptor = undefined;
        }
    }

    write(str: string) {
        if (!this.currentFileDescriptor) throw new Error("No file opened");
        fs.writeSync(this.currentFileDescriptor, str);
        // this.logger()?.debug(`< ${str.replace(/\n/g, "\\n")}`);
    }

    generate(_schemas: TypeSchema[]) {
        throw new Error("Not implemented");
    }

    writtenFiles(): string[] {
        return Array.from(this.writtenFilesSet);
    }
}

export class Writer extends FileSystemWriter {
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
        this.writeIndent();
        this.write(`${tokens.join(" ")}\n`);
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

    curlyBlock(tokens: Array<string | undefined>, gencontent: () => void, endTokens?: Array<string>) {
        this.line(`${tokens.filter(Boolean).join(" ")} {`);
        this.indent();
        gencontent();
        this.deindent();
        this.line(`}${endTokens?.filter(Boolean).join(" ") ?? ""}`);
    }

    squareBlock(tokens: Array<string | undefined>, gencontent: () => void, endTokens?: Array<string>) {
        this.line(`${tokens.filter(Boolean).join(" ")} [`);
        this.indent();
        gencontent();
        this.deindent();
        this.line(`]${endTokens?.filter(Boolean).join(" ") ?? ""}`);
    }
}
