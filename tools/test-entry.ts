import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Node's isolation=none loader can suppress an initialization error after a
// module registers a test. Import explicitly so evaluation has its own outcome,
// independent of the test events. The parent bounds this phase, even when a
// pending top-level await or synchronous loop prevents the test timeout starting.
const file = process.env.ABLAUF_TEST_FILE;
if (!file) throw new Error("Missing test file.");
try {
	await import(pathToFileURL(file).href);
} catch (error) {
	console.error(`Test file initialization failed: ${file}`, error);
	process.exit(1);
}
writeFileSync(4, "loaded");
