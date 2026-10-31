import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderFanout } from "./flow/fanout.ts";
import { type TextStyle, render } from "./flow/index.ts";

const styles = ["", "branches", "ladder"] as const;
const source = (style: string) => [
	"fan-out v0", ...(style ? [`style ${style}`] : []),
	`step "${"Long step ".repeat(35)}"`,
	`outcome "${"W".repeat(100)}" reason="${"long explanation ".repeat(30)}" destination="${"Destination".repeat(20)}" extra="kept"`,
	'outcome "Next" reason="No overlap" destination="End"',
	`invalid ${"🙂".repeat(100)}`,
].join("\n");

test("fan-outs retain pre-font-fix SVG bytes with absent or empty fonts", () => {
	// SHA-256 of the complete SVG from afb04ab, including fractional geometry.
	const cases = [
		[readFileSync(new URL("./examples/approvals.flow", import.meta.url), "utf8"), "e7bd04a928ec7f3859073687a537b97c4f776fd7c86aa57589e3d83ba7396a7a"],
		[readFileSync(new URL("./examples/run-endings.flow", import.meta.url), "utf8"), "d2e82e267b34a8c470c677a1b9dcf910dbfd51177911ceaca5ad3ca846704458"],
		[readFileSync(new URL("./examples/run-endings-ladder.flow", import.meta.url), "utf8"), "0c8252a5293da914f31cb729eeda68b04ca4175d37fc15e6a9787dc754f4a9a5"],
		[source(""), "be707ee4ea274c159d5bab24ff7b555090d9cadbeb2af10a6590ea957c68c6ce"],
		[source("branches"), "3aec066ee59f6ed50d0afd4c690891c53f6f45b7e7325013210517d0cec25c6f"],
		[source("ladder"), "ca8eb366e0b601cf451b2398d7cd42828419655d0394a6021293028019820efc"],
	];
	for (const [input, hash] of cases) {
		const svg = render(input).svg;
		assert.equal(createHash("sha256").update(svg).digest("hex"), hash);
		assert.equal(render(input, { fonts: {} }).svg, svg);
	}
});

// Fractional, deliberately wide, non-uniform advances distinguish size and
// weight as well as glyph count. Measure complete strings, including spaces.
const measureText = (text: string, { fontSize, fontWeight }: TextStyle) =>
	[...text].reduce((width, char) => width + (char === "W" ? 2.3 : char === " " ? 0.8 : 1.6) * fontSize + fontWeight / 1000, 0);
const decode = (text: string) => text.replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
const runs = (svg: string) => [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"( text-anchor="end")? class="([^"]+)">([^<]*)<\/text>/g)]
	.map(([, x, y, anchor, classes, text]) => {
		const style: TextStyle = { fontSize: classes.includes("s13") ? 13 : 12, fontWeight: classes.split(" ").includes("b") ? 600 : 400 };
		return { x: Number(x), y: Number(y), anchor: !!anchor, classes, text: decode(text), style, width: Math.ceil(measureText(decode(text), style)) };
	});

test("both fan-out styles fit host mono metrics at each rendered size and weight", () => {
	for (const style of styles) for (const scheme of ["light", "dark"] as const) {
		const calls = new Set<string>();
		const mono = { family: "Wide Mono", measureText: (text: string, style: TextStyle) => {
			calls.add(JSON.stringify([text, style]));
			return measureText(text, style);
		} };
		const { svg, layout, diagnostics } = render(source(style), { scheme, fonts: { mono } });
		assert.deepEqual(diagnostics.map((d) => d.line), style ? [4, 6] : [3, 5]);
		assert.match(svg, /\.ab \.m\{font-family:"Wide Mono"\}/);
		assert.match(svg, /\.ab text\{[^}]*font-weight:400;/);
		assert.match(svg, /\.ab \.b\{font-weight:600\}/);
		assert.equal(layout.typography.mono?.family, mono.family);
		assert.equal(layout.width, 678);
		assert.ok(layout.width <= 710);
		const text = runs(svg);
		assert.ok(text.length > 100, "wide text should wrap into many lines");
		for (const run of text) {
			assert.ok(calls.has(JSON.stringify([run.text, run.style])), `unmeasured rendered text: ${run.text}`);
			const available = style === "ladder"
				? run.x === 32 ? 614 : run.anchor ? 220 : run.classes.includes("t-stop") ? 602 : run.style.fontWeight === 600 ? 260 : 400
				: run.x === 32 ? run.classes.includes("s13") ? 118 : 614 : run.x === 230 ? 142 : 236;
			assert.ok(run.width <= available, `${run.text} exceeds ${available}px`);
			assert.ok(run.anchor ? run.x - run.width >= 442 : run.x + run.width <= 662);
			assert.ok(run.y - run.style.fontSize >= 0 && run.y + 4 < layout.height);
		}
		const [, stepY, stepWidth, stepHeight] = /<rect x="16" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(svg) ?? [];
		const stepRuns = text.filter((r) => r.style.fontSize === 13);
		assert.ok(stepRuns.every((r) => r.x + r.width <= 16 + Number(stepWidth) - 16 && r.y - 13 >= Number(stepY) && r.y + 4 <= Number(stepY) + Number(stepHeight)));
		if (style === "ladder") assert.equal(Number(stepWidth), 32 + Math.max(...stepRuns.map((r) => r.width)));
		let previousBottom = 0;
		for (const [, row] of svg.matchAll(/<g data-line="\d+">([\s\S]*?)<\/g>/g)) {
			const rowRuns = runs(row);
			const top = Math.min(...rowRuns.map((r) => r.y - r.style.fontSize));
			const bottom = Math.max(...rowRuns.map((r) => r.y + 4));
			assert.ok(top > previousBottom, "rows must remain separate");
			previousBottom = bottom;
			if (style === "ladder") {
				const outcome = rowRuns.find((r) => r.x === 60);
				const destination = rowRuns.find((r) => r.anchor);
				assert.ok(outcome && destination);
				const from = 60 + outcome.width + 12;
				const to = 662 - destination.width - 12;
				assert.ok(60 + outcome.width < 662 - destination.width);
				if (to - from >= 24) assert.ok(row.includes(`<line x1="${from}" y1="${outcome.y - 4}" x2="${to}"`));
				else assert.doesNotMatch(row, /<line /);
			} else {
				const [, boxY, boxHeight] = /<rect x="216" y="([\d.]+)" width="170" height="([\d.]+)"/.exec(row) ?? [];
				assert.ok(rowRuns.filter((r) => r.x === 230).every((r) => r.y - 12 >= Number(boxY) && r.y + 4 <= Number(boxY) + Number(boxHeight)));
			}
		}
		// Wrapping keeps the long token and the original rejected source visible.
		assert.equal(text.filter((r) => r.x === (style === "ladder" ? 60 : 230) && r.style.fontWeight === 600).map((r) => r.text).join(""), `${"W".repeat(100)}Next`);
		const rejected = text.filter((r) => r.classes.includes("t-stop")).map((r) => r.text).join("");
		assert.ok(rejected.includes('extra="kept"'));
		assert.ok(rejected.includes("🙂".repeat(100)));
	}
});

test("ladder step width and leaders use rounded host metrics even for short labels", () => {
	const mono = { family: "Wide Mono", measureText };
	const { svg } = renderFanout('fan-out v0\nstyle ladder\nstep "WW"\noutcome "A" reason="Why" destination="B"', { fonts: { mono } });
	assert.ok(svg.includes(`width="${32 + Math.ceil(measureText("WW", { fontSize: 13, fontWeight: 600 }))}"`));
	assert.ok(svg.includes(`<line x1="${72 + Math.ceil(measureText("A", { fontSize: 12, fontWeight: 600 }))}"`));
});

test("fan-outs consume over-wide glyphs and ignore text-role metrics", () => {
	for (const style of styles) {
		const input = `fan-out v0\n${style ? `style ${style}\n` : ""}step "🙂X"\noutcome "🙂X" reason="🙂X" destination="🙂X"`;
		const text = { family: "Unused Text", measureText: () => { throw new Error("fan-out text uses mono"); } };
		const plain = render(input);
		const textOnly = render(input, { fonts: { text } });
		assert.equal(textOnly.svg.slice(textOnly.svg.indexOf("</style>")), plain.svg.slice(plain.svg.indexOf("</style>")));
		const { svg } = render(input, { fonts: { mono: { family: "Huge Mono", measureText: () => 1000 }, text } });
		assert.equal(runs(svg).filter((r) => r.text === "🙂").length, 4);
		assert.equal(runs(svg).filter((r) => r.text === "X").length, 4);
		assert.doesNotMatch(svg, /NaN|Infinity/);
	}
});
