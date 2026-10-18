import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DARK, LIGHT, render } from "./flow/index.ts";

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

test("neutral works on every node kind, edges and matching legend samples", () => {
	const source = example("neutral");
	const { svg, diagnostics, layout } = render(source, { idPrefix: "neutral" });
	assert.deepEqual(diagnostics, []);
	assert.equal(svg, render(source, { idPrefix: "neutral" }).svg);
	assert.deepEqual(
		layout.nodes.filter((p) => p.node.tone === "neutral").map((p) => p.node.kind),
		["text", "box", "panel", "pill", "end"],
	);
	assert.ok(layout.routes.every((r) => r.tone === "neutral"));
	assert.equal(layout.legend?.keys.length, 6);
	assert.ok(layout.legend.keys.every((k) => k.item.tone === "neutral"));
	assert.ok(svg.includes(".ab .t-neutral{fill:var(--neutral)}"));
	assert.ok(svg.includes(".ab .e-neutral{stroke:var(--neutral)}"));
	assert.ok(svg.includes(".ab .k-neutral{fill:var(--neutral-bg);stroke:var(--neutral);stroke-width:1.5}"));
	// Each count covers both the diagram and its legend samples.
	assert.equal([...svg.matchAll(/<rect [^>]*class="k-neutral"/g)].length, 4);
	assert.equal([...svg.matchAll(/<rect [^>]*class="k-neutral panel"/g)].length, 2);
	assert.equal([...svg.matchAll(/<circle [^>]*class="t-neutral"/g)].length, 3);
	assert.equal([...svg.matchAll(/class="e e-neutral(?: dash)?" marker-end="url\(#neutral-neutral\)"/g)].length, 4);
	assert.match(svg, /<marker id="neutral-neutral"[^>]*><path [^>]*class="t-neutral"\/><\/marker>/);
	assert.ok(svg.includes('class="m s13 b t-neutral">neutral</text>'));
});

test("neutral palettes support host overrides and readable light and dark fills", () => {
	const luminance = (hex: string) => {
		const channels = [1, 3, 5].map((i) => {
			const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
			return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
		});
		return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
	};
	const contrast = (a: string, b: string) => {
		const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
		return (hi + 0.05) / (lo + 0.05);
	};
	const source = example("neutral");
	const automatic = render(source).svg;
	for (const [scheme, palette] of [["light", LIGHT], ["dark", DARK]] as const) {
		const { svg, diagnostics } = render(source, { scheme });
		assert.deepEqual(diagnostics, []);
		assert.ok(!svg.includes("prefers-color-scheme"));
		for (const key of ["neutral", "neutral-bg"] as const) {
			const variable = `--${key}:var(--ab-${key},${palette[key]});`;
			assert.ok(svg.includes(variable));
			assert.ok(automatic.includes(variable));
		}
		for (const foreground of ["ink", "muted", "neutral"] as const)
			assert.ok(contrast(palette[foreground], palette["neutral-bg"]) >= 4.5, `${scheme}: ${foreground} text on neutral fill`);
		for (const background of ["surface", "band"] as const)
			assert.ok(contrast(palette["neutral-bg"], palette[background]) >= 1.1, `${scheme}: neutral fill differs from ${background}`);
	}
});

test("existing defaults and surface-filled ink and muted shapes keep their styles", () => {
	const { svg, diagnostics, layout } = render(`flow v0
text caption
pill label
box step
end done
panel note
box ink tone=ink
box muted tone=muted
panel ink-panel tone=ink
panel muted-panel tone=muted
`);
	assert.deepEqual(diagnostics, []);
	assert.deepEqual(layout.nodes.map((p) => p.node.tone), ["muted", "muted", "agent", "done", "stop", "ink", "muted", "ink", "muted"]);
	for (const tone of ["ink", "muted"]) {
		assert.ok(svg.includes(`.ab .k-${tone}{fill:var(--surface);stroke:var(--line);stroke-width:1.5}`));
		assert.ok(svg.includes(`.ab .t-${tone}{fill:var(--muted)}.ab .e-${tone}{stroke:var(--muted)}`));
		assert.match(svg, new RegExp(`<rect [^>]*class="k-${tone}"`));
		assert.match(svg, new RegExp(`<rect [^>]*class="k-${tone} panel"`));
	}
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
