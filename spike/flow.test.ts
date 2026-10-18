import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
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

test("box subtitles wrap and grow their row while edges follow the box", () => {
	const { layout, svg, diagnostics } = render(
		[
			"flow v0",
			"columns main side",
			'box issue-preparer col=main "grounds it in the code, challenges assumptions, aims for an MVP"',
			"box next",
			"pill peer col=side row=issue-preparer",
			"issue-preparer --> next",
			"issue-preparer --> peer",
		].join("\n"),
	);
	assert.deepEqual(diagnostics, []);
	const [box, next, peer] = layout.nodes;
	assert.equal(box.w, 235); // 34 subtitle characters at 6.1px, plus 28px padding.
	assert.equal(next.w, box.w);
	assert.equal(box.h, 61);
	assert.equal(next.y, box.y + box.h + 30);
	assert.equal(peer.y, Math.round(box.y + (box.h - peer.h) / 2));
	const cx = Math.round(box.x + box.w / 2);
	assert.deepEqual(layout.routes[0].points, [
		[cx, box.y + box.h],
		[cx, next.y],
	]);
	assert.deepEqual(layout.routes[1].points, [
		[box.x + box.w, Math.round(box.y + box.h / 2)],
		[peer.x, Math.round(peer.y + peer.h / 2)],
	]);
	assert.deepEqual(
		[
			...svg.matchAll(
				/<text x="(\d+)" y="(\d+)" text-anchor="middle" class="s11 muted">(.*?)<\/text>/g,
			),
		].map((m) => [Number(m[1]), Number(m[2]), m[3]]),
		[
			[cx, box.y + 36, "grounds it in the code, challenges"],
			[cx, box.y + 51, "assumptions, aims for an MVP"],
		],
	);
});

test("box wrapping keeps long words intact and matches panel text", () => {
	const word = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN";
	const { layout, svg, diagnostics } = render(
		[
			"flow v0",
			"columns main side",
			`box worker col=main "before ${word} after <&>"`,
			"panel note col=side row=worker span=2",
			`  muted "before ${word} after <&>"`,
			"box next col=main",
		].join("\n"),
	);
	assert.deepEqual(diagnostics, []);
	const [box, panel, next] = layout.nodes;
	assert.equal(box.w, 272); // The intact 40-character word sets the width.
	assert.equal(box.h, 76);
	assert.equal(panel.h, box.h + 30 + next.h);
	assert.deepEqual(
		[...svg.matchAll(/class="s11 muted">(.*?)<\/text>/g)].map((m) => m[1]),
		["before", word, "after &lt;&amp;&gt;", "before", word, "after &lt;&amp;&gt;"],
	);
	for (let i = 0; i < 3; i++) {
		assert.ok(svg.includes(
			`y="${box.y + 36 + i * 15}" text-anchor="middle" class="s11 muted">`,
		));
	}
});

test("short and absent subtitles keep box geometry and titles stay unwrapped", () => {
	for (const subtitle of ["", ' "short subtitle"']) {
		const { layout, svg, diagnostics } = render(
			`flow v0\nbox worker col=main${subtitle}\n`,
		);
		assert.deepEqual(diagnostics, []);
		assert.deepEqual(
			layout.nodes.map(({ x, y, w, h }) => [x, y, w, h]),
			[[16, 16, 180, 46]],
		);
		assert.ok(svg.includes(
			'<text x="106" y="35" text-anchor="middle" class="m s13 b t-agent">worker</text>',
		));
		assert.equal(
			svg.includes('<text x="106" y="52" text-anchor="middle" class="s11 muted">short subtitle</text>'),
			Boolean(subtitle),
		);
	}
	const title = "a long title that continues on a single line";
	const { layout, svg } = render(
		`flow v0\nbox worker col=main title="${title}" "short subtitle"\n`,
	);
	assert.equal(layout.nodes[0].w, Math.round(title.length * 7.8 + 32));
	assert.equal(layout.nodes[0].h, 46);
	assert.ok(svg.includes(`>${title}</text>`));
});
