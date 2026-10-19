import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DARK, LIGHT, render } from "./flow/index.ts";

const example = (name: string) =>
	readFileSync(join(import.meta.dirname, "examples", `${name}.flow`), "utf8");

test("system steps show their title, subtitle and matching legend in both schemes", () => {
	const source = example("system-steps");
	for (const scheme of ["light", "dark"] as const) {
		const { svg, diagnostics, layout } = render(source, { scheme });
		assert.deepEqual(diagnostics, []);
		assert.ok(layout.width <= 710, "comparison fits the document column");
		const loop = layout.nodes.find((p) => p.node.id === "loop");
		assert.ok(loop);
		assert.equal(loop.node.kind, "box");
		assert.equal(loop.node.tone, "system");
		assert.equal(loop.node.label, "The loop");
		assert.equal(loop.node.sub, "claims eligible items in order");
		assert.match(svg, /class="m s13 b t-system">The loop<\/text>/);
		assert.match(svg, />claims eligible items in order<\/text>/);
		assert.equal((svg.match(/class="k-system"/g) ?? []).length, 2);
		assert.match(svg, /class="e e-system"/);
		assert.match(svg, /class="arrow" marker-end="url\(#ab-system\)"/);
		assert.match(svg, /id="ab-system"/);
		assert.equal(layout.legend?.keys[0].item.tone, "system");
		const palette = scheme === "light" ? LIGHT : DARK;
		assert.ok(svg.includes(`--system:var(--ab-system,${palette.system})`));
		assert.ok(svg.includes(`--system-bg:var(--ab-system-bg,${palette["system-bg"]})`));
		assert.match(svg, /\.ab \.k-system\{fill:var\(--system-bg\);stroke:var\(--system\)/);
		for (const tone of ["agent", "stop", "done", "muted"] as const) {
			assert.notEqual(palette.system, palette[tone]);
		}
		assert.equal(svg, render(source, { scheme }).svg);
	}
});

test("system tone preserves author placement, spanning rows and explicit edge ports", () => {
	const source = [
		"flow v0",
		"columns main side",
		"box a col=main",
		"box b",
		"box c",
		'box loop col=side row=a span=3 tone=system title="The loop" "launches work"',
		"a --> loop from=right to=left.1",
		"loop --> c from=left.2 to=right",
	].join("\n");
	const system = render(source);
	const agent = render(source.replace("tone=system", "tone=agent"));
	assert.deepEqual(system.diagnostics, []);
	assert.deepEqual(
		system.layout.nodes.map(({ node, ...geometry }) => [node.id, geometry]),
		agent.layout.nodes.map(({ node, ...geometry }) => [node.id, geometry]),
	);
	assert.deepEqual(system.layout.routes, agent.layout.routes);
	const loop = system.layout.nodes.find((p) => p.node.id === "loop");
	assert.ok(loop);
	assert.equal(loop.node.col, "side");
	assert.equal(loop.node.row, "a");
	assert.equal(loop.node.span, 3);
	assert.ok(loop.h > system.layout.nodes[0].h);
	assert.ok(loop.x > system.layout.nodes[0].x);
	assert.ok(system.layout.routes.every((r) => r.points.length === 2));
});
