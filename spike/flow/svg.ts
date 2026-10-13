// SVG as a string, in the house style. Colours are CSS variables a host can
// override with --ab-*; light and dark follow prefers-color-scheme.

import {
	type Band,
	type Layout,
	type Placed,
	type Route,
	panelContentHeight,
	wrap,
} from "./grid.ts";
import type { Tone } from "./parse.ts";

const LIGHT = {
	ink: "#17202c",
	muted: "#5a6575",
	line: "#d3d9e2",
	band: "#e9eef5",
	surface: "#ffffff",
	agent: "#0b6b67",
	"agent-bg": "#dff1ee",
	rework: "#a65f0c",
	"rework-bg": "#fbefdc",
	stop: "#b2382f",
	"stop-bg": "#f9e2df",
	done: "#2a7845",
	"done-bg": "#e0f1e5",
};
const DARK: typeof LIGHT = {
	ink: "#e5e9ef",
	muted: "#98a2b0",
	line: "#2c3440",
	band: "#151b23",
	surface: "#1d232d",
	agent: "#5cc5bb",
	"agent-bg": "#12302d",
	rework: "#e3a250",
	"rework-bg": "#33250f",
	stop: "#ef7f73",
	"stop-bg": "#3a1916",
	done: "#72cf91",
	"done-bg": "#142e1d",
};
const vars = (t: typeof LIGHT) =>
	Object.entries(t)
		.map(([k, v]) => `--${k}:var(--ab-${k},${v});`)
		.join("");

const STYLE = `
.ab{${vars(LIGHT)}}
@media (prefers-color-scheme:dark){.ab{${vars(DARK)}}}
.ab text{font-family:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;fill:var(--ink)}
.ab .m{font-family:"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace}
.ab .s11{font-size:11px}.ab .s12{font-size:12px}.ab .s13{font-size:13px}
.ab .muted{fill:var(--muted)}.ab .b{font-weight:600}
.ab .cap{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;fill:var(--muted)}
.ab .band{fill:var(--band)}.ab .rule{stroke:var(--line);stroke-width:1.2;stroke-dasharray:3 5}
.ab .pill{fill:var(--surface);stroke:var(--line);stroke-width:1.2}
.ab .e{fill:none;stroke-width:1.6}.ab .dash{stroke-dasharray:6 5}
${(["ink", "muted", "agent", "done", "rework", "stop"] as Tone[])
	.map((t) => {
		const c = t === "ink" ? "muted" : t;
		const bg = t === "ink" || t === "muted" ? "surface" : `${t}-bg`;
		return `.ab .t-${t}{fill:var(--${c})}.ab .e-${t}{stroke:var(--${c})}.ab .k-${t}{fill:var(--${bg});stroke:var(--${c === "muted" ? "line" : c});stroke-width:1.5}`;
	})
	.join("")}
.ab .k-stop.panel{stroke-width:1.2;stroke-dasharray:5 4}
`.trim();

const esc = (s: string) =>
	s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

export interface SvgOptions {
	idPrefix?: string;
	title?: string;
}

export function toSvg(layout: Layout, options: SvgOptions = {}): string {
	const id = options.idPrefix ?? "ab";
	const tones = [...new Set(layout.routes.map((r) => r.tone))].sort();
	const out: string[] = [];
	out.push(
		`<svg xmlns="http://www.w3.org/2000/svg" class="ab" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" role="img"${options.title ? ` aria-label="${esc(options.title)}"` : ""}>`,
	);
	out.push(`<style>${STYLE}</style>`);
	out.push("<defs>");
	for (const t of tones) {
		out.push(
			`<marker id="${id}-${t}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 z" class="t-${t}"/></marker>`,
		);
	}
	out.push("</defs>");
	for (const b of layout.bands) out.push(band(b, layout.width));
	for (const r of layout.routes) out.push(route(r, id));
	for (const p of layout.nodes) out.push(node(p));
	for (const r of layout.routes) if (r.label) out.push(edgeLabel(r));
	out.push("</svg>");
	return `${out.join("\n")}\n`;
}

function band(b: Band, width: number): string {
	const parts: string[] = [];
	if (b.shaded)
		parts.push(
			`<rect x="8" y="${b.y}" width="${width - 16}" height="${b.h - 8}" class="band"/>`,
		);
	if (b.y > 0)
		parts.push(
			`<line x1="8" y1="${b.y}" x2="${width - 8}" y2="${b.y}" class="rule"/>`,
		);
	parts.push(
		`<text x="20" y="${b.y + 22}" class="cap">${esc(b.label.toUpperCase())}</text>`,
	);
	return parts.join("\n");
}

function route(r: Route, id: string): string {
	const d = r.points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
	return `<path d="${d}" class="e e-${r.tone}${r.edge.dashed ? " dash" : ""}" marker-end="url(#${id}-${r.tone})"/>`;
}

function edgeLabel(r: Route): string {
	const l = r.label;
	if (!l) return "";
	const tone = r.tone === "ink" ? "" : ` t-${r.tone}`;
	return `<text x="${l.x}" y="${l.y}"${l.anchor === "end" ? ' text-anchor="end"' : ""} class="m s11${tone}">${esc(l.text)}</text>`;
}

function pill(
	x: number,
	y: number,
	h: number,
	label: string,
	tone: Tone,
): string {
	const w = Math.round(36 + [...label].length * 7.2);
	const cy = y + h / 2;
	return [
		`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" class="pill"/>`,
		`<circle cx="${x + 14}" cy="${cy}" r="5" class="t-${tone}"/>`,
		`<text x="${x + 26}" y="${cy + 4}" class="m s12">${esc(label)}</text>`,
	].join("\n");
}

function node(p: Placed): string {
	const { node: n, x, y, w, h } = p;
	const cx = Math.round(x + w / 2);
	switch (n.kind) {
		case "text":
			return `<text x="${cx}" y="${y + 12}" text-anchor="middle" class="s12 muted">${esc(n.label)}</text>`;
		case "pill":
			return `<g>${pill(x, y, h, n.label, n.tone)}</g>`;
		case "end":
			return [
				`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" class="k-${n.tone}"/>`,
				`<text x="${cx}" y="${y + 21}" text-anchor="middle" class="s12 b t-${n.tone}">${esc(n.label)}</text>`,
			].join("\n");
		case "box":
			return [
				"<g>",
				`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" class="k-${n.tone}"/>`,
				`<text x="${cx}" y="${y + 19}" text-anchor="middle" class="m s13 b t-${n.tone === "muted" ? "ink" : n.tone}">${esc(n.label)}</text>`,
				n.sub
					? `<text x="${cx}" y="${y + 36}" text-anchor="middle" class="s11 muted">${esc(n.sub)}</text>`
					: "",
				"</g>",
			].join("\n");
		case "panel": {
			const parts = [
				`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="k-${n.tone} panel"/>`,
			];
			let cy = Math.round(y + 12 + (h - panelContentHeight(n)) / 2);
			for (const c of n.children) {
				if (c.kind === "pill") {
					const pw = Math.round(36 + [...c.text].length * 7.2);
					parts.push(pill(Math.round(cx - pw / 2), cy, 30, c.text, n.tone));
					cy += 36;
				} else if (c.kind === "rule") {
					parts.push(
						`<line x1="${x + 16}" y1="${cy + 7}" x2="${x + w - 16}" y2="${cy + 7}" class="rule"/>`,
					);
					cy += 14;
				} else {
					const cls =
						c.kind === "strong"
							? "s12 b"
							: c.kind === "muted"
								? "s11 muted"
								: "s11";
					const lines = wrap(c.text);
					lines.forEach((t, i) => {
						parts.push(
							`<text x="${cx}" y="${cy + 13 + i * 15}" text-anchor="middle" class="${cls}">${esc(t)}</text>`,
						);
					});
					cy += 18 + (lines.length - 1) * 15;
				}
			}
			return `<g>${parts.join("\n")}</g>`;
		}
	}
}
