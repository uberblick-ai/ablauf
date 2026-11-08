import { writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { spec, type TestEvent } from "node:test/reporters";
import type { Completion } from "./test-runner.ts";

// This reporter runs beside the tests, rather than receiving serialized events
// from a file process. Its destination is a file: Node waits for that file to
// close before force exit, while a stdout pipe can still have buffered writes.
export default async function* report(source: AsyncIterable<TestEvent>) {
	const file = process.env.ABLAUF_TEST_FILE;
	const declared = new Set<number>();
	const reported = new Set<number>();
	let summary = false;
	let failed = false;
	let tests = 0;
	async function* checkedEvents(): AsyncGenerator<TestEvent> {
		for await (const event of source) {
			const { type, data } = event;
			if (type === "test:enqueue") declared.add(data.testId);
			if (type === "test:pass" || type === "test:fail") reported.add(data.testId);
			if (type === "test:fail" && !data.todo) failed = true;
			if (type === "test:summary") {
				summary = true;
				tests = data.counts.tests;
				if (!data.success) failed = true;
			}
			yield event;
		}
	}
	for await (const text of Readable.from(checkedEvents()).pipe(new spec())) yield text;
	const missing = [...declared].filter(id => !reported.has(id));
	const unexpected = [...reported].filter(id => !declared.has(id));
	if (!summary || missing.length || unexpected.length) {
		failed = true;
		yield `Incomplete test file: ${file}: declared ${declared.size}, reported ${reported.size}; ${summary ? "terminal summary received" : "missing terminal summary"}.\n`;
	}
	if (failed) process.exitCode = 1;
	const completion: Completion = { declared: declared.size, reported: reported.size, tests };
	writeFileSync(3, JSON.stringify(completion));
}
