import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { render } from "./flow/index.ts";
import { toSvg } from "./flow/svg.ts";

const example = (name: string) =>
	readFileSync(join(import.meta.dirname, "examples", `${name}.flow`), "utf8");

// An intentionally diagnostic-bearing loop, kept out of the example set.
const crossingLoop = () => example("loop")
	.replace(/^ready-to-merge -\.-> needs-changes.*\n/m, "")
	.replace(/^integrator --> needs-changes.*\n/m, "")
	.replace("reviewer --> needs-changes tone=rework : changes-requested", "reviewer -.-> needs-changes tone=agent")
	.replace(/^needs-changes --> implementer.*$/m, "integrator --> implementer tone=rework from=left to=left label=end : revise the same PR");

test("a local knockout puts the later edge above an interior crossing", () => {
	const branch = "reviewer -.-> needs-changes tone=agent";
	const back = "integrator --> implementer tone=rework from=left to=left label=end : revise the same PR";
	const source = crossingLoop();
	const swapped = source.replace(`${branch}\n${back}`, `${back}\n${branch}`);
	assert.notEqual(swapped, source);
	for (const [text, upper, lower] of [[source, "rework", "agent"], [swapped, "agent", "rework"]]) {
		for (const scheme of ["light", "dark"] as const) {
			const { svg, layout, diagnostics } = render(text, { scheme });
			const line = text.split("\n").findIndex((l) => l.startsWith(upper === "rework" ? back : branch)) + 1;
			assert.deepEqual(diagnostics, [{
				line, severity: "warning",
				message: upper === "rework"
					? "edge integrator → implementer crosses reviewer → needs-changes"
					: "edge reviewer → needs-changes crosses integrator → implementer",
			}]);
			const gaps = [...svg.matchAll(/<path d="([^"]+)" class="knockout knockout-band"\/>/g)];
			assert.equal(gaps.length, 1);
			assert.ok(svg.indexOf(`class="e e-${lower}`) < gaps[0].index);
			assert.ok(gaps[0].index < svg.indexOf(`class="e e-${upper}`));
			assert.match(svg, /class="e e-agent dash"/);
			assert.match(svg, /stroke-width:5\.6/);
			assert.match(svg, /--bg:var\(--ab-bg,/);
			assert.match(svg, /--band:var\(--ab-band,/);
			// Markers and all text/nodes follow the last gap; no additional IDs.
			assert.ok(gaps[0].index < svg.indexOf('class="arrow"'));
			assert.ok(gaps[0].index < svg.indexOf("<text"));
			assert.ok(gaps[0].index < svg.indexOf('class="k-'));
			assert.equal([...svg.matchAll(/\bid="/g)].length, [...svg.matchAll(/<marker /g)].length);
			assert.equal(svg, render(text, { scheme }).svg);
			assert.deepEqual(layout.nodes, render(source).layout.nodes);
			for (const route of layout.routes) {
				assert.deepEqual(route.points, render(source).layout.routes.find((r) => r.edge.from === route.edge.from && r.edge.to === route.edge.to)?.points);
			}
		}
	}
});

test("knockouts cover every crossing, stop at bends and match band boundaries", () => {
	const layout = render("flow v0\nbox a\nbox b\na --> b\nb --> a\n").layout;
	layout.routes[0].points = [[50, 10], [50, 90]];
	layout.routes[1].points = [[10, 30], [90, 30], [90, 70], [10, 70]];
	let svg = toSvg(layout);
	assert.deepEqual([...svg.matchAll(/<path d="([^"]+)" class="knockout"/g)].map((m) => m[1]), ["M44,30 L56,30", "M44,70 L56,70"]);
	// A crossing close to a bend must not extend the knockout past the bend.
	layout.routes[1].points = [[49, 30], [52, 30]];
	svg = toSvg(layout);
	assert.match(svg, /d="M49,30 L52,30" class="knockout"/);
	// Vertical under-strokes split where the band fill ends.
	layout.routes.reverse();
	layout.bands = [{ label: "Band", y: 10, h: 30, shaded: true }];
	svg = toSvg(layout);
	assert.match(svg, /d="M50,24 L50,32" class="knockout knockout-band"/);
	assert.match(svg, /d="M50,32 L50,36" class="knockout"/);
});

test("shared endpoints, segment endpoints and collinear overlaps gain no knockouts", () => {
	const layout = render("flow v0\nbox a\nbox b\na --> b\nb --> a\n").layout;
	layout.routes[0].points = [[10, 30], [90, 30]];
	for (const points of [
		[[90, 30], [90, 90]],
		[[50, 30], [50, 90]],
		[[50, 30], [100, 30]],
	] as [number, number][][]) {
		layout.routes[1].points = points;
		assert.doesNotMatch(toSvg(layout), /class="knockout/);
	}
	assert.doesNotMatch(render(example("loop")).svg, /class="knockout/);
});

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
