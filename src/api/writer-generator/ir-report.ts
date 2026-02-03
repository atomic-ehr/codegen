import { generateIrReportReadme } from "@root/typeschema/ir/report";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { FileSystemWriter, type FileSystemWriterOptions } from "./writer";

export interface IrReportWriterWriterOptions extends FileSystemWriterOptions {
    rootReadmeFileName: string;
}

export class IrReportWriterWriter extends FileSystemWriter<IrReportWriterWriterOptions> {
    async generate(tsIndex: TypeSchemaIndex): Promise<void> {
        const report = tsIndex.irReport();
        const md = generateIrReportReadme(report);
        this.cd("/", () => {
            this.cat(this.opts.rootReadmeFileName, () => {
                this.write(md);
            });
        });
    }
}
