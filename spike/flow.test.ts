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

test("shape legend samples show bare and quoted text with their shape and tone", () => {
	const source = `flow v0
legend
  pill tone=done "GitHub label" sample=ready
  box sample="two words" "agent role"
  end "final state" sample=Complete
  panel tone=stop sample="A person decides" "manual step"
`;
	for (const scheme of ["light", "dark"] as const) {
		const { svg, diagnostics, layout } = render(source, { scheme });
		assert.deepEqual(diagnostics, []);
		assert.deepEqual(layout.legend?.keys.map((k) => [k.item.sample, k.item.text]), [
			["ready", "GitHub label"],
			["two words", "agent role"],
			["Complete", "final state"],
			["A person decides", "manual step"],
		]);
		assert.match(svg, /height="20" rx="10" class="pill"\/><circle[^>]+class="t-done"\/><text[^>]+class="m s11">ready<\/text>/);
		assert.match(svg, /height="20" rx="3" class="k-agent"\/><text[^>]+text-anchor="middle" class="m s11 t-agent">two words<\/text>/);
		assert.match(svg, /height="20" rx="10" class="k-done"\/><text[^>]+class="m s11 t-done">Complete<\/text>/);
		assert.match(svg, /height="20" rx="3" class="k-stop panel"\/><text[^>]+class="m s11 t-stop">A person decides<\/text>/);
		assert.match(svg, /Legend: ready: GitHub label, two words: agent role, Complete: final state, A person decides: manual step/);
		assert.ok(svg.includes(scheme === "light" ? "var(--ab-done,#2a7845)" : "var(--ab-done,#72cf91)"));
		assert.equal(svg, render(source, { scheme }).svg);
	}
});

test("legend sample text expands the canvas and wraps whole entries without overlaps", () => {
	const { svg, diagnostics, layout } = render(`flow v0
legend
  pill sample="a representative label that is much longer than the diagram" "GitHub label"
  box sample="two words" "agent role"
  end "final state"
  panel sample="A person decides" "manual step"
  pill sample=ready "label"
`);
	assert.deepEqual(diagnostics, []);
	const keys = layout.legend?.keys;
	assert.ok(keys);
	assert.ok(new Set(keys.map((k) => k.y)).size > 1, "entries wrap onto rows");
	assert.ok(keys.some((k, i) => i > 0 && k.y === keys[i - 1].y), "a row can contain several entries");
	const groups = [...svg.matchAll(/<g><rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)".*?<\/g>/gs)];
	assert.equal(groups.length, keys.length);
	const rects = groups.map((g, i) => {
		const [x, y, w, h] = g.slice(1).map(Number);
		const texts = [...g[0].matchAll(/<text x="([\d.]+)" y="([\d.]+)"([^>]+)>(.*?)<\/text>/gs)];
		const meaning = texts.at(-1);
		assert.ok(meaning);
		assert.equal(Number(meaning[1]), x + w + 6);
		const right = Number(meaning[1]) + [...keys[i].item.text].length * 6.1;
		assert.ok(x >= 0 && right <= layout.width);
		assert.ok(y > (layout.legend?.y ?? 0) && y + h <= layout.height);
		if (keys[i].item.sample) {
			const text = texts[0];
			const textWidth = [...keys[i].item.sample].length * 6.6;
			const left = Number(text[1]) - (text[3].includes('text-anchor="middle"') ? textWidth / 2 : 0);
			assert.ok(left > x && left + textWidth < x + w, "sample text fits inside its shape");
			assert.ok(Number(text[2]) - 11 >= y && Number(text[2]) <= y + h);
		}
		return { x, y, right, bottom: y + h };
	});
	for (let i = 0; i < rects.length; i++) {
		for (const other of rects.slice(i + 1)) {
			const r = rects[i];
			assert.ok(r.right < other.x || other.right < r.x || r.bottom < other.y || other.bottom < r.y);
		}
	}
});

test("legend sample text does not replace the required meaning or become SVG markup", () => {
	const { svg, diagnostics } = render(`flow v0
legend
  pill sample=ready
  box sample="<script>&" "<meaning>&"
`);
	assert.deepEqual(diagnostics.map((d) => [d.line, d.message]), [
		[3, "a legend line needs its meaning in quotes"],
	]);
	assert.ok(svg.includes("&lt;script&gt;&amp;</text>"));
	assert.ok(svg.includes("&lt;meaning&gt;&amp;</text>"));
	assert.ok(!svg.includes("<script>"));
});

test("line legend samples diagnose sample= and keep drawing lines and meanings", () => {
	const { svg, diagnostics, layout } = render(`flow v0
legend
  edge sample=ready "solid line"
  dashed tone=rework "dashed line" sample="two words"
  edge sample="" "empty sample"
  dashed sample= "missing sample"
`);
	assert.deepEqual(diagnostics.map((d) => [d.line, d.message]), [3, 4, 5, 6].map((line) => [line, "sample= is only supported on shape legend entries"]));
	assert.equal(layout.legend?.keys.length, 4);
	assert.ok(layout.legend?.keys.every((k) => k.item.sample === ""));
	assert.match(svg, /class="e e-ink" marker-end=/);
	assert.match(svg, /class="e e-rework dash" marker-end=/);
	assert.match(svg, />solid line<\/text>/);
	assert.match(svg, />dashed line<\/text>/);
	assert.ok(!svg.includes("ready"));
	assert.ok(!svg.includes("two words"));
});

test("legends without sample text preserve existing SVG bytes", () => {
	assert.equal(render(example("deploy"), { idPrefix: "deploy" }).svg,
		readFileSync(join(import.meta.dirname, "out", "deploy.svg"), "utf8"));
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
