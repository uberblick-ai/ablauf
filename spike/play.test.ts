import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { render } from "./flow/index.ts";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const loop = read("examples/loop.flow");

test("a flow without a play section keeps its exact bytes and has no timeline", () => {
	const plain = render(loop);
	assert.equal(plain.svg.includes("data-ab-part"), false);
	assert.deepEqual(plain.timeline, []);
	assert.equal(render(`${loop}\nplay\n  step start\n`).svg.includes("data-ab-part"), true);
});

test("a flow step lights its node and the edge from the previous step", () => {
	const { timeline, diagnostics, svg } = render(read("play/loop.flow"));
	assert.deepEqual(diagnostics, []);
	assert.equal(timeline.length, 14);
	assert.deepEqual(timeline[6], {
		parts: ["node:reviewer", "edge:needs-review>reviewer"],
		ms: 2400,
		caption: "changes requested: P1 in the parser",
		line: timeline[6].line,
	});
	assert.equal(timeline[0].ms, 1600);
	for (const part of timeline.flatMap((s) => s.parts))
		assert.ok(svg.includes(`data-ab-part="${part.replace(">", "&gt;")}"`), part);
});

test("unknown nodes, missing edges and unreadable lines are diagnosed on their lines", () => {
	const source = `${loop}\nplay\n  step start\n  step nowhere\n  step merged\n  dance\n  tempo fast\n`;
	const base = loop.split("\n").length;
	const { diagnostics, timeline } = render(source);
	assert.deepEqual(
		diagnostics.map((d) => [d.line - base, d.severity]),
		[[3, "error"], [4, "warning"], [5, "error"], [6, "error"]],
	);
	assert.equal(timeline.length, 2);
});

test("a fan-out step names an outcome and lights the step with it", () => {
	const { timeline, diagnostics, svg } = render(read("play/approvals.flow"));
	assert.deepEqual(diagnostics, []);
	assert.deepEqual(timeline.map((s) => s.parts), [
		["step", "outcome:1"],
		["step", "outcome:2"],
		["step", "outcome:3"],
	]);
	assert.match(svg, /<g data-line="\d+" data-ab-part="outcome:2">/);
	const missing = render(`${read("examples/approvals.flow")}\nplay\n  step "Rejected"\n`);
	assert.match(missing.diagnostics[0].message, /no outcome "Rejected"/);
});
