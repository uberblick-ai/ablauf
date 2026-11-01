import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { render, type TextStyle } from "./flow/index.ts";

const prelude = 'sequence v0\nparticipant A\nparticipant B\nparticipant C\n';
const steps = (svg: string) => [...svg.matchAll(/data-step="(\d+)"/g)].map((m) => Number(m[1]));
const rectangles = (svg: string, kind: string) => [...svg.matchAll(new RegExp(`<rect x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)" rx="[\\d.]+" class="${kind}"[^>]*>`, "g"))].map((m) => m.slice(1).map(Number));

test("all UML group kinds, branches, deep nesting and empty groups retain source positions and numbering", () => {
	const source = `${prelude}section "Start"\nA --> B: First\nalt Matches\nopt Optional\nloop Retry\ngroup Deep\nC --> C: Rightmost self-message\nend\nend\nend\nelse Otherwise\nB -.-> A: Last\nend\ngroup Empty\nend\nsection "Finish"`;
	const { svg, diagnostics } = render(source);
	assert.deepEqual(diagnostics, []);
	assert.deepEqual(steps(svg), [1, 2, 3]);
	for (const kind of ["ALT", "OPT", "LOOP", "GROUP", "ELSE"]) assert.match(svg, new RegExp(`seq-kind">${kind}</text>`));
	const fills = rectangles(svg, "seq-group");
	assert.equal(fills.length, 3); // alt, opt and the separate empty group
	assert.equal((svg.match(/class="seq-group" fill-opacity="0.5"/g) ?? []).length, 3);
	assert.ok(fills[1][0] > fills[0][0]);
	assert.ok(fills[1][0] + fills[1][2] < fills[0][0] + fills[0][2]);
	for (const [x, , width] of fills) assert.ok(x >= 22 && x + width <= 678);
	const empty = fills[2];
	assert.equal(empty[0], 24);
	assert.equal(empty[0] + empty[2], 670);
	const loop = /data-step="2">([\s\S]*?)<\/g>/.exec(svg)?.[1] ?? "";
	const right = Number(/ Q([\d.]+),/.exec(loop)?.[1]);
	assert.ok(right < fills[1][0] + fills[1][2]);
	assert.match(svg, /class="seq-divider"/);
	assert.match(svg, /class="seq-rule"/);
	assert.ok(svg.indexOf('data-annotation="section"') < svg.indexOf('data-step="1"'));
	assert.ok(svg.indexOf('data-annotation="open"') > svg.indexOf('data-step="1"'));
	assert.ok(svg.lastIndexOf('data-annotation="section"') > svg.indexOf('data-step="3"'));
	assert.ok(svg.indexOf('class="seq-group"') < svg.indexOf('class="seq-life"'));
});

test("nesting has no syntax-depth limit and cumulative inset remains bounded", () => {
	const depth = 1000;
	const { svg, diagnostics } = render(`${prelude}${"group Nested\n".repeat(depth)}A --> C: Inside\n${"end\n".repeat(depth)}`);
	assert.deepEqual(diagnostics, []);
	assert.equal((svg.match(/data-annotation="open"/g) ?? []).length, depth);
	assert.equal(rectangles(svg, "seq-group").length, 2);
	const headings = [...svg.matchAll(/<text x="([\d.]+)"[^>]+seq-kind/g)].map((m) => Number(m[1]));
	assert.ok(Math.max(...headings) - Math.min(...headings) <= 24);
});

test("notes use one or two declared lifelines with order-independent bounds and literal text", () => {
	const one = render(`${prelude}note over A: "Quoted" \\path: still text\nnote over C: Right\nA --> B: Message`);
	assert.deepEqual(one.diagnostics, []);
	assert.match(one.svg, /&quot;Quoted&quot; \\path: still text/);
	assert.deepEqual(steps(one.svg), [1]);
	for (const [x, , width] of rectangles(one.svg, "seq-note")) assert.ok(width <= 220 && x >= 22 && x + width <= 678);
	assert.match(one.svg, /width="3"[^>]+class="t-rework"/);
	for (const ids of ["A,B", "A, B", "A ,B", "A , B", "B, A"]) {
		const result = render(`${prelude}note over ${ids}: Two lifelines`);
		assert.deepEqual(result.diagnostics, []);
		assert.deepEqual(rectangles(result.svg, "seq-note"), rectangles(render(`${prelude}note over A, B: Two lifelines`).svg, "seq-note"));
	}
	const nested = render(`${prelude}group Notes only\nnote over B: Content\nend`);
	const [x, , width] = rectangles(nested.svg, "seq-group")[0];
	assert.ok(x > 22 && x + width < 678);
});

test("annotation keyword precedence, reserved ids and literal unquoted group labels", () => {
	for (const keyword of ["alt", "opt", "loop", "group", "else", "end", "note", "section"]) {
		const result = render(`${prelude}participant ${keyword}\nA --> B: Kept`);
		assert.match(result.diagnostics[0].message, /reserved annotation id/);
		assert.match(result.svg, />Line 5: participant/);
		assert.equal((result.svg.match(/seq-title">/g) ?? []).length, 3);
	}
	const result = render(`${prelude}participant loopWorker\n  alt a --> b: "c" \\path\nloop --> Studio: x\nend\nelse "literal" : --> \\text\nloopWorker --> A: Good\nend`);
	assert.deepEqual(result.diagnostics, []);
	assert.deepEqual(steps(result.svg), [1]);
	assert.match(result.svg, /A --&gt; B: &quot;C&quot; \\PATH/);
	assert.match(result.svg, /--&gt; STUDIO: X/);
	assert.match(result.svg, /&quot;LITERAL&quot; : --&gt; \\TEXT/);
});

test("every malformed annotation diagnoses its own source line, stays visible and leaves stack/section unchanged", () => {
	for (const bad of [
		"alt", "opt   ", "loop", "group", "else", "else Outside", "end", "end extra",
		"note", "note A: Text", "note under A: Text", "note over: Text", "note over : Text", "note over A", "note over A:",
		"note over A:   ", "note over Missing: Text", "note over A, Missing: Text", "note over A,B,C: Text", "note over A,A: Text",
		"note over A,: Text", "note over ,A: Text", "note over A B: Text", 'section Title', 'section "Unclosed',
		'section ""', 'section "   "', 'section "Title" trailing', 'section "Embedded " quote"',
	]) {
		const result = render(`${prelude}section "Before"\n${bad}\nA --> B: Still draws\nsection "After"`);
		assert.ok(result.diagnostics.length, bad);
		assert.ok(result.diagnostics.every((d) => d.line === 6), bad);
		assert.match(result.svg, />Line 6:/, bad);
		assert.deepEqual(steps(result.svg), [1], bad);
		assert.equal((result.svg.match(/data-annotation="section"/g) ?? []).length, 2);
	}
	for (const bad of ['section "Rejected phase"', 'end extra', 'alt', 'else']) {
		const result = render(`${prelude}alt Outer\n${bad}\nelse Valid branch\nA --> B: Inside\nend\nsection "After"`);
		assert.ok(result.diagnostics.every((d) => d.line === 6));
		assert.equal((result.svg.match(/data-annotation="else"/g) ?? []).length, 1);
		assert.equal((result.svg.match(/data-annotation="section"/g) ?? []).length, 1);
	}
	const innermost = render(`${prelude}alt Outer\nopt Inner\nelse Cannot skip inner\nend\nelse Allowed\nend`);
	assert.deepEqual(innermost.diagnostics.map((d) => d.line), [7]);
	assert.equal((innermost.svg.match(/data-annotation="else"/g) ?? []).length, 1);
});

test("EOF closes and diagnoses every opening without rejecting the valid opening text", () => {
	const result = render(`${prelude}alt Outer\nloop Inner\nA --> C: Still draws`);
	assert.deepEqual(result.diagnostics.map((d) => d.line).sort(), [5, 6]);
	assert.ok(result.diagnostics.every((d) => /unclosed/.test(d.message)));
	for (const [, , , height] of rectangles(result.svg, "seq-group")) assert.ok(height > 0);
	assert.deepEqual(steps(result.svg), [1]);
	assert.doesNotMatch(result.svg, /seq-rejected">/);
});

test("all annotations wrap unbroken tokens with host mono face and weight-aware metrics", () => {
	const calls: [string, TextStyle][] = [];
	const mono = { family: "Wide Mono", measureText: (text: string, style: TextStyle) => {
		calls.push([text, style]); return [...text].length * (style.fontWeight === 600 ? 14 : 10);
	} };
	const source = `${prelude}section "${"phase".repeat(80)}"\nalt ${"condition".repeat(60)}\nnote over B: ${"note".repeat(60)}\nelse ${"other".repeat(80)}\nA --> C: Message\nend`;
	const result = render(source, { fonts: { mono, text: { family: "Unused", measureText: () => { throw new Error("text face used"); } } } });
	assert.deepEqual(result.diagnostics, []);
	assert.match(result.svg, /font-family:"Wide Mono"/);
	assert.ok(result.layout.height > render(source).layout.height);
	assert.ok(calls.some(([text, style]) => text === "ALT" && style.fontWeight === 600));
	for (const [, x, y, classes, text] of result.svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)" class="([^"]+)">([^<]*)<\/text>/g)) {
		const width = mono.measureText(text, { fontSize: classes.includes("s11") ? 11 : 12, fontWeight: classes.includes(" b ") ? 600 : 400 });
		assert.ok(Number(x) >= 0 && Number(x) + width <= 678, text);
		assert.ok(Number(y) < result.layout.height);
	}
	for (const role of ["seq-section", "seq-group-label", "seq-else-label", "seq-note-text"]) assert.ok((result.svg.match(new RegExp(`${role}">`, "g")) ?? []).length > 1, role);
});

test("claim contains its exact phases, expiry note and alternative branches without changing 15 messages", () => {
	const source = readFileSync(new URL("./examples/claim.flow", import.meta.url), "utf8");
	assert.match(source, /section "Claim"\nCreator --> Studio/);
	assert.match(source, /Backend --> OwnerInbox: Send 6-digit code\nnote over Backend: The code expires after 15 minutes/);
	assert.match(source, /section "Verify"\nCreator --> Studio: Enter code/);
	assert.match(source, /Check code and expiry\nalt Code matches/);
	assert.match(source, /The show is yours\nelse Wrong or expired code/);
	const result = render(source);
	assert.deepEqual(result.diagnostics, []);
	assert.deepEqual(steps(result.svg), Array.from({ length: 15 }, (_, i) => i + 1));
	assert.equal(result.svg, render(source).svg);
});
