// One step branching to its ordered outcomes. The author writes no edges:
// every entry gets its own branch from the step to its destination.
import { type TextStyle, Typography } from "./fonts.ts";
import { CHAR, type Layout } from "./grid.ts";
import type { RenderOptions } from "./index.ts";
import { type Diagnostic, type Tone, TONES } from "./parse.ts";
import { esc, markerPrefix, svgStyle } from "./svg.ts";

interface Entry {
	outcome: string;
	reason: string;
	destination: string;
	tone?: Tone;
	line: number;
	raw: string; // Keep malformed source visible, including unrecognised fields.
}

const QUOTED = /^"(?:[^"\\]|\\.)*"/;
const WIDTH = 678;
const LEADING = 18;
// The step, curved branches into outcome boxes, then each destination and
// reason after a short arrow: read left to right.
const STEP = { x: 16, w: 150, text: 118 };
const OUTCOME = { x: 216, w: 170, text: 142 };
const EFFECT = { x: 426, w: 236 };
// Each curve ends in a short straight run, so its arrowhead points along it.
const LEAD = 14;
// The ladder: a rail of tone dots under the step, destinations right-aligned.
const RAIL = 40;
const LADDER = { x: 60, outcome: 260, reason: 400, destination: 220, right: 662 };
const STYLES = ["branches", "ladder"] as const;
type Style = (typeof STYLES)[number];

// Unlike flow labels, these cells have a fixed width. Break long words too.
function wrap(text: string, width: number, typography: Typography,
	fontSize: TextStyle["fontSize"] = 12, fontWeight: TextStyle["fontWeight"] = 400): string[] {
	// Retain the historical character limit exactly for the default font.
	const limit = Math.floor(width / CHAR[`mono${fontSize}`]);
	const fits = (text: string) => typography.mono
		? typography.width(text, "mono", fontSize, fontWeight) <= width
		: [...text].length <= limit;
	const lines: string[] = [];
	let line = "";
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (line && !fits(`${line} ${word}`)) {
			lines.push(line);
			line = "";
		}
		const chars = [...word];
		while (chars.length && !fits(chars.join(""))) {
			// Always consume a glyph, even if it alone exceeds the area.
			let count = 1;
			while (count < chars.length && fits(chars.slice(0, count + 1).join(""))) count++;
			lines.push(chars.splice(0, count).join(""));
		}
		if (chars.length) line = line ? `${line} ${chars.join("")}` : chars.join("");
	}
	if (line || !lines.length) lines.push(line);
	return lines;
}

export function renderFanout(source: string, options: RenderOptions = {}) {
	const typography = new Typography(options.fonts);
	const wrapped = (text: string, width: number, fontSize: TextStyle["fontSize"] = 12,
		fontWeight: TextStyle["fontWeight"] = 400) => wrap(text, width, typography, fontSize, fontWeight);
	const mode =
		options.scheme === "light" || options.scheme === "dark"
			? options.scheme
			: "auto";
	const diagnostics: Diagnostic[] = [];
	const entries: Entry[] = [];
	const invalid: { line: number; text: string }[] = [];
	let step = "";
	let sawStep = false;
	let style: Style = "branches";
	let sawStyle = false;
	let headerLine = 1;
	let sawHeader = false;
	const error = (line: number, message: string) =>
		diagnostics.push({ line, severity: "error", message });

	for (const [i, raw] of source.split("\n").entries()) {
		const line = i + 1;
		const text = raw.trim();
		if (!text || text.startsWith("#")) continue;
		if (!sawHeader) {
			sawHeader = true;
			headerLine = line;
			const header = /^fan-out\s+v(\d+)$/.exec(text);
			if (!header) error(line, "first line should be `fan-out v0`; assuming v0");
			else if (header[1] !== "0") diagnostics.push({
				line, severity: "warning",
				message: `fan-out v${header[1]} is newer than this renderer; drawing it as v0`,
			});
			if (!header) invalid.push({ line, text });
			continue;
		}
		let rest = text;
		const before = diagnostics.length;
		const quoted = (): string => {
			const match = QUOTED.exec(rest);
			if (!match) {
				error(line, "expected a double-quoted string");
				rest = "";
				return "";
			}
			rest = rest.slice(match[0].length);
			try {
				return JSON.parse(match[0]) as string;
			} catch {
				error(line, "invalid quoted string; use JSON string escapes");
				return "";
			}
		};
		if (/^style(?:\s|$)/.test(rest)) {
			const value = rest.slice(5).trim();
			if (sawStyle) error(line, "a fan-out names at most one style");
			else if (!STYLES.includes(value as Style)) error(line, `unknown style \`${value}\`; use ${STYLES.join(" or ")}`);
			else if (sawStep || entries.length) error(line, "declare the style before the step");
			else style = value as Style;
			sawStyle = true;
			if (diagnostics.length > before) invalid.push({ line, text });
		} else if (/^step\s/.test(rest)) {
			rest = rest.slice(4).trimStart();
			const value = quoted();
			if (sawStep) error(line, "a fan-out names exactly one step");
			else {
				step = value;
				sawStep = true;
				if (!step.trim()) error(line, "step needs non-empty text");
				if (entries.length) error(line, "declare the step before its outcomes");
			}
			if (rest.trim()) error(line, "unexpected text after step");
			if (diagnostics.length > before) invalid.push({ line, text });
		} else if (/^outcome(?:\s|$)/.test(rest)) {
			rest = rest.slice(7).trimStart();
			const entry: Entry = { outcome: quoted(), reason: "", destination: "", line, raw: "" };
			const seen = new Set<string>();
			while (rest.trim()) {
				const key = /^\s+([a-z]+)=/.exec(rest);
				if (!key) {
					error(line, "expected reason=, destination= or tone= followed by a quoted string");
					break;
				}
				rest = rest.slice(key[0].length);
				const value = quoted();
				if (seen.has(key[1])) error(line, `duplicate field \`${key[1]}\``);
				else if (key[1] === "reason" || key[1] === "destination") entry[key[1]] = value;
				else if (key[1] === "tone") {
					if (TONES.includes(value as Tone)) entry.tone = value as Tone;
					else error(line, `unknown tone \`${value}\`; use one of ${TONES.join(", ")}`);
				}
				else error(line, `unknown field \`${key[1]}\``);
				seen.add(key[1]);
			}
			for (const field of ["outcome", "reason", "destination"] as const)
				if (!entry[field].trim()) error(line, `outcome entry needs a non-empty ${field}`);
			if (diagnostics.length > before) entry.raw = text;
			entries.push(entry);
		} else {
			error(line, "expected `style`, `step` or `outcome`");
			invalid.push({ line, text });
		}
	}
	if (!sawStep) error(headerLine, "a fan-out needs one step");
	if (!entries.length) error(headerLine, "a fan-out needs at least one outcome entry");

	const body: string[] = [];
	const textLines = (lines: string[], x: number, y: number, classes: string, anchor = "") =>
		lines.map((text, i) => `<text x="${x}" y="${y + i * LEADING}"${anchor ? ` text-anchor="${anchor}"` : ""} class="m ${classes}">${esc(text)}</text>`);
	const id = `${markerPrefix(options)}-ink`;
	const ladder = style === "ladder";
	let y = ladder ? drawLadder() : drawBranches();

	function drawBranches(): number {
		// Each row: the outcome box a branch curves into, then an arrow to the
		// destination with its reason below. Rows grow to fit their taller side.
		const rows = entries.map((entry) => {
			const outcome = wrapped(entry.outcome.trim() ? entry.outcome : "[missing outcome]", OUTCOME.text, 12, 600);
			const destination = wrapped(entry.destination.trim() ? entry.destination : "[missing destination]", EFFECT.w, 12, 600);
			const reason = wrapped(entry.reason.trim() ? entry.reason : "[missing reason]", EFFECT.w);
			const raw = entry.raw ? wrapped(`Line ${entry.line}: ${entry.raw}`, EFFECT.w) : [];
			const box = 16 + outcome.length * LEADING;
			// The destination's first line sits beside the box's middle unless the
			// effect text is too tall, then it starts at the top of the row.
			const lines = destination.length + reason.length + raw.length;
			const first = Math.max(14, box / 2 + 4 - (destination.length > 1 ? LEADING / 2 : 0));
			const effect = first + (lines - 1) * LEADING + 4 + (raw.length ? 8 : 0);
			return { entry, outcome, destination, reason, raw, box, first, height: Math.max(box, effect) };
		});
		const GAP = 18;
		const span = rows.reduce((sum, row) => sum + row.height, 0) + GAP * Math.max(rows.length - 1, 0);
		const stepLines = wrapped(step.trim() ? step : "[missing step]", STEP.text, 13, 600);
		const stepHeight = 24 + stepLines.length * LEADING;
		const top = 16 + Math.max(0, (stepHeight - span) / 2);
		const stepTop = top + span / 2 - stepHeight / 2;
		const stepMid = top + span / 2;

		body.push(`<rect x="${STEP.x}" y="${stepTop}" width="${STEP.w}" height="${stepHeight}" rx="8" class="k-agent"/>`);
		body.push(...textLines(stepLines, STEP.x + 16, stepTop + 26, "s13 b t-agent"));
		let y = top;
		for (const row of rows) {
			const mid = y + row.box / 2;
			const from = STEP.x + STEP.w;
			const end = OUTCOME.x - 2 - LEAD;
			const bend = (from + end) / 2;
			const tone = row.entry.tone ? `k-${row.entry.tone}${row.entry.tone === "stop" ? " panel" : ""}` : "pill";
			body.push(`<g data-line="${row.entry.line}">`);
			body.push(`<path d="M${from},${stepMid} C${bend},${stepMid} ${bend},${mid} ${end},${mid} L${OUTCOME.x - 2},${mid}" class="e e-ink" marker-end="url(#${id})"/>`);
			body.push(`<rect x="${OUTCOME.x}" y="${y}" width="${OUTCOME.w}" height="${row.box}" rx="8" class="${tone}"/>`);
			body.push(...textLines(row.outcome, OUTCOME.x + 14, y + 22, "s12 b"));
			body.push(`<path d="M${OUTCOME.x + OUTCOME.w},${mid} L${EFFECT.x - 12},${mid}" class="e e-ink" marker-end="url(#${id})"/>`);
			const first = y + row.first;
			body.push(...textLines(row.destination, EFFECT.x, first, "s12 b"));
			body.push(...textLines(row.reason, EFFECT.x, first + row.destination.length * LEADING, "s12 muted"));
			body.push(...textLines(row.raw, EFFECT.x, first + 8 + (row.destination.length + row.reason.length) * LEADING, "s12 t-stop"));
			body.push("</g>");
			y += row.height + GAP;
		}
		return Math.max(top + span, stepTop + stepHeight);
	}

	function drawLadder(): number {
		const stepLines = wrapped(step.trim() ? step : "[missing step]", 614, 13, 600);
		const stepWidth = Math.min(646, 32 + Math.max(...stepLines.map((l) => typography.width(l, "mono", 13, 600))));
		const stepHeight = 24 + stepLines.length * LEADING;
		body.push(`<rect x="${STEP.x}" y="16" width="${stepWidth}" height="${stepHeight}" rx="8" class="k-agent"/>`);
		body.push(...textLines(stepLines, STEP.x + 16, 42, "s13 b t-agent"));
		const rows: string[][] = [];
		let y = 16 + stepHeight + 30;
		let last = y;
		for (const entry of entries) {
			const outcome = wrapped(entry.outcome.trim() ? entry.outcome : "[missing outcome]", LADDER.outcome, 12, 600);
			const destination = wrapped(entry.destination.trim() ? entry.destination : "[missing destination]", LADDER.destination, 12, 600);
			const reason = wrapped(entry.reason.trim() ? entry.reason : "[missing reason]", LADDER.reason);
			const raw = entry.raw ? wrapped(`Line ${entry.line}: ${entry.raw}`, LADDER.right - LADDER.x) : [];
			const row = [`<g data-line="${entry.line}">`];
			row.push(`<circle cx="${RAIL}" cy="${y - 4}" r="6" class="t-${entry.tone ?? "muted"}"/>`);
			row.push(...textLines(outcome, LADDER.x, y, "s12 b"));
			row.push(...textLines(destination, LADDER.right, y, "s12 b", "end"));
			// A dotted leader joins the outcome to its destination when there is room.
			const from = LADDER.x + typography.width(outcome[0], "mono", 12, 600) + 12;
			const to = LADDER.right - typography.width(destination[0], "mono", 12, 600) - 12;
			if (to - from >= 24) row.push(`<line x1="${from}" y1="${y - 4}" x2="${to}" y2="${y - 4}" class="rule"/>`);
			const left = Math.max(outcome.length, destination.length);
			row.push(...textLines(reason, LADDER.x, y + left * LEADING, "s12 muted"));
			row.push(...textLines(raw, LADDER.x, y + 8 + (left + reason.length) * LEADING, "s12 t-stop"));
			row.push("</g>");
			rows.push(row);
			last = y;
			y += (left + reason.length + raw.length) * LEADING + (raw.length ? 8 : 0) + 22;
		}
		if (entries.length) body.push(`<path d="M${RAIL},${16 + stepHeight} L${RAIL},${last - 4}" class="e e-ink"/>`);
		for (const row of rows) body.push(...row);
		return entries.length ? y - 22 - 12 : 16 + stepHeight;
	}
	for (const item of invalid) {
		const lines = wrapped(`Line ${item.line}: ${item.text}`, 614);
		body.push(...textLines(lines, 32, y + 20, "s12 t-stop"));
		y += 32 + lines.length * LEADING;
	}
	const defs = entries.length && !ladder
		? `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 z" class="t-ink"/></marker></defs>\n`
		: "";
	// No routed-flow nodes or edges: the playground's grid overlay is empty.
	const layout: Layout = { width: WIDTH, height: y + 16, nodes: [], routes: [], bands: [], legend: null, diagnostics, typography };
	const description = `Fan-out: ${step}. ${entries.map((e) => `${e.outcome}: ${e.reason}; destination: ${e.destination}`).join(". ")}`;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="ab ab-${mode}" viewBox="0 0 ${WIDTH} ${layout.height}" width="${WIDTH}" height="${layout.height}" role="img" aria-label="${esc(options.title ?? description)}">\n${svgStyle(mode, typography)}\n${defs}${body.join("\n")}\n</svg>\n`;
	return { svg, diagnostics, layout };
}
