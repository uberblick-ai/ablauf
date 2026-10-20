import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Key } from "./flow/grid.ts";
import { render } from "./flow/index.ts";

const example = (name: string) =>
	readFileSync(join(import.meta.dirname, "examples", `${name}.flow`), "utf8");

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
		assert.ok(svg.includes(scheme === "light" ? "var(--ab-done,#536e5a)" : "var(--ab-done,#95b09c)"));
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

test("host font metrics keep legend samples and meanings inside wrapped rows", () => {
	const source = `flow v0
legend
  pill sample="wide sample" "label meaning"
  box sample="wide sample" "box meaning"
  end sample="wide sample" "end meaning"
  panel sample="wide sample" "panel meaning"
`;
	const { svg, diagnostics, layout } = render(source, { fonts: {
		mono: {
			family: "Host Mono",
			measureText: (text, style) => {
				assert.deepEqual(style, { fontSize: 11, fontWeight: 400 });
				return [...text].length * 30.25;
			},
		},
		text: {
			family: "Host Text",
			measureText: (text) => [...text].length * 15.25,
		},
	} });
	assert.deepEqual(diagnostics, []);
	const keys = layout.legend?.keys;
	assert.ok(keys);
	assert.equal(new Set(keys.map((k) => k.y)).size, 4);
	const samples = [...svg.matchAll(/<g><rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)".*?<\/g>/gs)];
	assert.equal(samples.length, 4);
	for (const [i, sample] of samples.entries()) {
		const { item, x }: Key = keys[i];
		const w: number = Math.ceil([...item.sample].length * 30.25) + (item.kind === "pill" ? 24 : 16);
		assert.equal(Number(sample[3]), w);
		assert.ok(sample[0].includes(`<text x="${x + w + 6}"`));
		assert.ok(x + w + 6 + Math.ceil([...item.text].length * 15.25) <= layout.width);
	}
	assert.ok(svg.includes('.ab .m{font-family:"Host Mono"'));
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

test("empty shape sample text is diagnosed without losing the shape or meaning", () => {
	const source = `flow v0
legend
  pill sample= "bare pill"
  pill sample="" "quoted pill"
  box sample= "bare box"
  box sample="" "quoted box"
  end sample= "bare end"
  end sample="" "quoted end"
  panel sample= "bare panel"
  panel sample="" "quoted panel"
`;
	const { svg, diagnostics, layout } = render(source);
	assert.deepEqual(diagnostics.map((d) => [d.line, d.message]),
		[3, 4, 5, 6, 7, 8, 9, 10].map((line) => [line, "sample= needs non-empty text"]));
	assert.equal(layout.legend?.keys.length, 8);
	assert.equal(svg, render(source.replaceAll(/ sample=(?:"")?/g, "")).svg);
});

test("bare empty legend keys other than sample retain their existing meaning", () => {
	const { diagnostics, layout } = render(`flow v0
legend
  pill tone= "meaning"
`);
	assert.deepEqual(diagnostics, []);
	assert.equal(layout.legend?.keys[0].item.text, "tone= meaning");
});

test("whitespace-only shape samples use the empty sample fallback in both schemes", () => {
	for (const kind of ["pill", "box", "end", "panel"]) {
		for (const sample of [" ", "   ", "\t", " \t ", "\u00a0"]) {
			const source = `flow v0\nlegend\n  ${kind} tone=rework sample="${sample}" "meaning"`;
			for (const scheme of ["light", "dark"] as const) {
				const { svg, diagnostics, layout } = render(source, { scheme });
				assert.deepEqual(diagnostics, [{
					line: 3,
					severity: "warning",
					message: "sample= needs non-empty text",
				}]);
				assert.deepEqual(layout.legend?.keys.map(({ item }) => item), [{
					kind, tone: "rework", sample: "", text: "meaning", line: 3,
				}]);
				assert.equal(svg, render(source.replace(`sample="${sample}"`, 'sample=""'), { scheme }).svg);
				assert.equal(svg, render(source.replace(` sample="${sample}"`, ""), { scheme }).svg);
			}
		}
	}
});

test("non-blank sample text keeps its surrounding whitespace", () => {
	const { diagnostics, layout } = render('flow v0\nlegend\n  pill sample=" ready " "meaning"');
	assert.deepEqual(diagnostics, []);
	assert.equal(layout.legend?.keys[0].item.sample, " ready ");
});

test("legends without sample text preserve existing SVG bytes", () => {
	assert.equal(render(example("deploy"), { idPrefix: "deploy" }).svg,
		readFileSync(join(import.meta.dirname, "out", "deploy.svg"), "utf8"));
});
