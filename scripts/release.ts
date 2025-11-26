#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

// Colors for output
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const blue = (text: string) => `\x1b[34m${text}\x1b[0m`;

// Get version bump type from arguments
const bumpType = process.argv[2];
if (!bumpType || !["patch", "minor", "major"].includes(bumpType)) {
    console.error(red("Usage: bun scripts/release.ts [patch|minor|major]"));
    process.exit(1);
}

// Optional publish tag, defaults to 'latest'.
const publishTag = process.env.PUBLISH_TAG?.trim() || "latest";

async function getCurrentBranch(): Promise<string> {
    const result = await $`git branch --show-current`.quiet();
    return result.text().trim();
}

async function hasUncommittedChanges(): Promise<boolean> {
    try {
        await $`git diff --quiet && git diff --cached --quiet`.quiet();
        return false;
    } catch {
        return true;
    }
}

async function getLatestVersion(): Promise<string> {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    return packageJson.version;
}

async function checkIfVersionExists(version: string): Promise<boolean> {
    try {
        await $`npm view @atomic-ehr/codegen@${version}`.quiet();
        return true;
    } catch {
        return false;
    }
}

function bumpVersion(currentVersion: string, type: "patch" | "minor" | "major"): string {
    const parts = currentVersion.split(".").map(Number);
    const major = parts[0] ?? 0;
    const minor = parts[1] ?? 0;
    const patch = parts[2] ?? 0;

    switch (type) {
        case "major":
            return `${major + 1}.0.0`;
        case "minor":
            return `${major}.${minor + 1}.0`;
        case "patch":
            return `${major}.${minor}.${patch + 1}`;
    }
}

async function main() {
    console.log(blue("🚀 Codegen Release Script"));
    console.log(blue("========================\n"));

    // Check current branch
    const branch = await getCurrentBranch();
    if (branch !== "main") {
        console.error(red(`❌ You must be on the main branch to release. Current branch: ${branch}`));
        process.exit(1);
    }
    console.log(green(`✓ On main branch`));

    // Check for uncommitted changes
    if (await hasUncommittedChanges()) {
        console.error(red("❌ You have uncommitted changes. Please commit or stash them first."));
        process.exit(1);
    }
    console.log(green("✓ Working directory clean"));

    // Get current version and calculate new version
    const currentVersion = await getLatestVersion();
    const newVersion = bumpVersion(currentVersion, bumpType as any);

    console.log(`\nCurrent version: ${yellow(currentVersion)}`);
    console.log(`New version: ${yellow(newVersion)}`);

    // Check if version already exists on npm
    console.log("\nChecking if version exists on npm...");
    if (await checkIfVersionExists(newVersion)) {
        console.error(red(`❌ Version ${newVersion} already exists on npm!`));
        process.exit(1);
    }
    console.log(green("✓ Version is available"));

    // Run tests
    console.log("\nRunning tests...");
    try {
        await $`bun test`.quiet();
        console.log(green("✓ Tests passed"));
    } catch (_error) {
        console.error(red("❌ Tests failed!"));
        process.exit(1);
    }

    // Run type checking
    console.log("\nRunning type check...");
    try {
        await $`bun run typecheck`.quiet();
        console.log(green("✓ Type check passed"));
    } catch (_error) {
        console.error(red("❌ Type check failed!"));
        process.exit(1);
    }

    // Update version in package.json
    console.log(`\nUpdating package.json to version ${newVersion}...`);
    const packageJsonPath = join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    packageJson.version = newVersion;
    writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
    console.log(green("✓ package.json updated"));

    // Commit version bump
    console.log("\nCommitting version bump...");
    await $`git add package.json`;
    await $`git commit -m "chore: release v${newVersion}"`;
    console.log(green("✓ Committed"));

    // Create tag
    console.log("\nCreating tag...");
    await $`git tag v${newVersion}`;
    console.log(green(`✓ Tag v${newVersion} created`));

    // Build the package
    console.log("\nBuilding package...");
    try {
        await $`bun run build`;
        console.log(green("✓ Build successful"));
    } catch (_error) {
        console.error(red("❌ Build failed!"));
        // Rollback
        await $`git tag -d v${newVersion}`;
        await $`git reset --hard HEAD~1`;
        process.exit(1);
    }

    // Publish to npm via Bun, with explicit dist-tag
    console.log("\nPublishing to npm via Bun...");
    try {
        await $`bun publish --access public --ignore-scripts --tag ${publishTag}`;
        console.log(green(`✓ Published to npm with tag '${publishTag}'`));
    } catch (_error) {
        console.error(red("❌ Failed to publish to npm!"));
        // Rollback
        await $`git tag -d v${newVersion}`;
        await $`git reset --hard HEAD~1`;
        process.exit(1);
    }

    // Push to GitHub
    console.log("\nPushing to GitHub...");
    await $`git push origin main`;
    await $`git push origin v${newVersion}`;
    console.log(green("✓ Pushed to GitHub"));

    console.log(`\n${green("🎉 Release successful!")}`);
    console.log(`\nVersion ${yellow(newVersion)} has been published.`);
    console.log(`Install with: ${blue(`bun add @atomic-ehr/codegen@${newVersion}`)}`);
    console.log(`\nGitHub Actions will also attempt to publish this version.`);
    console.log(`Check the Actions tab for status: ${blue("https://github.com/atomic-ehr/codegen/actions")}`);
}

main().catch((error) => {
    console.error(red("Unexpected error:"), error);
    process.exit(1);
});
