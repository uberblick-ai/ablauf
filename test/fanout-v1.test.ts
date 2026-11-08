import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { render } from "../src/index.ts";

const source = (...lines: string[]) => ['fan-out v1', 'step "A"', ...lines].join("\n");
const example = (name: string) => readFileSync(new URL(`../examples/${name}.flow`, import.meta.url), "utf8");
const decode = (text: string) => text.replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
const description = (svg: string) => decode(/aria-label="([^"]*)"/.exec(svg)?.[1] ?? "");
const boxes = (svg: string) => [...svg.matchAll(/<g data-line="(\d+)">\n<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"[^>]*\/>\n([\s\S]*?)<\/g>/g)]
	.map(([, line, x, y, width, height, text]) => ({ line: Number(line), x: Number(x), y: Number(y), width: Number(width), height: Number(height), text }));
const paths = (svg: string) => [...svg.matchAll(/<g data-line="(\d+)"><path d="([^"]+)"/g)].map(([, line, d]) => ({ line: Number(line), d }));
function negative(text: string, line: number, message: RegExp, raw = true) {
	const result = render(text);
	assert.ok(result.diagnostics.some(d => d.line === line && message.test(d.message)), JSON.stringify(result.diagnostics));
	assert.match(result.svg, /^<svg /);
	assert.ok(boxes(result.svg).length >= 1);
	assert.doesNotMatch(result.svg, /NaN|Infinity/);
	if (raw) assert.match(result.svg, new RegExp(`>Line ${line}:`));
	return result;
}

test("multi-step examples draw each declared box once with zero diagnostics in either scheme", () => {
	for (const name of ["fanout-shared", "run-endings-multi-step"]) for (const scheme of ["light", "dark"] as const) {
		const input = example(name);
		const result = render(input, { scheme });
		assert.deepEqual(result.diagnostics, []);
		assert.equal(result.svg, render(input, { scheme }).svg);
		assert.equal(boxes(result.svg).length, name === "fanout-shared" ? 5 : 10);
		assert.equal(paths(result.svg).length, name === "fanout-shared" ? 5 : 10);
		assert.deepEqual(result.layout.nodes, []);
		assert.deepEqual(result.layout.routes, []);
	}
});

test("columns, envelopes, rounding, v0 curves and skip runs have exact source coordinates", () => {
	const { svg, layout } = render(example("fanout-shared"));
	assert.deepEqual(boxes(svg).map(({ line, x, y, width, height }) => ({ line, x, y, width, height })), [
		{ line: 2, x: 16, y: 75, width: 190, height: 34 },
		{ line: 3, x: 242, y: 38, width: 190, height: 34 },
		{ line: 4, x: 468, y: 16, width: 190, height: 34 },
		{ line: 5, x: 468, y: 60, width: 190, height: 34 },
		{ line: 6, x: 242, y: 112, width: 190, height: 34 },
	]);
	assert.equal(layout.height, 162);
	assert.deepEqual(paths(svg), [
		{ line: 3, d: "M206,92 C216,92 216,55 226,55 L240,55" },
		{ line: 4, d: "M432,55 C442,55 442,33 452,33 L466,33" },
		{ line: 5, d: "M432,55 C442,55 442,77 452,77 L466,77" },
		{ line: 6, d: "M206,92 C216,92 216,129 226,129 L240,129" },
		{ line: 7, d: "M206,92 C216,92 216,85 226,85 L466,85" },
	]);
	const three = render(source('outcome "B"', '  outcome "C"', '    outcome "D"'));
	assert.deepEqual(three.diagnostics, []);
	assert.deepEqual(boxes(three.svg).map(b => [b.x, b.y, b.width, b.height]), [[16,16,134,34], [186,16,134,34], [356,16,134,34], [526,16,134,34]]);
	assert.equal(three.layout.height, 66);
	const single = render(source('outcome "B"'));
	assert.equal(boxes(single.svg)[1].x, 242);
	const empty = render('fan-out v1\nstep "A"');
	assert.equal(boxes(empty.svg)[0].width, 190);
});

test("text blocks use separate weights, destination rule, prefix wrapping and host mono metrics", () => {
	const input = source('outcome "B" reason="Why" destination="There" tone="stop"');
	const { svg } = render(input);
	const child = boxes(svg)[1];
	assert.equal(child.height, 80);
	assert.match(svg, /class="k-stop panel"/);
	assert.match(child.text, /y="38" class="m s12 b">B/);
	assert.match(child.text, /y="56" class="m s12 muted">Why/);
	assert.match(child.text, /y="84" class="m s12 b">→ There/);
	assert.match(child.text, /y1="65" x2="420" y2="65"[^>]*stroke-dasharray="2 4"/);
	const calls = new Set<string>();
	const host = render(source('outcome "B" reason="Why this reason" destination="First second third"'), { fonts: {
		mono: { family: "Wide Mono", measureText: (t, s) => { calls.add(`${t}:${s.fontSize}:${s.fontWeight}`); return [...t].length * 12; } },
		text: { family: "Unused", measureText: () => { throw new Error("mono only"); } },
	} });
	assert.deepEqual(host.diagnostics, []);
	assert.match(host.svg, />→ First<\/text>/);
	assert.ok(calls.has("→ First:12:600"));
	assert.ok(calls.has("A:13:600"));
	assert.ok(calls.has("Why this:12:400"));
	assert.match(host.svg, /\.ab \.m\{font-family:"Wide Mono"\}/);
	const long = render(source(`outcome "${"W".repeat(80)}"`));
	assert.deepEqual(long.diagnostics, []);
	assert.equal(boxes(long.svg)[1].height, 16 + 4 * 18);
	assert.equal([...boxes(long.svg)[1].text.matchAll(/>(W+)<\/text>/g)].map(m => m[1]).join(""), "W".repeat(80));
});

test("a tall parent clamps inside its envelope and centres its children's block", () => {
	const { svg, diagnostics } = render(source(`outcome "${"W".repeat(100)}"`, '  outcome "C"', '  outcome "D"'));
	assert.deepEqual(diagnostics, []);
	const [, parent, first, last] = boxes(svg);
	assert.equal(parent.y, 16);
	assert.equal(parent.height, 106);
	assert.deepEqual([first.y, last.y], [30, 74]);
});

test("refs resolve forward and backward, do not allocate boxes or enter the stack", () => {
	const forward = render(source('outcome ref="e"', 'outcome "B"', '  outcome "D"', '  outcome "E" id="e"'));
	assert.deepEqual(forward.diagnostics, []);
	assert.equal(boxes(forward.svg).length, 4);
	assert.equal(paths(forward.svg).length, 4);
	const input = source('outcome "B"', '  outcome "D"', 'outcome ref="e"', '  outcome "E" id="e"');
	const backward = render(input);
	assert.deepEqual(backward.diagnostics, []);
	assert.match(description(backward.svg), /B leads to D and E\./);
	const without = render(input.replace('outcome ref="e"\n', ""));
	assert.deepEqual(boxes(backward.svg).map(({line, ...b}) => b), boxes(without.svg).map(({line, ...b}) => b));
});

test("incoming ref slots increase by 8 in source order and report clearance without moving boxes", () => {
	const input = source('outcome "B"', '  outcome "D"', '  outcome "E" id="e"', 'outcome "C"', '  outcome ref="e"', 'outcome ref="e"');
	const { svg, diagnostics } = render(input);
	assert.deepEqual(diagnostics.map(d => [d.line, d.message]), [[8, "ref slot is closer than 6 px to the box bottom"]]);
	const target = boxes(svg).find(b => b.line === 5);
	assert.ok(target);
	const centre = target.y + target.height / 2;
	assert.ok(paths(svg).find(p => p.line === 7)?.d.endsWith(` L466,${centre + 8}`));
	assert.ok(paths(svg).find(p => p.line === 8)?.d.endsWith(` L466,${centre + 16}`));
	assert.equal(target.height, 34);
});

test("straight-run proximity and overlap diagnose ref lines and retain the written geometry", () => {
	const near = source('outcome "B"', '  outcome "D"', '  outcome "E" id="e"', '    outcome "Leaf"', 'outcome ref="e"');
	// Select a fixture whose skip passes through a declared intermediate box.
	const proximity = source('outcome "B"', '  outcome "D"', '    outcome "E" id="e"', 'outcome ref="e"');
	const result = negative(proximity, 6, /within 4 px/, false);
	assert.equal(paths(result.svg).length, 4);
	assert.deepEqual(render(near).diagnostics, []);
	const overlap = source('outcome "B"', '  outcome "E" id="e"', `  outcome "${"W".repeat(93)}" id="f"`,
		...Array.from({length: 10}, (_, i) => [`outcome "Parent ${i}"`, '  outcome ref="e"']).flat(),
		'outcome ref="e"', 'outcome ref="f"');
	// Centres are 80 px apart, so E's eleventh and F's first ref meet at
	// y=121. The later source line owns the overlap diagnostic.
	const measured = negative(overlap, 27, /straight runs overlap/, false);
	assert.ok(paths(measured.svg).at(-1)?.d.endsWith(' L466,121'));
	assert.ok(paths(measured.svg).at(-2)?.d.endsWith(' L466,121'));
});

test("text-fit errors use the outcome line with a host's overwide glyph and still draw it", () => {
	const result = render(source('outcome "🙂X"'), { fonts: { mono: {
		family: "Huge Mono", measureText: t => [...t].reduce((n, c) => n + (c === "🙂" ? 1000 : 7), 0),
	} } });
	assert.deepEqual(result.diagnostics.map(d => [d.line, d.message]), [[3, "text does not fit its box"]]);
	assert.match(result.svg, />🙂<\/text>/);
	assert.match(result.svg, />X<\/text>/);
	assert.equal(boxes(result.svg)[1].width, 190);
});

const negatives: [string, string, number, RegExp][] = [
	["tabs", source('\toutcome "B"'), 3, /tab/],
	["odd indent", source(' outcome "B"'), 3, /pairs/],
	["jump", source('      outcome "B"'), 3, /clamping/],
	["indented style", 'fan-out v1\n  style branches\nstep "A"\noutcome "B"', 2, /style must/],
	["indented step", 'fan-out v1\n  step "A"\noutcome "B"', 2, /step must/],
	["ladder", 'fan-out v1\nstyle ladder\nstep "A"\noutcome "B"', 2, /ladder/],
	["map deferred", 'fan-out v1\nstyle map\nstep "A"\noutcome "B"', 2, /unknown style/],
	["empty style", 'fan-out v1\nstyle\nstep "A"\noutcome "B"', 2, /unknown style/],
	["repeated style", 'fan-out v1\nstyle branches\nstyle branches\nstep "A"\noutcome "B"', 3, /at most one/],
	["late style", source('outcome "B"', 'style branches'), 4, /before the step/],
	["late step", 'fan-out v1\noutcome "B"\nstep "A"', 3, /before its outcomes/],
	["empty step", 'fan-out v1\nstep ""\noutcome "B"', 2, /non-empty/],
	["bare step", 'fan-out v1\nstep\noutcome "B"', 2, /quoted/],
	["step trailing text", 'fan-out v1\nstep "A" extra\noutcome "B"', 2, /unexpected/],
	["bad escape", source('outcome "\\q"'), 3, /invalid quoted/],
	["missing text", source('outcome'), 3, /non-empty outcome/],
	["empty text", source('outcome ""'), 3, /non-empty outcome/],
	["bare text", source('outcome Bare'), 3, /quoted/],
	["unclosed text", source('outcome "Unclosed'), 3, /quoted/],
	["empty reason", source('outcome "B" reason=""'), 3, /non-empty reason/],
	["empty destination", source('outcome "B" destination=" "'), 3, /non-empty destination/],
	["unknown field", source('outcome "B" extra="<script>"'), 3, /unknown field/],
	["unknown tone", source('outcome "B" tone="loud"'), 3, /unknown tone/],
	["duplicate field", source('outcome "B" reason="First" reason="Second"'), 3, /duplicate field/],
	["missing gap", source('outcome "B"reason="Why"'), 3, /whitespace/],
	["missing later gap", source('outcome "B" reason="Why"destination="Here"'), 3, /whitespace/],
	["unquoted field", source('outcome "B" reason=bare destination="Here"'), 3, /quoted/],
	["trailing text", source('outcome "B" garbage'), 3, /expected reason/],
	["invalid id", source('outcome "B" id="Upper"'), 3, /id must match/],
	["duplicate id", source('outcome "B" id="e"', 'outcome "C" id="e"'), 4, /lines 3 and 4/],
	["malformed ref", source('outcome ref=e'), 3, /valid quoted id/],
	["bad ref escape", source('outcome ref="\\q"'), 3, /valid quoted id/],
	["ref extra", source('outcome ref="e" reason="Why"'), 3, /valid quoted id/],
	["ref with text", source('outcome "B" ref="e"'), 3, /no outcome text/],
	["unknown ref", source('outcome "B"', 'outcome ref="missing"'), 4, /unknown ref/],
	["self ref", source('outcome "B" id="b"', '  outcome ref="b"'), 4, /deeper/],
	["sibling ref", source('outcome "B" id="b"', 'outcome "C"', '  outcome ref="b"'), 5, /deeper/],
	["ancestor ref", source('outcome "B" id="b"', '  outcome "C"', '    outcome ref="b"'), 5, /deeper/],
	["declared child ref", source('outcome "B" id="b"', 'outcome ref="b"'), 4, /already a declared child/],
	["forward declared child ref", source('outcome ref="b"', 'outcome "B" id="b"'), 3, /already a declared child/],
	["duplicate ref", source('outcome "B"', '  outcome "E" id="e"', 'outcome ref="e"', 'outcome ref="e"'), 6, /duplicate ref/],
	["unknown line", source('<script> & "bad"'), 3, /expected `style`/],
];
for (const [name, text, line, message] of negatives) test(`v1 diagnoses ${name} on its source line and renders recovery`, () => {
	const result = negative(text, line, message);
	assert.doesNotMatch(result.svg, /<script|href=|onload=/);
});

test("structural missing declarations diagnose the header and the figure renders", () => {
	negative('fan-out v1\noutcome "B"', 1, /needs one step/, false);
	negative('fan-out v1\nstep "A"', 1, /at least one outcome/, false);
});

test("second steps reject all following outcomes and refs in v1", () => {
	const { svg, diagnostics } = render(source('outcome "B"', 'step "Second"', 'outcome "C"', '  outcome "D"', 'outcome ref="e"'));
	assert.deepEqual(diagnostics.map(d => d.line), [4, 5, 6, 7]);
	assert.equal(boxes(svg).length, 2);
	assert.equal(paths(svg).length, 1);
	for (const line of [4, 5, 6, 7]) assert.match(svg, new RegExp(`>Line ${line}:`));
});

test("field errors keep boxes, first values and escaped raw source below the figure", () => {
	const input = source('outcome "B" reason="First" reason="Second" destination="" extra="<script>"', '  outcome "C"');
	const { svg, diagnostics } = render(input);
	assert.ok(diagnostics.every(d => d.line === 3));
	assert.equal(boxes(svg).length, 3);
	assert.match(boxes(svg)[1].text, />First<\/text>/);
	assert.doesNotMatch(boxes(svg)[1].text, /Second|missing destination/);
	assert.match(description(svg), /B leads to C/);
	assert.ok(svg.indexOf('>Line 3:') > svg.lastIndexOf('</g>'));
	assert.match(svg, /&lt;script&gt;/);
	for (const missing of ['outcome', 'outcome ""', 'outcome "\\q"', 'outcome bare']) {
		const result = render(source(missing, '  outcome "Child"'));
		assert.equal(boxes(result.svg).length, 3);
		assert.match(boxes(result.svg)[1].text, />\[missing outcome\]<\/text>/);
		assert.equal(boxes(result.svg)[2].x, 468);
	}
	const recovered = render(source('outcome reason="Why" destination="There"'));
	assert.match(description(recovered.svg), /\(Why; There\)/);
	const fields = render(source('outcome "B" reason=bare destination="There" tone="done"'));
	assert.match(boxes(fields.svg)[1].text, />→ There<\/text>/);
	assert.match(fields.svg, /class="k-done"/);
});

test("over-depth subtrees are individually rejected and their ids never bind", () => {
	const input = source('outcome "B"', '  outcome "C"', '    outcome "D"',
		'      outcome "Too deep" id="deep"', '        outcome "Subtree" id="sub"',
		'          outcome ref="deep"', 'outcome ref="deep"', 'outcome ref="sub"', 'outcome "Last"');
	const { svg, diagnostics } = render(input);
	assert.deepEqual(diagnostics.map(d => d.line).sort((a,b) => a-b), [6,7,8,9,10]);
	assert.ok(diagnostics.filter(d => [9,10].includes(d.line)).every(d => /unknown ref/.test(d.message)));
	assert.equal(boxes(svg).length, 5);
	assert.equal(paths(svg).length, 4);
	for (const line of [6,7,8,9,10]) assert.match(svg, new RegExp(`>Line ${line}:`));
});

test("blank lines and comments preserve the indentation stack, rejected refs never enter it", () => {
	const input = source('outcome "B"', '  outcome "C"', '', '# a comment',
		'  # another comment', 'outcome ref="missing"', '    outcome "D"');
	const result = negative(input, 8, /unknown ref/);
	assert.equal(boxes(result.svg).length, 4);
	assert.equal(boxes(result.svg).at(-1)?.x, 526);
	assert.equal(paths(result.svg).length, 3);
	assert.match(description(result.svg), /C leads to D/);
});

test("rejected refs create no edge or box, including malformed and duplicate refs", () => {
	for (const bad of ['outcome ref=bare', 'outcome ref="missing"', 'outcome ref="e" reason="Why"',
		'outcome "Bad" ref="e"', '  outcome ref="b"', 'outcome ref="b"']) {
		const result = render(source('outcome "B" id="b"', '  outcome "D"', '  outcome "E" id="e"', bad));
		assert.ok(result.diagnostics.some(d => d.line === 6));
		assert.match(result.svg, />Line 6:/);
		assert.equal(boxes(result.svg).length, 4);
		assert.equal(paths(result.svg).length, 3);
	}
	const result = render(source('outcome "B"', '  outcome "D"', '  outcome "E" id="e"', 'outcome ref="e"', 'outcome ref="e"'));
	assert.equal(paths(result.svg).length, 4);
	assert.equal(boxes(result.svg).length, 4);
	assert.deepEqual(result.diagnostics.map(d => d.line), [7]);
});

test("every repeated field retains its first value, including an invalid first value", () => {
	const result = render(source('outcome "B"', '  outcome "D"',
		'  outcome "E" tone="done" tone="stop" destination="First" destination="Second" id="e" id="other"', 'outcome ref="e"'));
	assert.ok(result.diagnostics.every(d => d.line === 5));
	assert.match(result.svg, /class="k-done"/);
	assert.doesNotMatch(result.svg, /class="k-stop panel"/);
	assert.match(boxes(result.svg)[3].text, />→ First<\/text>/);
	assert.doesNotMatch(boxes(result.svg)[3].text, /Second/);
	assert.equal(paths(result.svg).length, 4);
	const invalid = render(source('outcome "B" reason="" reason="Later" tone="bad" tone="done" destination="" destination="Later"'));
	assert.doesNotMatch(boxes(invalid.svg)[1].text, /Later|→/);
	assert.doesNotMatch(invalid.svg, /class="k-done"/);
});

test("ids validate exact grammar, keep first bindings and never show on boxes", () => {
	for (const id of ["", "A", "a_b", "a b", "1a", "a".repeat(41)]) negative(source(`outcome "B" id="${id}"`), 3, /id must match/);
	for (const id of ["a", "a0-b", "a".repeat(40)]) {
		const result = render(source('outcome "B"', '  outcome "D"', `  outcome "E" id="${id}"`, `outcome ref="${id}"`));
		assert.deepEqual(result.diagnostics, []);
		assert.doesNotMatch(result.svg, new RegExp(`>${id}<`));
	}
	const bound = render(source('outcome "B"', '  outcome "D"', '  outcome "First" id="e"', 'outcome "Later" id="e"', 'outcome ref="e"'));
	assert.deepEqual(bound.diagnostics.map(d => d.line), [6]);
	assert.match(description(bound.svg), /A also leads to First/);
	const repeated = render(source('outcome "B"', '  outcome "E" id="bad_" id="e"', 'outcome ref="e"'));
	assert.ok(repeated.diagnostics.some(d => d.line === 5 && /unknown ref/.test(d.message)));
});

test("descriptions follow parent declaration order with refs immediately after each parent", () => {
	const input = source('outcome "B" reason="Why"', '  outcome "D"', '  outcome "E" id="e"',
		'outcome "C"', '  outcome ref="e"', 'outcome ref="e"');
	const { svg } = render(input);
	assert.equal(description(svg), 'Fan-out: A. A leads to B (Why) and C. A also leads to E. B leads to D and E. C also leads to E.');
	const duplicate = render(source('outcome "B"', '  outcome "Same"', 'outcome "C"', '  outcome "Same" destination="End"'));
	assert.equal(description(duplicate.svg), 'Fan-out: A. A leads to B and C. B leads to Same [B]. C leads to Same [C] (End).');
	const many = render(source('outcome "B"', 'outcome "C"', 'outcome "D"'));
	assert.equal(description(many.svg), 'Fan-out: A. A leads to B, C and D.');
	const titled = render(input, { title: '<& "title"', idPrefix: 'figure <&>' });
	assert.equal(description(titled.svg), '<& "title"');
	const id = /aria-describedby="([^"]+)"/.exec(titled.svg)?.[1];
	assert.equal(id, 'figure.0020.003c.0026.003e-desc');
	assert.ok(titled.svg.includes(`<desc id="${id}">${description(svg)}</desc>`));
	assert.doesNotMatch(svg, /<desc|aria-describedby/);
});

test("valid v1 text and descriptions escape markup and use deterministic, scoped theme options", () => {
	const input = source('outcome "<script> & \\"quote\\"" reason="https://example.com" destination="javascript:alert(1)"');
	for (const scheme of ["auto", "light", "dark"] as const) {
		const options = { scheme: scheme === "auto" ? undefined : scheme, title: '<title> & "quote"', idPrefix: '<unsafe> "prefix"' };
		const result = render(input, options);
		assert.deepEqual(result.diagnostics, []);
		assert.equal(result.svg, render(input, options).svg);
		assert.match(result.svg, /&lt;script&gt; &amp;/);
		assert.match(result.svg, /<desc[^>]*>[^<]*&lt;script&gt;/);
		assert.match(result.svg, new RegExp(`class="ab ab-${scheme}"`));
		assert.doesNotMatch(result.svg, /<script|href=|onload=|<title>/);
		assert.doesNotMatch(result.svg, /\.ab\s*\{\s*--/);
		assert.ok(result.svg.includes('prefers-color-scheme') === (scheme === "auto"));
	}
});
