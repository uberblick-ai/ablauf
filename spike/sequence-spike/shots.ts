// Throwaway comparison evidence for #75, separate from the package renderer.
// Generates evidence; it does not declare a visual winner or visual acceptance.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { esc } from "../flow/svg.ts";
import { type LayoutMode, type Model, parse, renderSequence } from "./sequence.ts";

const here = import.meta.dirname;
const out = process.argv[2] ?? join(here, "evidence");
mkdirSync(out, { recursive: true });
const read = (name: string) => readFileSync(join(here, name), "utf8");
const candidates = ["mermaid", "ablauf", "json"] as const;
const sources = candidates.map((candidate) => read(`claim-${candidate}.flow`));
const models = sources.map(parse);
// Preserve meaning across spellings, including the note and branch boundaries.
// Participant ids and implicit person/system tones are intentionally compared separately.
const meaning = (model: Model) => ({
	participants: model.participants.map((p) => p.title),
	items: model.items.map(({ line: _line, ...item }) => item),
});
for (const model of models) {
	if (model.diagnostics.length || JSON.stringify(meaning(model)) !== JSON.stringify(meaning(models[0])))
		throw new Error("Candidate differs from the full reference fixture");
}
if (models[0].participants.length !== 5 || models[0].items.filter((i) => i.t === "msg").length !== 15)
	throw new Error("Expected five participants and fifteen messages");
writeFileSync(join(out, "fixture.json"), `${JSON.stringify({
	reference: "872fb5c53ecf041a3d5828a59cd970441fc4a66b:spike/sequence-spike/claim-mermaid.flow",
	sha256: createHash("sha256").update(sources[0]).digest("hex"),
	...meaning(models[0]),
	branches: { success: [12, 13], failure: [14, 15] },
	illustrativeMessages: "7–15 are spike handshake details, not a product protocol decision",
}, null, 2)}\n`);

// Hold colours constant when comparing syntax: the flow spelling implies tones,
// but that should not change the picture used to compare source spellings.
for (const model of models) for (const [i, p] of model.participants.entries())
	p.tone = (["ink", "agent", "system", "neutral", "rework"] as const)[i];

const frames = [
	{ document: 710, figure: 710 },
	{ document: 710, figure: 678 },
	{ document: 678, figure: 678 },
	{ document: 360, figure: 360 },
];
const modes: Record<string, (width: number) => LayoutMode> = {
	"bounded-lanes": (width) => ({ width, labels: "source", style: "lanes", bounded: true }),
	"label-sized-scroll": () => ({ labels: "center", footer: true }),
	"span-wrap": (width) => ({ width, labels: "center", style: "plain" }),
	"original-lanes": (width) => ({ width, labels: "source", style: "lanes" }),
	"cards-repeated-headers": (width) => ({ width, labels: "source", style: "cards", footer: true, bounded: true }),
	"minimal-annotations": (width) => ({ width, labels: "source", annotations: "minimal", bounded: true }),
	"fixed678-scroll": () => ({ width: 678, labels: "source", style: "lanes", bounded: true }),
	"fixed678-shrink": () => ({ width: 678, labels: "source", style: "lanes", bounded: true }),
};

const browser = await chromium.launch();
try {
	const page = await browser.newPage({ deviceScaleFactor: 1 });
	const results: object[] = [];
	const links: string[] = [];
	const capture = async (candidate: string, source: string, model: Model, layout: string,
		frame: { document: number; figure: number }, theme: "light" | "dark", showSource = false) => {
		if (model.diagnostics.length) throw new Error(JSON.stringify(model.diagnostics));
		const name = `${candidate}-${layout}-${theme}-doc${frame.document}-fig${frame.figure}`;
		const mode = modes[layout](frame.figure);
		const rendered = renderSequence(model, mode, theme);
		const scale = layout === "fixed678-shrink" ? Math.min(1, frame.figure / rendered.width) : 1;
		const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(name)}</title><style>
*{box-sizing:border-box}body{margin:0;width:${frame.document}px;background:${theme === "dark" ? "#171c24" : "#fff"};color:${theme === "dark" ? "#e0e5ed" : "#17202c"};font:12px/1.5 Arial,sans-serif}
header,details{padding:8px 12px}h1{font-size:13px;margin:0}p{margin:4px 0}pre{font:12px/1.5 monospace;white-space:pre;overflow-x:auto}
.figure{width:${frame.figure}px;margin:auto;overflow-x:auto}.figure svg{display:block;max-width:none}${layout === "fixed678-shrink" ? `.figure svg{width:${rendered.width * scale}px;height:${rendered.height * scale}px}` : ""}
</style><header><h1>${esc(candidate)} · ${esc(layout)} · ${theme}</h1><p>Document column ${frame.document} px · figure viewport ${frame.figure} px · SVG ${rendered.width} px</p><p>Claim messages 7–15 are illustrative. ALT 12–13 and ELSE 14–15 are alternatives.</p></header>${showSource ? `<details open><summary>Candidate source</summary><pre>${esc(source)}</pre></details>` : ""}<div class="figure">${rendered.svg}</div></html>`;
		await page.setViewportSize({ width: frame.document, height: 800 });
		await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
		await page.setContent(html);
		await page.evaluate(() => document.fonts.ready);
		const measurements = await page.evaluate(() => {
			const svg = document.querySelector("svg");
			const figure = document.querySelector(".figure");
			if (!svg || !figure) throw new Error("Missing figure");
			const box = svg.getBoundingClientRect();
			const texts = [...svg.querySelectorAll("text")].map((node) => {
				const b = node.getBoundingClientRect();
				return { text: node.textContent, x: b.x - box.x, right: b.right - box.x,
					font: getComputedStyle(node).fontFamily, fontPx: Number.parseFloat(getComputedStyle(node).fontSize) };
			});
			return { renderedWidth: box.width, renderedHeight: box.height,
				viewportWidth: figure.clientWidth, scrollWidth: figure.scrollWidth,
				textOutsideSvg: texts.filter((b) => b.x < -0.5 || b.right > box.width + 0.5),
				minFontPxBeforeScaling: Math.min(...texts.map((b) => b.fontPx)),
				fonts: [...new Set(texts.map((b) => b.font))],
				textElementCount: texts.length };
		});
		await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
		// A second phone view exposes the far endpoints of a scrolling trial.
		if (frame.document === 360 && measurements.scrollWidth > frame.figure) {
			await page.locator(".figure").evaluate((node) => { node.scrollLeft = node.scrollWidth; });
			await page.screenshot({ path: join(out, `${name}-right.png`), fullPage: true });
			links.push(`<li><a href="${name}-right.png">${name} · scrolled right</a></li>`);
		}
		writeFileSync(join(out, `${name}.html`), html);
		writeFileSync(join(out, `${name}.svg`), rendered.svg);
		results.push({ candidate, layout, theme, documentColumnPx: frame.document, figureViewportPx: frame.figure,
			svgWidth: rendered.width, svgHeight: rendered.height, scale,
			minimumDisplayedFontPx: measurements.minFontPxBeforeScaling * scale, ...measurements });
		links.push(`<li><a href="${name}.png">${name}</a> · <a href="${name}.html">interactive scroll / source</a></li>`);
		console.log(name);
	};

	for (const [i, candidate] of candidates.entries()) for (const frame of frames) for (const theme of ["light", "dark"] as const)
		await capture(candidate, sources[i], models[i], "bounded-lanes", frame, theme, true);
	for (const layout of Object.keys(modes).filter((name) => name !== "bounded-lanes"))
		for (const frame of frames) for (const theme of ["light", "dark"] as const)
			await capture("mermaid", sources[0], models[0], layout, frame, theme);
	for (const name of ["alternatives", "loop", "phases", "nesting", "notes", "long-label", "quotes-flow", "quotes-json"]) {
		const source = read(`annotations/${name}.flow`);
		const model = parse(source);
		for (const frame of frames.filter((f) => f.document !== 678)) for (const theme of ["light", "dark"] as const)
			await capture(name, source, model, "bounded-lanes", frame, theme, true);
		if (name === "long-label") for (const theme of ["light", "dark"] as const)
			await capture(name, source, model, "original-lanes", frames[3], theme, true);
	}
	writeFileSync(join(out, "measurements.json"), `${JSON.stringify({ browser: browser.version(), deviceScaleFactor: 1,
		visualAcceptance: "Pending maintainer browser review; measurements do not judge appearance", results }, null, 2)}\n`);
	writeFileSync(join(out, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Sequence spike #75 evidence</title><h1>Sequence spike #75</h1><p>Pending maintainer visual review. Filenames distinguish document-column and figure widths. PNGs show initial scroll position unless marked right. HTML provides scrolling. Shared sources retain the note and ALT/ELSE. Messages 7–15 are illustrative.</p><p><a href="measurements.json">Browser measurements</a> · <a href="fixture.json">Fixture equivalence record</a></p><ul>${links.join("\n")}</ul></html>\n`);
	console.log(`Wrote ${results.length} comparisons to ${out}`);
} finally {
	await browser.close();
}
