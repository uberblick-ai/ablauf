import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import { pathToFileURL } from "node:url";

const runner = resolve(import.meta.dirname, "../tools/test-runner.ts");

function fixture(t: TestContext, files: Record<string, string>, loadTimeout?: number) {
	const cwd = mkdtempSync(join(process.env.UB_AGENTS_SCRATCH ?? tmpdir(), "ablauf-runner-"));
	t.after(() => rmSync(cwd, { recursive: true, force: true }));
	writeFileSync(join(cwd, "package.json"), '{"type":"module"}');
	for (const [file, content] of Object.entries(files)) {
		mkdirSync(dirname(join(cwd, file)), { recursive: true });
		writeFileSync(join(cwd, file), content);
	}
	// This is a new runner invocation, rather than a recursive node:test run in
	// this test worker. The parent's NODE_TEST_CONTEXT must not follow it.
	const env = { ...process.env };
	delete env.NODE_TEST_CONTEXT;
	let entry = runner;
	if (loadTimeout !== undefined) {
		entry = join(cwd, "run.ts");
		writeFileSync(entry, `
import {runTests} from ${JSON.stringify(pathToFileURL(runner).href)};
import {globSync} from "node:fs";
process.exitCode = await runTests(globSync("test/**/*.test.ts").sort(), ${loadTimeout});
`);
	}
	const result = spawnSync(process.execPath, [entry], { cwd, env, encoding: "utf8", timeout: 10_000 });
	assert.ifError(result.error);
	return { ...result, output: result.stdout + result.stderr };
}

test("the runner discovers nested files and correlates duplicate names, suites and subtests", t => {
	const result = fixture(t, {
		"test/top.test.ts": 'import {test} from "node:test"; test("same", () => {});',
		"test/nested/deep.test.ts": `
import {test, describe, it} from "node:test";
describe("suite", () => {
  it("same", async t => { await t.test("same", () => {}); });
  it("same", () => {});
});
test.skip("skipped", () => { throw new Error("must not run"); });
test.todo("future");
`,
		"test/ignored.ts": 'throw new Error("must not discover helpers");',
	});
	assert.equal(result.status, 0, result.output);
	assert.match(result.output, /Test completeness: declared 7, reported 7, files 2; tests 6\./);
});

test("the runner rejects an empty discovery", t => {
	const result = fixture(t, {});
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /No test files found/);
});

test("a file exiting before registration cannot masquerade as a passing file", t => {
	const result = fixture(t, { "test/early.test.ts": "process.exit(0);" });
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /Incomplete test file: .*early\.test\.ts: missing completion receipt/);
});

test("a module initialization error after a declaration fails with its filename and exception", t => {
	const result = fixture(t, { "test/import-error.test.ts": `
import {test} from "node:test";
test("registered before error", () => {});
throw new Error("module initialization failed");
test("never registered", () => {});
` });
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /Test file initialization failed: .*import-error\.test\.ts/);
	assert.match(result.output, /module initialization failed/);
});

test("pending module evaluation with a leaked handle fails within the load deadline", t => {
	const result = fixture(t, { "test/pending-import.test.ts": `
import {test} from "node:test";
test("declared before pending import", () => {});
setInterval(() => {}, 1000);
await new Promise(() => {});
` }, 1000);
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /Test file initialization timed out after 1000 ms: .*pending-import\.test\.ts/);
});

test("synchronous module evaluation cannot block the parent's load deadline", t => {
	const result = fixture(t, { "test/blocked-import.test.ts": "while (true) {}" }, 1000);
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /Test file initialization timed out after 1000 ms: .*blocked-import\.test\.ts/);
});

test("successful module evaluation clears the load deadline while tests keep running", t => {
	const result = fixture(t, { "test/loaded.test.ts": `
import {test} from "node:test";
test("longer than load deadline", async () => {
  await new Promise(resolve => setTimeout(resolve, 1200));
});
` }, 1000);
	assert.equal(result.status, 0, result.output);
	assert.match(result.output, /Test completeness: declared 1, reported 1, files 1; tests 1\./);
});

test("a malformed receipt fails with its filename without losing another file's report", t => {
	const result = fixture(t, {
		"test/malformed.test.ts": `
import {writeFileSync} from "node:fs";
writeFileSync(3, "not JSON");
process.exit(0);
`,
		"test/passing.test.ts": 'import {test} from "node:test"; test("still reported", () => {});',
	});
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /Incomplete test file: .*malformed\.test\.ts: invalid completion receipt/);
	assert.match(result.output, /still reported/);
	assert.match(result.output, /Test completeness: declared 1, reported 1, files 2; tests 1\./);
});

test("the parent rejects mismatched receipt counts even after a zero exit", t => {
	const result = fixture(t, { "test/mismatch.test.ts": `
import {writeFileSync} from "node:fs";
writeFileSync(3, JSON.stringify({declared: 2, reported: 1, tests: 1}));
process.exit(0);
` });
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /Incomplete test file: .*mismatch\.test\.ts: declared 2, reported 1/);
});

test("a file with sixteen unreported declarations fails with its filename", t => {
	const result = fixture(t, { "test/incomplete.test.ts": `
import {test} from "node:test";
test("reported", () => {});
test("cut short", () => process.exit(0));
for (let i = 0; i < 16; i++) test("missing " + i, () => {});
` });
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /Incomplete test file: .*incomplete\.test\.ts: missing completion receipt/);
});

test("forced exit in teardown fails even when every test result arrived", t => {
	const result = fixture(t, { "test/teardown.test.ts": `
import {test, after} from "node:test";
test("reported", () => {});
after(() => process.exit(0));
` });
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /Incomplete test file: .*teardown\.test\.ts: missing completion receipt/);
});

test("the runner drains a large result stream and terminates despite a leaked handle", t => {
	const result = fixture(t, { "test/leaked.test.ts": `
import {test} from "node:test";
setInterval(() => {}, 1000);
for (let i = 0; i < 1000; i++) test("result " + i + " ".repeat(100), () => {});
` });
	assert.equal(result.status, 0, result.output.slice(-4000));
	assert.match(result.output, /Test completeness: declared 1000, reported 1000, files 1; tests 1000\./);
});

test("a test timeout still fails and terminates despite a leaked handle", t => {
	const result = fixture(t, { "test/timeout.test.ts": `
import {test} from "node:test";
setInterval(() => {}, 1000);
test("never resolves", {timeout: 20}, () => new Promise(() => {}));
` });
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /timed out/);
	assert.match(result.output, /timeout\.test\.ts/);
});

test("ordinary assertion failures remain failures in a complete file", t => {
	const result = fixture(t, { "test/failure.test.ts": `
import {test} from "node:test";
test("fails", () => { throw new Error("expected failure"); });
` });
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, /expected failure/);
	assert.match(result.output, /Test completeness: declared 1, reported 1, files 1; tests 1\./);
});
