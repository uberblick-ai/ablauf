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

// Check text bounds in SVG coordinates, including long tokens and tall rows.
// A maintainer still reviews the actual fonts in both playground themes.
test("fan-out text stays inside its step, branch and destination at document width", () => {
	const sources = [example("approvals"), example("run-endings"),
		`fan-out v0\nstep "${"Long step ".repeat(35)}"\noutcome "${"a".repeat(100)}" reason="${"a long explanation ".repeat(50)}" destination="${"Destination".repeat(20)}"\noutcome "Next" reason="No overlap" destination="End"`,
		'fan-out v0\nstep "Only one outcome"\noutcome "Done" reason="Why" destination="There"'];
	const right: Record<string, number> = { 32: 176, 232: 460, 494: 646 };
	for (const source of sources) for (const scheme of ["light", "dark"] as const) {
		const { svg, diagnostics, layout } = render(source, { scheme });
		assert.deepEqual(diagnostics, []);
		assert.ok(layout.width <= 710);
		for (const [, x, y, classes, content] of svg.matchAll(/<text x="(\d+)" y="([\d.]+)" class="([^"]+)">([^<]*)<\/text>/g)) {
			const charWidth = classes.includes("s13") ? CHAR.mono13 : classes.includes("cap") ? CHAR.mono11 + 0.88 : CHAR.mono12;
			assert.ok(x in right, `unexpected text column ${x}`);
			assert.ok(Number(x) + [...content].length * charWidth <= right[x], content);
			assert.ok(Number(y) - 12 >= 0 && Number(y) + 4 < layout.height, content);
		}
		// Each branch, its labels and its destination box end before the next branch starts.
		const extents = [...svg.matchAll(/<g data-line="\d+">([\s\S]*?)<\/g>/g)].map(([, row]) => {
			const ys = [...row.matchAll(/<text x="\d+" y="([\d.]+)"/g)].map(([, y]) => Number(y));
			const [, top, height] = /<rect x="478" y="([\d.]+)" width="184" height="(\d+)"/.exec(row) ?? [];
			const line = Number(/<path d="M216,([\d.]+)/.exec(row)?.[1]);
			return { top: Math.min(Number(top), ...ys.map((y) => y - 12)), bottom: Math.max(Number(top) + Number(height), ...ys.map((y) => y + 4)), line };
		});
		for (const [i, row] of extents.entries()) {
			assert.ok(row.top >= 0 && row.bottom <= layout.height);
			if (extents[i + 1]) assert.ok(row.bottom < extents[i + 1].top);
		}
		// The step's stub meets the spine, which spans the first to the last branch.
		const stub = /<path d="M192,([\d.]+) L216,([\d.]+)" class="e e-ink"\/>/.exec(svg);
		assert.ok(stub);
		const mid = Number(stub[1]);
		assert.ok(mid >= extents[0].line && mid <= extents[extents.length - 1].line);
	}
});
