import pc from "picocolors";

export const header = (title: string): void => {
    console.log();
    console.log(pc.cyan(pc.bold(`━━━ ${title} ━━━`)));
};

export const complete = (message: string, duration?: number, stats?: Record<string, number>): void => {
    let msg = message;
    if (duration) msg += ` ${pc.gray(`(${duration}ms)`)}`;
    console.log(`${pc.green("")} ${msg}`);
    if (stats) {
        for (const [key, value] of Object.entries(stats)) {
            console.log(pc.gray(`  ${key}: ${value}`));
        }
    }
};

export const list = (items: string[], bullet = "•"): void => {
    for (const item of items) {
        console.log(pc.gray(`  ${bullet} ${item}`));
    }
};
