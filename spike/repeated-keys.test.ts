import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "./flow/index.ts";
import { parse } from "./flow/parse.ts";

const reproduction = `flow v0

columns main

text start col=main "Start"
pill a tone=done tone=stop
box b tone=agent tone=rework "two tones"

legend
  pill tone=done "repeated sample" sample=one sample=two
  box tone=agent tone=stop "repeated tone"
  pill "blank sample" sample=" "
  pill "empty sample" sample=""
`;

test("repeated keys and blank samples report exactly the reproduction's six problems", () => {
	const { svg, diagnostics } = render(reproduction);
	assert.deepEqual(diagnostics, [
		{ line: 6, severity: "warning", message: "repeated key `tone`" },
		{ line: 7, severity: "warning", message: "repeated key `tone`" },
		{ line: 10, severity: "warning", message: "repeated key `sample`" },
		{ line: 11, severity: "warning", message: "repeated key `tone`" },
		{ line: 12, severity: "warning", message: "sample= needs non-empty text" },
		{ line: 13, severity: "warning", message: "sample= needs non-empty text" },
	]);
	assert.equal(svg, render(reproduction
		.replace("tone=done tone=stop", "tone=stop")
		.replace("tone=agent tone=rework", "tone=rework")
		.replace("sample=one sample=two", "sample=two")
		.replace("tone=agent tone=stop", "tone=stop")
		.replaceAll(/ sample="\s*"/g, "")).svg);
});

const cases = [
	{ kind: "node", key: "tone", first: "done", last: "stop" },
	{ kind: "node", key: "col", first: "main", last: "side" },
	{ kind: "node", key: "row", first: "a", last: "b" },
	{ kind: "node", key: "span", first: "2", last: "1" },
	{ kind: "node", key: "title", first: '"old title"', last: '"new title"' },
	{ kind: "edge", key: "tone", first: "done", last: "stop" },
	{ kind: "edge", key: "from", first: "top.1", last: "bottom.2" },
	{ kind: "edge", key: "to", first: "bottom.1", last: "top.2" },
	{ kind: "edge", key: "label", first: "start", last: "end" },
	{ kind: "legend", key: "tone", first: "done", last: "stop" },
	{ kind: "legend", key: "sample", first: '"old sample"', last: '"new sample"' },
];

for (const { kind, key, first, last } of cases) {
	for (const identical of [false, true]) {
		test(`repeated ${kind} ${key} preserves the last value and SVG (${identical ? "identical" : "different"} values)`, () => {
			const prefix = "flow v0\ncolumns main side\npill a col=main\npill b\n";
			const line = kind === "node" ? "box c" : kind === "edge" ? "a --> b" : 'legend\n  box "meaning"';
			const effective = `${prefix}${line} ${key}=${last}`;
			const repeated = `${prefix}${line} ${key}=${identical ? last : first} ${key}=${last}`;
			const parsed = parse(repeated);
			assert.deepEqual(parsed.diagnostics, [{
				line: kind === "legend" ? 6 : 5,
				severity: "warning",
				message: `repeated key \`${key}\``,
			}]);
			assert.deepEqual(parsed.model, parse(effective).model);
			for (const scheme of ["light", "dark"] as const)
				assert.equal(render(repeated, { scheme }).svg, render(effective, { scheme }).svg);
		});
	}
}

test("key tracking resets on each source line and ignores quoted text and edge labels", () => {
	const source = `flow v0
pill a tone=done "tone=stop tone=agent"
pill b tone=done
a --> b tone=done : tone=stop tone=agent
a -.-> b tone=done
legend
  pill tone=done sample=ready "tone=stop tone=agent"
  box tone=done sample=ready "meaning"
`;
	assert.deepEqual(parse(source).diagnostics, []);
});

test("repeated invalid and unknown keys keep their existing diagnostics and effective values", () => {
	const source = `flow v0
pill a tone=done tone=unknown
pill b tone=stop
a --> b from=bottom.2 from=invalid
legend
  pill tone=done tone=unknown "meaning"
  box extra=one extra=two "meaning"
`;
	const { model, diagnostics } = parse(source);
	assert.deepEqual(diagnostics.map((d) => [d.line, d.message]), [
		[2, "repeated key `tone`"],
		[2, "unknown tone `unknown`; using done"],
		[4, "repeated key `from`"],
		[4, "from= takes top, right, bottom or left, optionally with a slot like bottom.2"],
		[6, "repeated key `tone`"],
		[6, "unknown tone `unknown`; using done"],
		[7, "repeated key `extra`"],
		[7, "unknown key `extra`"],
		[7, "unknown key `extra`"],
	]);
	assert.equal(model.nodes[0].tone, "done");
	assert.equal(model.edges[0].from_side, "bottom");
	assert.equal(model.edges[0].from_slot, 2);
	assert.equal(model.legend[0].tone, "done");
	assert.equal(render(source).svg, render(source
		.replaceAll(" tone=unknown", "")
		.replace(" from=invalid", "")
		.replace(" extra=one extra=two", "")).svg);
});

test("repeated bare empty keys warn without changing their existing text interpretation", () => {
	const source = `flow v0
pill a tone= tone=done
legend
  pill tone= tone=done "meaning"
`;
	const { model, diagnostics } = parse(source);
	assert.deepEqual(diagnostics.map((d) => [d.line, d.message]), [
		[2, "repeated key `tone`"],
		[4, "repeated key `tone`"],
	]);
	assert.equal(model.nodes[0].label, "tone=");
	assert.equal(model.nodes[0].tone, "done");
	assert.equal(model.legend[0].text, "tone= meaning");
	assert.equal(model.legend[0].tone, "done");
});
