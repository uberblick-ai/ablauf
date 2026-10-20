import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { render } from "./flow/index.ts";

const example = (name: string) =>
	readFileSync(join(import.meta.dirname, "examples", `${name}.flow`), "utf8");

test("the project workflow example renders without problems in both schemes", () => {
	for (const scheme of ["light", "dark"] as const) {
		const { svg, diagnostics } = render(example("project-workflow"), { scheme });
		assert.deepEqual(diagnostics, []);
		assert.equal(svg, render(example("project-workflow"), { scheme }).svg);
	}
});

test("a decision draws a label box over a smaller diamond whose tips show", () => {
	const { svg, diagnostics, layout } = render(`flow v0
decision ok "Do stakeholders approve of the project concept?"
`);
	assert.deepEqual(diagnostics, []);
	const p = layout.nodes[0];
	assert.equal(p.node.kind, "decision");
	assert.equal(p.node.tone, "neutral");
	// Two wrapped lines: the box is 52px tall, with an 18px tip above and below.
	assert.equal(p.h, 2 * 15 + 22 + 36);
	const diamond = svg.match(/<path d="M([\d.]+),([\d.]+) L([\d.]+),([\d.]+) L[\d.]+,([\d.]+) L([\d.]+),[\d.]+ Z" class="k-neutral decision"\/>/);
	assert.ok(diamond, "diamond path");
	const [, , top, right, , bottom, left] = diamond.map(Number);
	assert.equal(top, p.y);
	assert.equal(bottom, p.y + p.h);
	assert.ok(left > p.x && right < p.x + p.w, "the box reaches past the diamond's sides");
	assert.match(svg, new RegExp(`<rect x="${p.x}" y="${p.y + 18}" width="${p.w}" height="${p.h - 36}" rx="6" class="k-neutral decision-box"/>`));
	assert.match(svg, />Do stakeholders approve of<\/text>/);
	assert.match(svg, />the project concept\?<\/text>/);
	assert.match(svg, /\.ab \.decision-box\{fill:var\(--surface\);fill-opacity:\.82\}/);
});

test("edges meet a decision at the middle of each side, and slots are diagnosed", () => {
	const { diagnostics, layout } = render(`flow v0
columns a b
decision q col=a "Ready?"
box yes col=b row=q
box no col=a
q --> yes : yes
q --> no from=bottom.2 to=top
`);
	assert.deepEqual(diagnostics.map((d) => [d.line, d.message]), [
		[7, "q is a decision; it has one port per side, so bottom.2 is drawn at the middle"],
	]);
	const q = layout.nodes.find((p) => p.node.id === "q");
	assert.ok(q);
	const [right, down] = layout.routes;
	assert.deepEqual(right.points[0], [q.x + q.w, q.y + q.h / 2]);
	assert.deepEqual(down.points[0], [q.x + q.w / 2, q.y + q.h]);
	// The other end slides to meet the decision head on.
	assert.equal(right.points.length, 2);
});

test("inline labels sit in a gap on the longest segment and keep clear line", () => {
	const { svg, diagnostics, layout } = render(`flow v0
columns a b
decision q col=a "Ready?"
box next col=b row=q
q --> next tone=done label=inline : yes
`);
	assert.deepEqual(diagnostics, []);
	const [r] = layout.routes;
	const l = r.label;
	assert.ok(l?.inline);
	assert.deepEqual(l.lines, ["YES"]);
	const [[x1, y], [x2]] = r.points;
	assert.equal(l.x, Math.round((x1 + x2) / 2));
	assert.equal(l.y, y);
	assert.ok(l.x - l.w / 2 - x1 >= 18 && x2 - (l.x + l.w / 2) >= 18, "clear line on both sides");
	assert.match(svg, /class="gap"\/>\n<text[^>]+letter-spacing="0.06em" class="s11 b t-done">YES<\/text>/);
	assert.match(svg, /\.ab \.gap\{fill:var\(--bg\)\}/);
});

test("long inline labels wrap and grow the row gap on vertical edges", () => {
	const { diagnostics, layout } = render(`flow v0
box one
box two
one --> two label=inline : yes, issues were found in the review
`);
	assert.deepEqual(diagnostics, []);
	const l = layout.routes[0].label;
	assert.deepEqual(l?.lines, ["YES, ISSUES WERE FOUND", "IN THE REVIEW"]);
	const [[, top], [, bottom]] = layout.routes[0].points;
	assert.ok(l && l.y - l.h / 2 - top >= 18 && bottom - (l.y + l.h / 2) >= 18);
});

test("an inline label too long for its segment is diagnosed", () => {
	const { diagnostics } = render(`flow v0
columns a b
box one col=a
box two col=b
one --> two from=bottom to=left label=inline : needs another look
`);
	assert.deepEqual(diagnostics.map((d) => d.line), [5]);
	assert.match(diagnostics[0].message, /^inline label "needs another look" needs a longer segment/);
});

test("inline labels on a shaded section use the band colour for their gap", () => {
	const { svg, diagnostics } = render(`flow v0
columns side main
section "One"
box a col=main
section "Two"
box b
box c
b --> c label=inline : next
`);
	assert.deepEqual(diagnostics, []);
	assert.match(svg, /class="gap gap-band"\/>/);
});

test("the legend draws a decision sample, with or without text", () => {
	const { svg, diagnostics } = render(`flow v0
legend
  decision "a question"
  decision sample="Ready?" "with text"
`);
	assert.deepEqual(diagnostics, []);
	assert.equal(svg.match(/class="k-neutral decision"\/><rect[^>]+class="k-neutral decision-box"\/>/g)?.length, 2);
	assert.match(svg, /class="m s11 t-neutral">Ready\?<\/text>/);
});

test("unknown label= values name inline", () => {
	const { diagnostics } = render("flow v0\nbox a\nbox b\na --> b label=chip : x\n");
	assert.deepEqual(diagnostics.map((d) => d.message), ["label= takes start, end or inline"]);
});

test("diagrams without decisions or inline labels add no styles for them", () => {
	const { svg } = render(example("loop"));
	assert.doesNotMatch(svg, /decision|\.gap/);
});

test("an inline label on a Z edge between neighbouring columns leaves the column gap alone", () => {
	const source = (label: string) => `flow v0
columns a b
box one col=a
box mid col=b row=one
box two col=b
one --> two from=right to=left label=inline : ${label}
`;
	const short = render(source("x"));
	const long = render(source("a fairly long answer here"));
	const x = (r: typeof short) => r.layout.nodes.find((p) => p.node.id === "two")?.x;
	assert.equal(x(long), x(short));
	assert.equal(long.layout.routes[0].points.length, 4);
});
