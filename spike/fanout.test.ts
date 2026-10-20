import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CHAR } from "./flow/grid.ts";
import { DARK, LIGHT, render } from "./flow/index.ts";

const example = (name: string) =>
	readFileSync(join(import.meta.dirname, "examples", `${name}.flow`), "utf8");

test("fan-outs keep ordered triples and separate reasons for shared destinations", () => {
	const { svg, diagnostics, layout } = render([
		"# heading comment", "", "fan-out v0", 'step "Approval check"',
		'outcome "Cleared" reason="A maintainer started it" destination="Run"',
		'outcome "Outside" destination="Ask a person" reason="Input is outside the team"',
		'outcome "Edited" reason="Input changed since approval" destination="Ask a person"',
	].join("\n"));
	assert.deepEqual(diagnostics, []);
	assert.deepEqual(layout.nodes, []);
	assert.deepEqual(layout.routes, []);
	const text = svg.slice(svg.indexOf("</style>") + 8);
	assert.equal(text.match(/>Approval check<\/text>/g)?.length, 1);
	const rows = [...text.matchAll(/<g data-line="(\d+)">([\s\S]*?)<\/g>/g)];
	assert.deepEqual(rows.map((r) => Number(r[1])), [5, 6, 7]);
	for (const [i, fields] of [
		["Cleared", "A maintainer", "Run"],
		["Outside", "outside the team", "Ask a person"],
		["Edited", "changed since", "Ask a person"],
	].entries()) for (const field of fields) assert.ok(rows[i][2].includes(field), field);
});

test("broken fan-out entries report their lines and keep the rejected source visible", () => {
	const broken = [
		'outcome "Missing" reason="Only a reason"',
		'outcome "Empty" reason=" " destination=""',
		'outcome "Unquoted" reason=bare destination="Here"',
		'outcome "Unclosed reason="Broken" destination="Here"',
		'outcome "Duplicate" reason="First" reason="Second" destination="Here"',
		'outcome "Unknown" reason="Why" destination="Here" extra="Still visible"',
		'outcome "No gap"reason="Why" destination="Here"',
		'outcome "Bad escape" reason="\\q" destination="Here"',
		'outcome',
	];
	for (const line of broken) {
		const { svg, diagnostics } = render(`fan-out v0\nstep "Check"\n${line}\n`);
		assert.ok(diagnostics.length, line);
		assert.ok(diagnostics.every((d) => d.line === 3 && d.severity === "error"), line);
		assert.match(svg, /data-line="3"/);
		assert.match(svg, />Line 3:/);
		assert.ok(!svg.includes("NaN"));
	}
	const { svg, diagnostics } = render('fan-out v0\nstep "First"\nstep "Second"\nnot-an-entry "Visible"\noutcome "Good" reason="Why" destination="There"');
	assert.deepEqual(diagnostics.map((d) => d.line), [3, 4]);
	assert.ok(svg.includes("Second") && svg.includes("Visible") && svg.includes("Good"));
});

test("fan-out structural errors and newer versions still draw", () => {
	for (const source of ["fan-out v0", "fan-out", 'fan-out v0\nstep ""', 'fan-out v0\noutcome "Yes" reason="Why" destination="Here"']) {
		const result = render(source);
		assert.ok(result.diagnostics.length);
		assert.match(result.svg, /^<svg /);
		assert.ok(result.diagnostics.every((d) => d.line > 0));
	}
	const future = render('fan-out v9\nstep "Check"\noutcome "Yes" reason="Why" destination="Here"');
	assert.deepEqual(future.diagnostics.map((d) => [d.line, d.severity]), [[1, "warning"]]);
	const late = render('fan-out v0\noutcome "Yes" reason="Why" destination="Here"\nstep "Late"');
	assert.deepEqual(late.diagnostics.map((d) => d.line), [3]);
});

test("fan-out SVG is deterministic, escaped and uses the shared theme options", () => {
	const source = 'fan-out v0\nstep "<script> & \\"quoted\\""\noutcome "<img>" reason="https://example.com" destination="javascript:alert(1)"';
	const automatic = render(source);
	assert.deepEqual(automatic.diagnostics, []);
	assert.equal(automatic.svg, render(source).svg);
	assert.ok(automatic.svg.includes("&lt;script&gt; &amp; &quot;quoted&quot;"));
	assert.ok(!/<script|<img|href=|onload=/.test(automatic.svg));
	assert.match(automatic.svg, /@media \(prefers-color-scheme:dark\)/);
	assert.match(automatic.svg.split("\n")[0], /class="ab ab-auto"/);
	assert.equal(automatic.svg.match(/\.ab\.ab-auto\{--/g)?.length, 2);
	assert.doesNotMatch(automatic.svg, /\.ab\s*\{\s*--/);
	for (const scheme of ["light", "dark"] as const) {
		const svg = render(source, { scheme, title: 'A "fan-out" <title>' }).svg;
		assert.match(svg, /aria-label="A &quot;fan-out&quot; &lt;title&gt;"/);
		assert.ok(!svg.includes("prefers-color-scheme"));
		assert.ok(svg.split("\n")[0].includes(`class="ab ab-${scheme}"`));
		assert.equal(svg.match(/\.ab\.ab-(?:auto|light|dark)\{--/g)?.length, 1);
		assert.ok(svg.includes(`.ab.ab-${scheme}{--`));
		assert.doesNotMatch(svg, /\.ab\s*\{\s*--/);
		for (const [name, value] of Object.entries(scheme === "dark" ? DARK : LIGHT))
			assert.ok(svg.includes(`--${name}:var(--ab-${name},${value});`));
	}
});

test("fan-out tones colour their outcome boxes and unknown tones are reported", () => {
	const ok = render('fan-out v0\nstep "Check"\noutcome "Yes" reason="Why" destination="Here" tone="done"\noutcome "No" tone="stop" reason="Why not" destination="There"\noutcome "Plain" reason="Untoned" destination="Elsewhere"');
	assert.deepEqual(ok.diagnostics, []);
	assert.match(ok.svg, /class="k-done"\/>/);
	assert.match(ok.svg, /class="k-stop panel"\/>/);
	assert.match(ok.svg, /<g data-line="5">[\s\S]*?class="pill"\/>/);
	const bad = render('fan-out v0\nstep "Check"\noutcome "Yes" reason="Why" destination="Here" tone="loud"');
	assert.deepEqual(bad.diagnostics.map((d) => d.line), [3]);
	assert.match(bad.diagnostics[0].message, /unknown tone/);
	assert.match(bad.svg, />Line 3:/);
});

// Check text bounds in SVG coordinates, including long tokens and tall rows.
// A maintainer still reviews the actual fonts in both playground themes.
test("fan-out text stays inside its step, outcome and effect at document width", () => {
	const sources = [example("approvals"), example("run-endings"),
		`fan-out v0\nstep "${"Long step ".repeat(35)}"\noutcome "${"a".repeat(100)}" reason="${"a long explanation ".repeat(50)}" destination="${"Destination".repeat(20)}"\noutcome "Next" reason="No overlap" destination="End"`,
		'fan-out v0\nstep "Only one outcome"\noutcome "Done" reason="Why" destination="There" tone="done"'];
	const right: Record<string, number> = { 32: 150, 230: 372, 426: 662 };
	for (const source of sources) for (const scheme of ["light", "dark"] as const) {
		const { svg, diagnostics, layout } = render(source, { scheme });
		assert.deepEqual(diagnostics, []);
		assert.ok(layout.width <= 710);
		for (const [, x, y, classes, content] of svg.matchAll(/<text x="(\d+)" y="([\d.]+)" class="([^"]+)">([^<]*)<\/text>/g)) {
			const charWidth = classes.includes("s13") ? CHAR.mono13 : CHAR.mono12;
			assert.ok(x in right, `unexpected text column ${x}`);
			assert.ok(Number(x) + [...content].length * charWidth <= right[x], content);
			assert.ok(Number(y) - 12 >= 0 && Number(y) + 4 < layout.height, content);
		}
		// Each row's outcome box holds its text, and rows never overlap.
		const extents = [...svg.matchAll(/<g data-line="\d+">([\s\S]*?)<\/g>/g)].map(([, row]) => {
			const [, top, height] = /<rect x="216" y="([\d.]+)" width="170" height="(\d+)"/.exec(row) ?? [];
			const box = { top: Number(top), bottom: Number(top) + Number(height) };
			for (const [, y] of row.matchAll(/<text x="230" y="([\d.]+)"/g)) assert.ok(Number(y) - 12 >= box.top && Number(y) + 4 <= box.bottom);
			const ys = [...row.matchAll(/<text x="\d+" y="([\d.]+)"/g)].map(([, y]) => Number(y));
			assert.match(row, /<path d="M166,/);
			return { top: Math.min(box.top, ...ys.map((y) => y - 12)), bottom: Math.max(box.bottom, ...ys.map((y) => y + 4)) };
		});
		for (const [i, row] of extents.entries()) {
			assert.ok(row.top >= 0 && row.bottom <= layout.height);
			if (extents[i + 1]) assert.ok(row.bottom < extents[i + 1].top);
		}
	}
});

test("ladder fan-outs keep each outcome clear of its right-aligned destination", () => {
	const long = `fan-out v0\nstyle ladder\nstep "${"Long step ".repeat(80)}"\noutcome "${"a".repeat(60)}" reason="${"a long explanation ".repeat(30)}" destination="${"Destination ".repeat(30)}" tone="stop"\noutcome "Next" reason="No overlap" destination="End"`;
	for (const source of [example("run-endings-ladder"), long]) for (const scheme of ["light", "dark"] as const) {
		const { svg, diagnostics, layout } = render(source, { scheme });
		assert.deepEqual(diagnostics, []);
		assert.doesNotMatch(svg, /<marker/);
		for (const [, x, y, anchor, classes, content] of svg.matchAll(/<text x="(\d+)" y="([\d.]+)"( text-anchor="end")? class="([^"]+)">([^<]*)<\/text>/g)) {
			const width = [...content].length * (classes.includes("s13") ? CHAR.mono13 : CHAR.mono12);
			if (anchor) assert.ok(x === "662" && width <= 220, content);
			else assert.ok(Number(x) + width <= 662, content);
			assert.ok(Number(y) - 12 >= 0 && Number(y) + 4 < layout.height, content);
		}
		let previous = 0;
		for (const [, row] of svg.matchAll(/<g data-line="\d+">([\s\S]*?)<\/g>/g)) {
			const ys = [...row.matchAll(/ y="([\d.]+)"/g)].map(([, y]) => Number(y));
			assert.ok(Math.min(...ys) - 12 > previous);
			previous = Math.max(...ys) + 4;
			const [outcome] = [...row.matchAll(/<text x="60" y="[\d.]+" class="m s12 b">([^<]*)</g)].map(([, t]) => t);
			const [destination] = [...row.matchAll(/text-anchor="end" class="m s12 b">([^<]*)</g)].map(([, t]) => t);
			assert.ok(60 + [...outcome].length * CHAR.mono12 < 662 - [...destination].length * CHAR.mono12);
		}
	}
});

test("fan-out styles are checked and the default stays branches", () => {
	const entry = 'step "Check"\noutcome "Yes" reason="Why" destination="Here"';
	assert.match(render(`fan-out v0\n${entry}`).svg, /<marker/);
	assert.match(render(`fan-out v0\nstyle branches\n${entry}`).svg, /<marker/);
	for (const [style, message] of [["style zigzag", /unknown style/], ["style", /unknown style/]] as const) {
		const { svg, diagnostics } = render(`fan-out v0\n${style}\n${entry}`);
		assert.deepEqual(diagnostics.map((d) => d.line), [2]);
		assert.match(diagnostics[0].message, message);
		assert.match(svg, /<marker/);
		assert.match(svg, />Line 2:/);
	}
	const twice = render(`fan-out v0\nstyle ladder\nstyle branches\n${entry}`);
	assert.deepEqual(twice.diagnostics.map((d) => d.line), [3]);
	assert.doesNotMatch(twice.svg, /<marker/);
	const late = render(`fan-out v0\n${entry}\nstyle ladder`);
	assert.deepEqual(late.diagnostics.map((d) => d.line), [4]);
	assert.match(late.diagnostics[0].message, /before the step/);
});
