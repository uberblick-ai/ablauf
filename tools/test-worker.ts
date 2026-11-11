import { writeFileSync } from "node:fs";
import { Duplex, Transform } from "node:stream";
import type { TestsStream } from "node:test";
import { spec, type TestEvent } from "node:test/reporters";
import type { Completion } from "./test-runner.ts";

function signal() {
	let resolve!: () => void;
	const promise = new Promise<void>(done => { resolve = done; });
	return { promise, resolve };
}

export const reportingReady = signal();
export const fileLoaded = signal();
const pending = new Set<number>();
let registered = false;
let drained: (() => void) | undefined;

export function hasTests(): boolean { return registered; }

export async function waitForFile(): Promise<void> {
	await fileLoaded.promise;
	if (pending.size) await new Promise<void>(resolve => { drained = resolve; });
}

// This reporter runs beside the tests, rather than receiving serialized events
// from a file process. Its destination is a file: Node waits for that file to
// close before force exit, while a stdout pipe can still have buffered writes.
export default function report() {
	const declared = new Set<number>();
	const reported = new Set<number>();
	let summary = false;
	let failed = false;
	let tests = 0;
	const checker = new Transform({
		objectMode: true,
		transform(event: TestEvent, _encoding, callback) {
			const { type, data } = event;
			if (type === "test:enqueue") declared.add(data.testId);
			if (type === "test:pass" || type === "test:fail") reported.add(data.testId);
			if (type === "test:fail" && !data.todo) failed = true;
			if (type === "test:summary") {
				summary = true;
				tests = data.counts.tests;
				if (!data.success) failed = true;
			}
			callback(null, event);
		},
		flush(callback) {
			const missing = [...declared].filter(id => !reported.has(id));
			const unexpected = [...reported].filter(id => !declared.has(id));
			if (!summary || missing.length || unexpected.length) {
				failed = true;
				console.error(`Incomplete test file: ${process.env.ABLAUF_TEST_FILE}: declared ${declared.size}, reported ${reported.size}; ${summary ? "terminal summary received" : "missing terminal summary"}.`);
			}
			if (failed) process.exitCode = 1;
			const completion: Completion = { declared: declared.size, reported: reported.size, tests };
			writeFileSync(3, JSON.stringify(completion));
			callback();
		},
	});
	// @ts-expect-error @types/node omits Duplex.from's documented pair of Node streams.
	const reporter = Duplex.from({ writable: checker, readable: checker.pipe(new spec()) });
	// Observe the TestsStream synchronously before the import starts. Formatting
	// may be backpressured; it must not hide declarations from the teardown gate.
	reporter.on("pipe", (source: TestsStream) => {
		source.on("test:enqueue", data => { registered = true; pending.add(data.testId); });
		const completed = (data: { testId: number }) => {
			pending.delete(data.testId);
			if (pending.size === 0) drained?.();
		};
		source.on("test:pass", completed);
		source.on("test:fail", completed);
		reportingReady.resolve();
	});
	return reporter;
}
