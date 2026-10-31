// Renders the spike variants and screenshots them for review.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { type LayoutMode, parse, renderSequence } from "./sequence.ts";

const here = import.meta.dirname;
const out = process.argv[2] ?? join(here, "out");
mkdirSync(out, { recursive: true });
const { chromium } = createRequire(import.meta.url)("playwright");

const MODES: Record<string, LayoutMode> = {
	"sized-to-labels": { labels: "center", footer: true },
	"fixed-678": { width: 678, labels: "center" },
	"fixed-678-from-source": { width: 678, labels: "source" },
	"phone-360-wrapped": { width: 360, labels: "center" },
	"phone-360-from-source": { width: 360, labels: "source" },
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const page = (title: string, cells: string) => `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:24px;background:#f4f5f7;font:13px "IBM Plex Sans",system-ui,sans-serif;color:#17202c;width:max-content}
h1{font-size:16px;margin:0 0 14px}.row{display:flex;gap:20px;align-items:flex-start}
.cell{background:#fff;border:1px solid #d3d9e2;border-radius:10px;padding:14px}.cell.dark{background:#171c24;border-color:#2c3440}
.cap{font:11px ui-monospace,Menlo,monospace;letter-spacing:.08em;color:#5a6575;margin-bottom:8px;text-transform:uppercase}
pre{margin:0;font:12px/1.5 ui-monospace,Menlo,monospace;white-space:pre}</style><h1>${title}</h1><div class="row">${cells}</div>`;

const browser = await chromium.launch();
const tab = await browser.newPage({ deviceScaleFactor: 2 });
const shot = async (name: string, html: string) => {
	await tab.setContent(html);
	await tab.locator("body").screenshot({ path: join(out, `${name}.png`) });
	console.log(`${name}.png`);
};
for (const syntax of ["mermaid", "ablauf"]) {
	const source = readFileSync(join(here, `claim-${syntax}.flow`), "utf8");
	const model = parse(source);
	for (const d of model.diagnostics) console.log(`  ${syntax}:${d.line} ${d.message}`);
	const sized = renderSequence(model, MODES["sized-to-labels"], "light");
	writeFileSync(join(out, `${syntax}.svg`), sized.svg);
	// Syntax sheet: source beside the default render, light and dark.
	const fixed = (s: "light" | "dark") => renderSequence(model, MODES["fixed-678"], s).svg;
	await shot(`syntax-${syntax}`, page(`Syntax: ${syntax === "mermaid" ? "Mermaid spelling" : "ablauf spelling"} — fixed 678 px`,
		`<div class="cell"><div class="cap">source</div><pre>${esc(source)}</pre></div><div class="cell"><div class="cap">light</div>${fixed("light")}</div><div class="cell dark"><div class="cap" style="color:#98a2b0">dark</div>${fixed("dark")}</div>`));
	// Layout sheet: every mode in light.
	await shot(`layouts-${syntax}`, page(`Layouts (${syntax} source)`,
		Object.entries(MODES).map(([name, mode]) => `<div class="cell"><div class="cap">${name}</div>${renderSequence(model, mode, "light").svg}</div>`).join("")));
	await shot(`phone-dark-${syntax}`, page(`Phone widths, dark (${syntax} source)`,
		["phone-360-wrapped", "phone-360-from-source"].map((name) => `<div class="cell dark"><div class="cap" style="color:#98a2b0">${name}</div>${renderSequence(model, MODES[name], "dark").svg}</div>`).join("")));
}
await browser.close();
