// SVG as a string, in the house style. Colours are CSS variables a host can
// override with --ab-*; light and dark follow prefers-color-scheme.

import { Typography } from "./fonts.ts";
import {
	type Band,
	type Key,
	type Layout,
	type Placed,
	type Point,
	type Route,
	DECISION_DIAMOND,
	DECISION_LEADING,
	DECISION_TIP,
	INLINE_LEADING,
	INLINE_TRACKING,
	decisionLines,
	legendSampleSize,
	panelContentHeight,
	panelLines,
	segments,
	segSeg,
	wrap,
} from "./grid.ts";
import type { Tone } from "./parse.ts";
import type { Palette } from "./paint.ts";
import { edgePart, nodePart } from "./play-flow.ts";

export const LIGHT = {
	bg: "#ffffff",
	ink: "#17202c",
	muted: "#5a6575",
	line: "#d3d9e2",
	band: "#e9eef5",
	surface: "#ffffff",
	neutral: "#59616c",
	"neutral-bg": "#e1e3e6",
	agent: "#3e6563",
	"agent-bg": "#e7eeed",
	system: "#4f5d76",
	"system-bg": "#ebedf3",
	rework: "#806752",
	"rework-bg": "#f3f0eb",
	stop: "#815f5a",
	"stop-bg": "#ede6e5",
	done: "#536e5a",
	"done-bg": "#e8ede9",
} satisfies Palette;
export const DARK: typeof LIGHT = {
	bg: "#171c24",
	ink: "#e5e9ef",
	muted: "#98a2b0",
	line: "#2c3440",
	band: "#151b23",
	surface: "#1d232d",
	neutral: "#b6bbc3",
	"neutral-bg": "#303640",
	agent: "#85aaa5",
	"agent-bg": "#232d2b",
	system: "#98a5bf",
	"system-bg": "#262a31",
	rework: "#b29d87",
	"rework-bg": "#2c2720",
	stop: "#ac8c88",
	"stop-bg": "#2b2221",
	done: "#95b09c",
	"done-bg": "#222a24",
};
const vars = (t: typeof LIGHT) =>
	Object.entries(t)
		.map(([k, v]) => `--${k}:var(--ab-${k},${v});`)
		.join("");

const palette = (mode: "light" | "dark" | "auto") =>
	mode === "auto"
		? `.ab.ab-auto{${vars(LIGHT)}}@media (prefers-color-scheme:dark){.ab.ab-auto{${vars(DARK)}}}`
		: `.ab.ab-${mode}{${vars(mode === "dark" ? DARK : LIGHT)}}`;

const style = (fonts: Typography) => `
.ab text{font-family:${fonts.text ? `"${fonts.text.family}"` : '"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif'};${fonts.text || fonts.mono ? "font-weight:400;" : ""}fill:var(--ink)}
.ab .m{font-family:${fonts.mono ? `"${fonts.mono.family}"` : '"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace'}}
.ab .s11{font-size:11px}.ab .s12{font-size:12px}.ab .s13{font-size:13px}
.ab .muted{fill:var(--muted)}.ab .b{font-weight:600}
.ab .cap{font-family:${fonts.mono ? `"${fonts.mono.family}"` : '"IBM Plex Mono",ui-monospace,Menlo,monospace'};font-size:11px;letter-spacing:.08em;fill:var(--muted)}
.ab .band{fill:var(--band)}.ab .rule{stroke:var(--line);stroke-width:1.2;stroke-dasharray:3 5}
.ab .pill{fill:var(--surface);stroke:var(--line);stroke-width:1.2}
.ab .e{fill:none;stroke-width:1.6}.ab .dash{stroke-dasharray:6 5}
.ab .knockout{fill:none;stroke:var(--bg);stroke-width:5.6}.ab .knockout-band{stroke:var(--band)}
.ab .arrow{fill:none;stroke:none}
${(["ink", "muted", "neutral", "agent", "system", "done", "rework", "stop"] as Tone[])
	.map((t) => {
		const c = t === "ink" ? "muted" : t;
		const bg = t === "ink" || t === "muted" ? "surface" : `${t}-bg`;
		return `.ab .t-${t}{fill:var(--${c})}.ab .e-${t}{stroke:var(--${c})}.ab .k-${t}{fill:var(--${bg});stroke:var(--${c === "muted" ? "line" : c});stroke-width:1.5}`;
	})
	.join("")}
.ab .k-stop.panel{stroke-width:1.2;stroke-dasharray:5 4}
`.trim();

const diamond = (x0: number, y0: number, x1: number, y1: number) =>
	`M${(x0 + x1) / 2},${y0} L${x1},${(y0 + y1) / 2} L${(x0 + x1) / 2},${y1} L${x0},${(y0 + y1) / 2} Z`;

export const esc = (s: string) =>
	s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

export interface SvgOptions {
	idPrefix?: string;
	title?: string;
	/** Pin one palette instead of following prefers-color-scheme. */
	scheme?: "light" | "dark";
}

// Rules for shapes a diagram may not use are added only when it does, so
// existing diagrams keep their exact bytes.
const DECISION_STYLE =
	".ab .decision{stroke-opacity:.5;stroke-linejoin:round}.ab .decision-box{fill:var(--surface);fill-opacity:.82}";
const GAP_STYLE = ".ab .gap{fill:var(--bg)}.ab .gap-band{fill:var(--band)}";

export const svgStyle = (
	mode: "light" | "dark" | "auto" = "auto",
	fonts: Typography = new Typography(),
	extra: string[] = [],
) => `<style>${palette(mode)}\n${[style(fonts), ...extra].join("\n")}</style>`;

// A dot plus four hex digits encodes each unsafe UTF-16 code unit. Dots
// are escaped too, so this is reversible and cannot collide with safe input.
// The resulting alphabet is safe in both attributes and local url(#...) refs.
export const markerPrefix = (options: SvgOptions) =>
	(options.idPrefix ?? "ab").replace(
		/[^A-Za-z0-9_-]/g,
		(c) => `.${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
	);

// Flow playback fades unplayed shapes and text, preserving gaps and knockouts.
// Parts keep their own tone colours in every state; the current step stands
// out by glow and a heavier stroke. Geometry and draw order never change.
export function playStyle(mode: "auto" | "light" | "dark", id: string, kind: "flow" | "sequence" | "fan-out" = "flow"): string {
	const colors = (dark: boolean) => `--play:var(--ab-play,${dark ? "#6ff0cf" : "#0a7a60"});`;
	const defaults = mode === "auto"
		? `.ab.ab-auto{${colors(false)}}@media (prefers-color-scheme:dark){.ab.ab-auto{${colors(true)}}}`
		: `.ab.ab-${mode}{${colors(mode === "dark")}}`;
	const unplayed = `.ab[data-ab-play="${id}"].ab-in-progress [data-ab-part]${kind === "fan-out" ? '[data-ab-part^="outcome-"]' : ""}:where(:not(.ab-current):not(.ab-played))`;
	// Fade individual elements so text never inherits a group opacity. Opacity
	// accepts numbers/percentages and clamps in CSS; marker carriers fade heads.
	// Sequence playback retains its existing group fade and overlay ordering.
	const sequenceUnplayed = `.ab[data-ab-play="${id}"].ab-in-progress [data-ab-part]:not(.ab-current):not(.ab-played)`;
	const fade = kind === "sequence"
		? `${sequenceUnplayed}:not(:has(.gap)){opacity:.3}${sequenceUnplayed}:has(.gap) text{opacity:.3}`
		: `${unplayed} ${FADE_SHAPES}{opacity:var(--ab-play-unreached-opacity,.3)}`
			+ `${unplayed} text{opacity:var(--ab-play-unreached-text-opacity,.8)}`
			+ `@media (prefers-contrast:more),(forced-colors:active){${unplayed} text{opacity:1}}`;
	return `${defaults}${fade}\n${kind === "sequence" ? sequencePlayEffects(id) : playEffects(id, kind === "fan-out")}`;
}

// Toned shapes glow in their own tone; untoned ones in the play colour.
const GLOW_TONES = ["neutral", "agent", "system", "done", "rework", "stop"] as const;
const FADE_SHAPES = ":is(rect:not(.gap),path:not(.knockout),circle,line)";

function sequencePlayEffects(id: string): string {
	const root = `.ab[data-ab-play="${id}"]`;
	const parts = `${root} [data-ab-part]`;
	const playing = `${root}.ab-playing [data-ab-part]`;
	const current = `${root}.ab-in-progress [data-ab-part].ab-current`;
	const moving = `${playing}.ab-current`;
	const name = `ab-seq-${Array.from(id, c => c.charCodeAt(0).toString(16)).join("-")}`;
	const headers = '[data-ab-part^="participant-"]';
	const glow = "filter:drop-shadow(0 0 var(--ab-play-glow,6px) color-mix(in srgb,currentColor 55%,transparent))";
	return [
		`${parts}{color:var(--play)}`,
		...GLOW_TONES.map(t => `${parts}:has(circle.t-${t}){color:var(--${t})}`),
		// Responses have no origin dot, so their glow keeps the play colour.
		`${parts}.ab-current .e{${glow};stroke-width:2.2}`,
		`${parts}.ab-current .seq-number{fill:var(--play);font-weight:600}`,
		// Mono faces keep their advance at 600, so the bold label never re-wraps.
		`${parts}.ab-current .seq-label{font-weight:600}`,
		`${root} ${headers} circle{transform-box:fill-box;transform-origin:center}`,
		`${root} ${headers}.ab-current circle{transform:scale(1.7);${glow}}`,
		`${playing}{transition:opacity .35s ease}`,
		`${root}.ab-playing ${headers} circle{transition:transform .3s ease}`,
		`${root} :is(.seq-packet,.seq-time-band){opacity:0;pointer-events:none}`,
		`${root} .seq-time-band{fill:var(--play)}`,
		`${current} .seq-time-band{opacity:.1}`,
		// A round, near-zero dash is a dot on the same path, including loops.
		// Its gap exceeds the whole path so no second packet can appear.
		`${root} .seq-packet{fill:none;stroke-width:6;stroke-linecap:round;stroke-dasharray:.01 calc(var(--seq-length) + 8)}`,
		`${root}.ab-playing .seq-time-band{transition:opacity .35s ease}`,
		`${moving} path.e{animation:${name}-draw .55s ease-out}`,
		`${moving} .seq-packet{animation:${name}-travel .55s ease-out}`,
		// No fill mode on draw: response dashes return as soon as it finishes.
		`@keyframes ${name}-draw{from{stroke-dasharray:var(--seq-length) var(--seq-length);stroke-dashoffset:var(--seq-length)}to{stroke-dasharray:var(--seq-length) var(--seq-length);stroke-dashoffset:0}}`,
		// Lengths are unitless; both ends need a length so the offset interpolates
		// instead of jumping to the end at the midpoint.
		`@keyframes ${name}-travel{0%{stroke-dashoffset:0px;opacity:1}85%{opacity:1}100%{stroke-dashoffset:calc(var(--seq-length) * -1px);opacity:0}}`,
		`@media (prefers-reduced-motion:reduce){${playing},${root}.ab-playing ${headers} circle,${root}.ab-playing .seq-time-band{transition:none}${moving} :is(path.e,.seq-packet){animation:none}}`,
	].join("");
}

function playEffects(id: string, fanout = false): string {
	const root = `.ab[data-ab-play="${id}"]`;
	const playing = `${root}.ab-playing`;
	// Fan-out shared parts stay fully visible and never get current emphasis.
	const part = fanout ? '[data-ab-part^="outcome-"]' : "[data-ab-part]";
	// Encode every code unit so the name is a CSS identifier even for prefixes
	// containing dots, leading digits or non-ASCII. Names remain figure-local.
	const run = `ab-run-${Array.from(id, c => c.charCodeAt(0).toString(16)).join("-")}`;
	const shapes = fanout ? ":is(rect,.e,circle)" : ":is(rect:not(.gap),.decision,.e)";
	const edge = `${playing} ${part}.ab-current .e`;
	const fades = `${playing} ${part} ${FADE_SHAPES}`;
	// The glow reads currentColor: the play colour by default, a pill's dot
	// tone for the whole pill, and a shape's own tone for toned outlines/edges.
	const glowColors = [
		`${root} [data-ab-part]{color:var(--play)}`,
		...GLOW_TONES.map(t => `${root} [data-ab-part]:has(circle.t-${t}){color:var(--${t})}`),
		...(fanout ? [...GLOW_TONES.map(t => `${root} ${part}:has(rect.k-${t}){color:var(--${t})}`), `${root} ${part}:has(:is(rect.k-ink,rect.k-muted,circle.t-ink,circle.t-muted)){color:var(--muted)}`] : []),
		...GLOW_TONES.map(t => `${root} :is(.k-${t},.e-${t}){color:var(--${t})}`),
	];
	return [
		...glowColors,
		// Filter individual outlines/strokes only, never groups, text, gaps or
		// marker carriers. A literal zero blur leaves no outward glow.
		`${root} ${part}.ab-current ${shapes}{filter:drop-shadow(0 0 var(--ab-play-glow,6px) color-mix(in srgb,currentColor 55%,transparent));${fanout ? "" : "stroke-width:2.2"}}`,
		...(fanout ? [`${root} ${part}.ab-current :is(rect,.e){stroke-width:2.2}`] : []),
		`${edge}{stroke-dasharray:8 6;animation:${run} .7s linear infinite}`,
		// Offset decreases by exactly one dash period, flowing source to target.
		`@keyframes ${run}{from{stroke-dashoffset:0}to{stroke-dashoffset:-14}}`,
		`${fades}{transition:opacity .35s ease}`,
		`@media (prefers-reduced-motion:reduce){${edge}{animation:none${fanout ? ";stroke-dasharray:none" : ""}}${fades}{transition:none}}`,
	].join("");
}

export function toSvg(layout: Layout, options: SvgOptions = {}, playable = false): string {
	const mode =
		options.scheme === "light" || options.scheme === "dark"
			? options.scheme
			: "auto";
	const id = markerPrefix(options);
	const tones = [
		...new Set([
			...layout.routes.map((r) => r.tone),
			...(layout.legend?.keys ?? [])
				.filter((k) => k.item.kind === "edge" || k.item.kind === "dashed")
				.map((k) => k.item.tone),
		]),
	].sort();
	const out: string[] = [];
	out.push(
		`<svg xmlns="http://www.w3.org/2000/svg" class="ab ab-${mode}"${playable ? ` data-ab-play="${id}"` : ""} viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" role="img" aria-label="${esc(options.title ?? describe(layout))}">`,
	);
	const extra: string[] = [];
	if (
		layout.nodes.some((p) => p.node.kind === "decision") ||
		layout.legend?.keys.some((k) => k.item.kind === "decision")
	)
		extra.push(DECISION_STYLE);
	if (layout.routes.some((r) => r.label?.inline)) extra.push(GAP_STYLE);
	if (playable) extra.push(playStyle(mode, id));
	out.push(svgStyle(mode, layout.typography, extra));
	out.push("<defs>");
	for (const t of tones) {
		out.push(
			`<marker id="${id}-${t}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 z" class="t-${t}"/></marker>`,
		);
	}
	out.push("</defs>");
	const part = (name: string, svg: string) => playable ? `<g data-ab-part="${name}">${svg}</g>` : svg;
	for (const b of layout.bands) out.push(band(b, layout.width));
	for (let i = 0; i < layout.routes.length; i++) {
		const r = layout.routes[i];
		out.push(...knockouts(r, layout.routes.slice(0, i), layout.bands));
		out.push(part(edgePart(i), route(r)));
	}
	// Knockouts affect edge strokes only; all foreground content follows them.
	for (const [i, r] of layout.routes.entries()) out.push(part(edgePart(i), arrow(r, id)));
	for (const b of layout.bands)
		out.push(`<text x="20" y="${b.y + 22}" class="cap">${esc(b.label.toUpperCase())}</text>`);
	for (const [i, p] of layout.nodes.entries()) out.push(part(nodePart(i), node(p, layout.typography)));
	for (const [i, r] of layout.routes.entries()) if (r.label) out.push(part(edgePart(i), edgeLabel(r, layout.bands)));
	if (layout.legend) {
		out.push(
			`<line x1="8" y1="${layout.legend.y}" x2="${layout.width - 8}" y2="${layout.legend.y}" class="rule"/>`,
		);
		for (const k of layout.legend.keys) out.push(key(k, id, layout.typography));
	}
	out.push("</svg>");
	return `${out.join("\n")}\n`;
}

// Without a title, the accessible name lists the nodes top to bottom.
function describe(layout: Layout): string {
	const names = [...layout.nodes]
		.sort((a, b) => a.y - b.y || a.x - b.x)
		.map((p) => p.node.label);
	const keys = (layout.legend?.keys ?? []).map((k) =>
		k.item.sample ? `${k.item.sample}: ${k.item.text}` : k.item.text,
	);
	return `Flow: ${names.join(", ")}${keys.length ? `. Legend: ${keys.join(", ")}` : ""}`;
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
	return parts.join("\n");
}

// A small sample of the shape, then its meaning in fine print.
function key(k: Key, id: string, fonts: Typography): string {
	const { item, x, y } = k;
	const { w, h } = legendSampleSize(item, fonts);
	const t = item.tone;
	const sample =
		item.kind === "edge" || item.kind === "dashed"
			? `<path d="M${x},${y} L${x + w},${y}" class="e e-${t}${item.kind === "dashed" ? " dash" : ""}" marker-end="url(#${id}-${t})"/>`
			: item.kind === "decision"
				? `<path d="${diamond(x + w / 2 - 7, y - h / 2 - 4, x + w / 2 + 7, y + h / 2 + 4)}" class="k-${t} decision"/><rect x="${x}" y="${y - h / 2 + 2}" width="${w}" height="${h - 4}" rx="2" class="k-${t} decision-box"/>`
			: item.kind === "pill"
				? `<rect x="${x}" y="${y - h / 2}" width="${w}" height="${h}" rx="${h / 2}" class="pill"/><circle cx="${x + 7}" cy="${y}" r="3" class="t-${t}"/>`
				: `<rect x="${x}" y="${y - h / 2}" width="${w}" height="${h}" rx="${item.kind === "end" ? h / 2 : 3}" class="k-${t}${item.kind === "panel" ? " panel" : ""}"/>`;
	const label = item.sample
		? `<text x="${item.kind === "pill" ? x + 15 : x + w / 2}" y="${y + 4}"${item.kind === "pill" ? "" : ' text-anchor="middle"'} class="m s11${item.kind === "pill" ? "" : ` t-${t}`}">${esc(item.sample)}</text>`
		: "";
	return `<g>${sample}${label}<text x="${x + w + 6}" y="${y + 4}" class="s11 muted">${esc(item.text)}</text></g>`;
}

// Use the diagnostic's exact interior-crossing test, in source order. Keep
// each solid under-stroke local, even when the upper route itself is dashed.
function knockouts(r: Route, earlier: Route[], bands: Band[]): string[] {
	const out: string[] = [];
	for (const s of segments(r)) {
		const horizontal = s[0][1] === s[1][1];
		const k = horizontal ? 0 : 1;
		for (const other of earlier) {
			for (const t of segments(other)) {
				if (segSeg(s, t) !== "cross") continue;
				const point: Point = horizontal ? [t[0][0], s[0][1]] : [s[0][0], t[0][1]];
				const a: Point = [...point];
				const b: Point = [...point];
				a[k] = Math.max(point[k] - 6, Math.min(s[0][k], s[1][k]));
				b[k] = Math.min(point[k] + 6, Math.max(s[0][k], s[1][k]));
				// Split at band boundaries so a gap matches the canvas underneath.
				const cuts = horizontal ? [] : bands.flatMap((band) => [band.y, band.y + band.h - 8]);
				const stops = [a[k], ...cuts.filter((v) => v > a[k] && v < b[k]), b[k]].sort((x, y) => x - y);
				for (let i = 1; i < stops.length; i++) {
					a[k] = stops[i - 1];
					b[k] = stops[i];
					const y = (a[1] + b[1]) / 2;
					const shaded = bands.some((band) => band.shaded && y >= band.y && y < band.y + band.h - 8);
					out.push(`<path d="M${a[0]},${a[1]} L${b[0]},${b[1]}" class="knockout${shaded ? " knockout-band" : ""}"/>`);
				}
			}
		}
	}
	return out;
}

function route(r: Route): string {
	const d = r.points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
	return `<path d="${d}" class="e e-${r.tone}${r.edge.dashed ? " dash" : ""}"/>`;
}

function arrow(r: Route, id: string): string {
	const [a, b] = r.points.slice(-2);
	return `<path d="M${a[0]},${a[1]} L${b[0]},${b[1]}" class="arrow" marker-end="url(#${id}-${r.tone})"/>`;
}

function edgeLabel(r: Route, bands: Band[]): string {
	const l = r.label;
	if (!l) return "";
	if (l.inline) {
		// The gap takes the canvas colour underneath, like crossing knockouts.
		const shaded = bands.some((b) => b.shaded && l.y >= b.y && l.y < b.y + b.h - 8);
		const top = l.y - ((l.lines.length - 1) * INLINE_LEADING) / 2 + 4;
		return [
			"<g>",
			`<rect x="${l.x - l.w / 2}" y="${l.y - l.h / 2}" width="${l.w}" height="${l.h}" class="gap${shaded ? " gap-band" : ""}"/>`,
			...l.lines.map(
				(line, i) =>
					`<text x="${l.x}" y="${Math.round(top + i * INLINE_LEADING)}" text-anchor="middle" letter-spacing="${INLINE_TRACKING}em" class="s11 b t-${r.tone === "ink" ? "muted" : r.tone}">${esc(line)}</text>`,
			),
			"</g>",
		].join("\n");
	}
	const tone = r.tone === "ink" ? "" : ` t-${r.tone}`;
	return `<text x="${l.x}" y="${l.y}"${l.anchor === "end" ? ' text-anchor="end"' : ""} class="m s11${tone}">${esc(l.text)}</text>`;
}

function pill(
	x: number,
	y: number,
	h: number,
	label: string,
	tone: Tone,
	w: number,
): string {
	const cy = y + h / 2;
	return [
		`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" class="pill"/>`,
		`<circle cx="${x + 14}" cy="${cy}" r="5" class="t-${tone}"/>`,
		`<text x="${x + 26}" y="${cy + 4}" class="m s12">${esc(label)}</text>`,
	].join("\n");
}

function node(p: Placed, fonts: Typography): string {
	const { node: n, x, y, w, h } = p;
	const cx = Math.round(x + w / 2);
	switch (n.kind) {
		case "text":
			return `<text x="${cx}" y="${y + 12}" text-anchor="middle" class="s12 muted">${esc(n.label)}</text>`;
		case "pill":
			return `<g>${pill(x, y, h, n.label, n.tone, w)}</g>`;
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
					? wrap(n.sub)
							.map(
								(line, i) =>
									`<text x="${cx}" y="${y + 36 + i * 15}" text-anchor="middle" class="s11 muted">${esc(line)}</text>`,
							)
							.join("\n")
					: "",
				"</g>",
			].join("\n");
		case "decision": {
			const cy = y + h / 2;
			const lines = decisionLines(n);
			const top = cy - ((lines.length - 1) * DECISION_LEADING) / 2 + 4;
			const half = Math.round(h * DECISION_DIAMOND);
			return [
				"<g>",
				// The diamond marks the decision; the box over it holds the question
				// and lets the diamond show through faintly.
				`<path d="${diamond(cx - half, y, cx + half, y + h)}" class="k-${n.tone} decision"/>`,
				`<rect x="${x}" y="${y + DECISION_TIP}" width="${w}" height="${h - 2 * DECISION_TIP}" rx="6" class="k-${n.tone} decision-box"/>`,
				...lines.map(
					(line, i) =>
						`<text x="${cx}" y="${Math.round(top + i * DECISION_LEADING)}" text-anchor="middle" class="s12 b t-${n.tone === "muted" ? "ink" : n.tone}">${esc(line)}</text>`,
				),
				"</g>",
			].join("\n");
		}
		case "panel": {
			const parts = [
				`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="k-${n.tone} panel"/>`,
			];
			let cy = Math.round(y + 12 + (h - panelContentHeight(n, w, fonts)) / 2);
			for (const c of n.children) {
				if (c.kind === "pill") {
					const pw = fonts.pillWidth(c.text);
					parts.push(pill(Math.round(cx - pw / 2), cy, 30, c.text, n.tone, pw));
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
					const lines = panelLines(c, w, fonts);
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
