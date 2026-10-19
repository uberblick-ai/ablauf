import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CHAR, panelLines } from "./flow/grid.ts";
import { render } from "./flow/index.ts";

const example = (name: string) =>
	readFileSync(join(import.meta.dirname, "examples", `${name}.flow`), "utf8");

const panelText = (svg: string) => {
	const pattern = new RegExp(
		'<text x="[\\d.]+" y="([\\d.]+)" text-anchor="middle"' +
			' class="(s11|s11 muted|s12 b)">([^<]*)</text>',
		"g",
	);
	return [...svg.matchAll(pattern)].map((m) => ({
		y: Number(m[1]),
		style: m[2],
		text: m[3],
	}));
};

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
		const lines = panelText(svg).filter((line) => line.style === cls);
		assert.deepEqual(lines.map((line) => line.text), [fitting, fitting, "again"], kind);
		assert.deepEqual(lines.map((line) => line.y - panel.y), [61, 79, 94]);
		assert.equal(panel.h, 157, "height includes exactly one extra text line");
		assert.ok(svg.includes(`y1="${panel.y + 106}"`), "rule follows wrapped text");
		assert.ok(after.y >= panel.y + panel.h + 30);
		const narrow = render(
			source.replace("  pill waiting-for-maintainer-approval\n", ""),
		);
		assert.equal(
			narrow.layout.nodes[0].w,
			243,
			"notes still have bounded automatic widths",
		);
		assert.deepEqual(
			panelText(narrow.svg).map((line) => line.text),
			[
				"Pick the newest item then oldest",
				"item",
				"Pick the newest item then oldest",
				"item again",
			],
			kind,
		);
	}
});

test("automatically sized strong panels keep their widest line whole", () => {
	const prefix = "Wait for a maintainer ";
	for (let length = 25; length <= 34; length++) {
		const text = prefix + "a".repeat(length - prefix.length);
		const { svg, layout, diagnostics } = render(
			`flow v0\npanel note\n  strong "${text}"\n`,
		);
		assert.deepEqual(diagnostics, []);
		assert.deepEqual(panelText(svg).map((line) => line.text), [text], `${length} characters`);
		assert.equal(layout.nodes[0].h, 38, `${length} characters stay one line high`);
	}
});

test("panel wrapping and height use host text metrics at each rendered style", () => {
	for (const kind of ["text", "muted", "strong"] as const) {
		const { svg, layout, diagnostics } = render(
			[
				"flow v0",
				"panel note",
				"  pill waiting-for-maintainer-approval",
				`  ${kind} "Pick the newest item then oldest item"`,
				"  rule",
				"  pill done",
				"box after",
			].join("\n"),
			{ fonts: { text: {
				family: "Host Text",
				measureText: (text, { fontSize, fontWeight }) =>
					[...text].length * (fontSize + fontWeight / 100),
			} } },
		);
		assert.deepEqual(diagnostics, []);
		const [panel, after] = layout.nodes;
		assert.equal(panel.w, 32 * (kind === "strong" ? 18 : 15) + 28);
		assert.deepEqual(panelText(svg).map((line) => line.text), [
			"Pick the newest item then oldest",
			"item",
		]);
		assert.deepEqual(panelText(svg).map((line) => line.y - panel.y), [61, 76]);
		assert.equal(panel.h, 139);
		assert.ok(svg.includes(`y1="${panel.y + 88}"`), "rule follows both lines");
		assert.ok(after.y >= panel.y + panel.h + 30);
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
		const lines = panelText(svg).filter(
			(line) => line.text.startsWith("Pick") || line.text === "again" || line.text === "now",
		);
		assert.deepEqual(lines.map((line) => line.text), [
			"Pick the newest item then oldest item",
			"Pick the newest item then oldest item",
			"again",
			"Pick the newest item then oldest item now",
			"Pick the newest item then oldest item",
			"now",
		]);
		assert.deepEqual(lines.map((line) => line.y - offset), [49, 67, 82, 100, 118, 133]);
		assert.ok(lines[0].y - 12 >= panel.y + 12);
		assert.ok(svg.includes(`y1="${offset + 145}"`), "rule is below all six text lines");
		assert.ok(offset + 152 + 30 <= panel.y + panel.h - 8, "final pill stays inside the panel");
		if (!extraRows) {
			const next = layout.nodes.find((p) => p.node.id === "next");
			assert.ok(next && next.y >= panel.y + panel.h + 30);
		}
	}
});
