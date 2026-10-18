import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CHAR, panelLines } from "./flow/grid.ts";
import { render } from "./flow/index.ts";

const example = (name: string) =>
	readFileSync(join(import.meta.dirname, "examples", `${name}.flow`), "utf8");

test("the loop renders with no diagnostics", () => {
	assert.deepEqual(render(example("loop")).diagnostics, []);
});

test("the same source gives the same bytes", () => {
	assert.equal(render(example("loop")).svg, render(example("loop")).svg);
});

test("the rendered loop matches the checked-in figure", () => {
	assert.equal(
		render(example("loop"), { idPrefix: "loop" }).svg,
		readFileSync(join(import.meta.dirname, "out", "loop.svg"), "utf8"),
	);
});

test("swapped slots are reported as a crossing on the right line", () => {
	const swapped = example("loop")
		.replace("to=bottom.2 : on-conflict", "to=bottom.1 : on-conflict")
		.replace(
			"to=bottom.1 : changes-requested",
			"to=bottom.2 : changes-requested",
		);
	const lines = swapped.split("\n");
	const integratorLine =
		lines.findIndex((l) => l.startsWith("integrator --> needs-changes")) + 1;
	const { diagnostics } = render(swapped);
	assert.deepEqual(
		diagnostics.map((d) => [d.line, d.message]),
		[
			[
				integratorLine,
				"edge integrator → needs-changes crosses ready-to-merge → needs-changes",
			],
		],
	);
});

test("an edge through a node is reported", () => {
	const { diagnostics } = render("flow v0\nbox a\nbox b\nbox c\na --> c\n");
	assert.ok(diagnostics.some((d) => d.message === "edge a → c runs through b"));
});

test("broken input never throws", () => {
	for (const source of [
		"",
		"nonsense",
		"flow v9\nbox a\na --> missing",
		"flow v0\n  pill orphan",
		"flow v0\nbox a row=a span=0",
	]) {
		const { svg } = render(source);
		assert.match(svg, /^<svg /);
	}
	const { diagnostics } = render("flow v0\nbox a\na --> missing\n");
	assert.deepEqual(
		diagnostics.map((d) => d.message),
		["unknown node `missing`; edge dropped"],
	);
});

test("every row a spanning panel covers meets it with a straight edge", () => {
	const source = [
		"flow v0",
		"columns main stop",
		"box a col=main",
		"box b",
		"box c",
		"box d",
		"panel p col=stop row=a span=4",
		'  strong "A person decides"',
		"a --> b",
		"b --> c",
		"c --> d",
		"a --> p : blocked",
		"b --> p : blocked",
		"c --> p : blocked",
		"d --> p : blocked, maintainer merge",
		"",
	].join("\n");
	const { diagnostics, layout } = render(source);
	assert.deepEqual(diagnostics, []);
	for (const r of layout.routes.filter((r) => r.edge.to === "p")) {
		assert.equal(r.points.length, 2, `${r.edge.from} → p should be straight`);
	}
});

test("panel text uses a wide child pill's width for every text style", () => {
	const fitting = "Pick the newest item then oldest item";
	assert.ok(fitting.length > 34);
	for (const kind of ["text", "muted", "strong"] as const) {
		const source = [
			"flow v0",
			"panel note col=main",
			"  pill waiting-for-maintainer-approval",
			`  ${kind} "${fitting}"`,
			`  ${kind} "${fitting} again"`,
			"  rule",
			"  pill done",
			"box after",
		].join("\n");
		const { svg, layout, diagnostics } = render(source);
		assert.deepEqual(diagnostics, []);
		const [panel, after] = layout.nodes;
		assert.equal(panel.w, 287, "automatic width still comes from the pill");
		const cls =
			kind === "strong" ? "s12 b" : kind === "muted" ? "s11 muted" : "s11";
		const lines = [
			...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)" text-anchor="middle" class="([^"]+)">([^<]*)<\/text>/g),
		].filter((m) => m[2] === cls);
		assert.deepEqual(lines.map((m) => m[3]), [fitting, fitting, "again"], kind);
		assert.deepEqual(lines.map((m) => Number(m[1]) - panel.y), [61, 79, 94]);
		assert.equal(panel.h, 157, "height includes exactly one extra text line");
		assert.ok(svg.includes(`y1="${panel.y + 106}"`), "rule follows wrapped text");
		assert.ok(after.y >= panel.y + panel.h + 30);
		const narrow = render(
			source.replace("  pill waiting-for-maintainer-approval\n", ""),
		);
		assert.equal(
			narrow.layout.nodes[0].w,
			242,
			"notes still have bounded automatic widths",
		);
	}
});

test("panel wrapping accounts for padding, font estimates and exact fits", () => {
	for (const kind of ["text", "muted", "strong"] as const) {
		const charWidth = kind === "strong" ? CHAR.sans12 : CHAR.sans11;
		const child = { kind, text: "one two go" };
		const exactWidth = 28 + 10 * charWidth;
		assert.deepEqual(panelLines(child, exactWidth), ["one two go"]);
		assert.deepEqual(panelLines(child, exactWidth - 0.01), ["one two", "go"]);
		assert.deepEqual(
			panelLines({ kind, text: "  one   two\tgo more  " }, exactWidth),
			["one two go", "more"],
		);
		assert.deepEqual(panelLines({ kind, text: "" }, exactWidth), [""]);
		assert.deepEqual(
			panelLines({ kind, text: "🟢🟢 🟢🟢" }, 28 + 5 * charWidth),
			["🟢🟢 🟢🟢"],
		);
		assert.deepEqual(
			panelLines({ kind, text: "unbreakable" }, 28 + 3 * charWidth),
			["unbreakable"],
		);
	}
});

test("spanning panels size and centre content using the rendered line breaks", () => {
	for (const extraRows of ["", "box extra col=main\nbox extra2\nbox extra3\n"]) {
		const source = example("panel-wrap")
			.replace("panel note", `${extraRows}panel note`)
			.replace("span=2", extraRows ? "span=6" : "span=2");
		const { svg, layout, diagnostics } = render(source);
		assert.deepEqual(diagnostics, []);
		const panel = layout.nodes.find((p) => p.node.id === "note");
		assert.ok(panel);
		assert.equal(panel.w, 287);
		const contentHeight = 208;
		if (extraRows) assert.ok(panel.h > contentHeight);
		else assert.equal(panel.h, contentHeight, "wrapped text grows the spanned rows");
		const offset = Math.round(panel.y + 12 + (panel.h - contentHeight) / 2);
		const lines = [
			...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)" text-anchor="middle" class="(s11|s11 muted|s12 b)">([^<]*)<\/text>/g),
		].filter((m) => m[3].startsWith("Pick") || m[3] === "again" || m[3] === "now");
		assert.deepEqual(lines.map((m) => m[3]), [
			"Pick the newest item then oldest item",
			"Pick the newest item then oldest item",
			"again",
			"Pick the newest item then oldest item now",
			"Pick the newest item then oldest item",
			"now",
		]);
		assert.deepEqual(lines.map((m) => Number(m[1]) - offset), [49, 67, 82, 100, 118, 133]);
		assert.ok(Number(lines[0][1]) - 12 >= panel.y + 12);
		assert.ok(svg.includes(`y1="${offset + 145}"`), "rule is below all six text lines");
		assert.ok(offset + 152 + 30 <= panel.y + panel.h - 8, "final pill stays inside the panel");
		if (!extraRows) {
			const next = layout.nodes.find((p) => p.node.id === "next");
			assert.ok(next && next.y >= panel.y + panel.h + 30);
		}
	}
});

test("a pinned scheme carries one palette and no media query", () => {
	const { svg } = render(example("loop"), { scheme: "dark" });
	assert.ok(!svg.includes("prefers-color-scheme"));
	assert.ok(svg.includes("var(--ab-ink,#e5e9ef)"));
});

test("row= chains reach the row's first node, and loops are reported", () => {
	const chain = render(
		"flow v0\ncolumns a b c d\nbox one col=a\nbox two col=b row=one\nbox three col=c row=two\nbox four col=d row=three\n",
	);
	assert.deepEqual(chain.diagnostics, []);
	assert.equal(new Set(chain.layout.nodes.map((p) => p.y)).size, 1);
	assert.ok(!chain.svg.includes("NaN"));
	const loop = render(
		"flow v0\ncolumns a b\nbox one col=a row=two\nbox two col=b row=one\n",
	);
	assert.ok(loop.diagnostics.some((d) => d.line === 3 && /row=two/.test(d.message)));
	assert.ok(!loop.svg.includes("NaN"));
});

test("marker ids keep only safe characters", () => {
	const { svg } = render(example("loop"), { idPrefix: '"><script>' });
	assert.ok(!svg.includes("<script>"));
	assert.ok(svg.includes('id="---script--ink"'));
});

test("loops and labels stay inside the canvas", () => {
	const { layout } = render(
		"flow v0\ncolumns a\nbox one col=a\nbox two\nbox three\none --> three from=left to=left : a long label that reaches far\nthree --> one from=right to=right label=end : and back round the right side\n",
	);
	const xs = layout.routes.flatMap((r) => r.points.map((p) => p[0]));
	assert.ok(Math.min(...xs) >= 0);
	assert.ok(Math.max(...xs) <= layout.width);
	for (const r of layout.routes) {
		const l = r.label;
		assert.ok(l);
		const left = l.anchor === "start" ? l.x : l.x - l.w;
		assert.ok(left >= 0 && left + l.w <= layout.width, l.text);
	}
});

test("a legend draws under the diagram and names its keys", () => {
	const { svg, diagnostics, layout } = render(example("deploy"));
	assert.deepEqual(diagnostics, []);
	assert.equal(layout.legend?.keys.length, 4);
	const bottom = Math.max(...layout.nodes.map((p) => p.y + p.h));
	assert.ok(layout.legend.keys.every((k) => k.y > bottom));
	assert.match(svg, /Legend: event or state, automated job/);
	assert.ok(
		render("flow v0\nbox a col=main\nlegend\n  shape \"x\"\n").diagnostics.some(
			(d) => d.line === 4,
		),
	);
});

test("an edge that runs back through its own node is reported", () => {
	const { diagnostics } = render(
		"flow v0\ncolumns a\nbox one col=a\nbox two\none --> two from=top to=bottom\n",
	);
	assert.ok(diagnostics.some((d) => d.line === 5 && /through one/.test(d.message)));
});

test("an empty section is reported and takes no band", () => {
	const { diagnostics, layout, svg } = render(
		'flow v0\ncolumns a\nsection "Empty"\nsection "Actual"\nbox one col=a\nsection "Later"\nbox two\n',
	);
	assert.ok(diagnostics.some((d) => d.line === 3));
	assert.deepEqual(
		layout.bands.map((b) => b.label),
		["Actual", "Later"],
	);
	const later = layout.bands[1];
	const two = layout.nodes.find((p) => p.node.id === "two");
	assert.ok(two && two.y > later.y && later.y + later.h <= layout.height);
	assert.ok(!svg.includes("NaN"));
});

test("title= names text and end nodes too", () => {
	const { layout, diagnostics } = render(
		'flow v0\ncolumns a\nend done col=a title="All done"\ntext note title=Hello "and more"\n',
	);
	assert.equal(layout.nodes[0].node.label, "All done");
	assert.equal(layout.nodes[1].node.label, "Hello");
	assert.ok(diagnostics.some((d) => d.line === 4));
});

test("a span past the last row is reported once", () => {
	const { diagnostics } = render("flow v0\ncolumns a b\nbox one col=a\nbox two col=b row=one span=3\n");
	assert.equal(diagnostics.filter((d) => /span=3/.test(d.message)).length, 1);
});
