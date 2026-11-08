import { spawn } from "node:child_process";
import { existsSync, globSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface Completion {
	declared: number;
	reported: number;
	tests: number;
}

async function write(text: string): Promise<void> {
	await new Promise<void>((done, reject) => process.stdout.write(text, error => error ? reject(error) : done()));
}

export async function runTests(files: string[]): Promise<number> {
	let failed = files.length === 0;
	let declared = 0;
	let reported = 0;
	let tests = 0;
	if (failed) console.error("No test files found.");
	async function runFile(file: string) {
		const scratch = mkdtempSync(join(process.env.UB_AGENTS_SCRATCH ?? tmpdir(), "ablauf-test-report-"));
		const report = join(scratch, "report.txt");
		const child = spawn(process.execPath, [
			"--test", "--test-isolation=none", "--test-force-exit", "--test-timeout=60000",
			"--test-reporter", resolve(import.meta.dirname, "test-worker.ts"),
			"--test-reporter-destination", report, resolve(file),
		], {
			stdio: ["ignore", "pipe", "pipe", "pipe"],
		});
		let output = "";
		let receipt = "";
		child.stdout?.on("data", chunk => { output += chunk; });
		child.stderr?.on("data", chunk => { output += chunk; });
		const channel = child.stdio[3];
		if (channel && "on" in channel) channel.on("data", chunk => { receipt += chunk; });
		const status = await new Promise<number | null>((done, reject) => {
			child.on("error", reject);
			child.on("close", done);
		});
		if (existsSync(report)) output += readFileSync(report, "utf8");
		rmSync(scratch, { recursive: true, force: true });
		await write(output);
		if (status !== 0) failed = true;
		// The worker writes this after consuming the terminal summary and
		// checking every declaration. Process close also guarantees the report
		// destination has closed, so all its text is available above.
		// An exit code of zero without a receipt is still an incomplete file.
		if (!receipt) {
			failed = true;
			console.error(`Incomplete test file: ${file}: missing completion receipt.`);
			return;
		}
		const completion: Completion = JSON.parse(receipt);
		declared += completion.declared;
		reported += completion.reported;
		tests += completion.tests;
	}
	const concurrency = Math.max(1, availableParallelism() - 1);
	for (let start = 0; start < files.length; start += concurrency) {
		await Promise.all(files.slice(start, start + concurrency).map(runFile));
	}
	await write(`Test completeness: declared ${declared}, reported ${reported}, files ${files.length}; tests ${tests}.\n`);
	return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	process.exitCode = await runTests(process.argv.length > 2 ? process.argv.slice(2) : globSync("test/**/*.test.ts").sort());
}
