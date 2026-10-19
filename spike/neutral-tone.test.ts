import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DARK, LIGHT, render } from "./flow/index.ts";

const example = (name: string) =>
	readFileSync(join(import.meta.dirname, "examples", `${name}.flow`), "utf8");

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
	assert.equal([...svg.matchAll(/class="e e-neutral(?: dash)?"/g)].length, 4);
	// Route arrowheads draw separately above knockouts; legend lines keep theirs.
	assert.equal([...svg.matchAll(/class="arrow" marker-end="url\(#neutral-neutral\)"/g)].length, 2);
	assert.equal([...svg.matchAll(/class="e e-neutral(?: dash)?" marker-end="url\(#neutral-neutral\)"/g)].length, 2);
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
