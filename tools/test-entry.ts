import { writeFileSync } from "node:fs";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import { fileLoaded, hasTests, reportingReady, waitForFile } from "./test-worker.ts";

// Run as a regular Node entry point: node:test can then execute top-level
// awaited tests while their module is still loading. The --test isolation=none
// loader would wait for that module first and deadlock. Import explicitly so
// evaluation errors have their own outcome, independent of the test events.
// The parent bounds loading even if a pending await or synchronous loop stalls it.
const file = process.env.ABLAUF_TEST_FILE;
if (!file) throw new Error("Missing test file.");
// Keep teardown, the terminal summary and forced exit behind module evaluation
// and all declared results, while allowing test() promises to resolve in between.
after(waitForFile);
await reportingReady.promise;
try {
	await import(pathToFileURL(file).href);
} catch (error) {
	console.error(`Test file initialization failed: ${file}`, error);
	process.exit(1);
}
// Match Node's file placeholder for a module without declarations, including
// one that leaves a handle open. This also gives its teardown a chance to run.
if (!hasTests()) test(file, () => {});
writeFileSync(4, "loaded");
fileLoaded.resolve();
