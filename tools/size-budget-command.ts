import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { version } from "esbuild";
import { ENTRIES, measureEntry, publishReport } from "./size-budget.ts";

const root = resolve(import.meta.dirname, "..");
// Build on every invocation so the measurement cannot silently use stale output.
execFileSync(process.execPath, [resolve(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.build.json"], { cwd: root, stdio: "inherit" });
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const report = {
	revision: git("rev-parse", "HEAD"),
	dirty: git("status", "--porcelain").length > 0,
	versions: { node: process.versions.node, esbuild: version, zlib: process.versions.zlib },
	entries: await Promise.all(ENTRIES.map(entry => measureEntry(root, entry))),
};
process.exitCode = publishReport(report, text => {
	console.log(text);
	if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
});
