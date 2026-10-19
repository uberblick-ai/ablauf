// One step branching to its ordered outcomes. The author writes no edges:
// every entry gets its own branch from the step to its destination.
import { Typography } from "./fonts.ts";
import { CHAR, type Layout } from "./grid.ts";
import type { Diagnostic } from "./parse.ts";
import { esc, markerPrefix, type SvgOptions, svgStyle } from "./svg.ts";

interface Entry {
	outcome: string;
	reason: string;
	destination: string;
	line: number;
	raw: string; // Keep malformed source visible, including unrecognised fields.
}

const QUOTED = /^"(?:[^"\\]|\\.)*"/;
const WIDTH = 678;
const LEADING = 18;
// Step box, spine, branch labels and destination boxes, left to right.
const STEP = { x: 16, w: 176, text: 144 };
const SPINE = 216;
const LABEL = { x: 232, w: 228 };
const DEST = { x: 478, w: 184, text: 152 };

// Unlike flow labels, these cells have a fixed width. Break long words too.
function wrap(text: string, width: number, charWidth = CHAR.mono12): string[] {
	const limit = Math.floor(width / charWidth);
	const lines: string[] = [];
	let line = "";
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (line && [...line, ...word].length + 1 > limit) {
			lines.push(line);
			line = "";
		}
		const chars = [...word];
		while (chars.length > limit) {
			lines.push(chars.splice(0, limit).join(""));
		}
		if (chars.length) line = line ? `${line} ${chars.join("")}` : chars.join("");
	}
	if (line || !lines.length) lines.push(line);
	return lines;
}

export function renderFanout(source: string, options: SvgOptions = {}) {
	const mode =
		options.scheme === "light" || options.scheme === "dark"
			? options.scheme
			: "auto";
	const diagnostics: Diagnostic[] = [];
	const entries: Entry[] = [];
	const invalid: { line: number; text: string }[] = [];
	let step = "";
	let sawStep = false;
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
		if (/^step\s/.test(rest)) {
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
					error(line, "expected reason= or destination= followed by a quoted string");
					break;
				}
				rest = rest.slice(key[0].length);
				const value = quoted();
				if (seen.has(key[1])) error(line, `duplicate field \`${key[1]}\``);
				else if (key[1] === "reason" || key[1] === "destination") entry[key[1]] = value;
				else error(line, `unknown field \`${key[1]}\``);
				seen.add(key[1]);
			}
			for (const field of ["outcome", "reason", "destination"] as const)
				if (!entry[field].trim()) error(line, `outcome entry needs a non-empty ${field}`);
			if (diagnostics.length > before) entry.raw = text;
			entries.push(entry);
		} else {
			error(line, "expected `step` or `outcome`");
			invalid.push({ line, text });
		}
	}
	if (!sawStep) error(headerLine, "a fan-out needs one step");
	if (!entries.length) error(headerLine, "a fan-out needs at least one outcome entry");

	const body: string[] = [];
	const textLines = (lines: string[], x: number, y: number, classes: string) =>
		lines.map((text, i) => `<text x="${x}" y="${y + i * LEADING}" class="m ${classes}">${esc(text)}</text>`);
	const id = `${markerPrefix(options)}-ink`;

	// Each branch: the outcome above its line, the reason below, then the
	// destination box the arrow enters. Rows grow to fit their tallest part.
	const rows = entries.map((entry) => {
		const [outcome, reason, destination] = (["outcome", "reason", "destination"] as const).map((field, i) =>
			wrap(entry[field].trim() ? entry[field] : `[missing ${field}]`, i === 2 ? DEST.text : LABEL.w),
		);
		const raw = entry.raw ? wrap(`Line ${entry.line}: ${entry.raw}`, LABEL.w) : [];
		const branch = 24 + (outcome.length - 1) * LEADING; // offset of the line from the row top
		const below = reason.length + raw.length;
		const height = Math.max(branch + 6 + below * LEADING + (raw.length ? 8 : 0), branch - 17 + 16 + destination.length * LEADING);
		return { entry, outcome, reason, destination, raw, branch, height };
	});
	const GAP = 22;
	const span = rows.reduce((sum, row) => sum + row.height, 0) + GAP * Math.max(rows.length - 1, 0);
	const first = rows.length ? rows[0].branch : 0;
	const last = rows.length ? span - rows[rows.length - 1].height + rows[rows.length - 1].branch : 0;
	const stepLines = wrap(step.trim() ? step : "[missing step]", STEP.text, CHAR.mono13);
	const stepHeight = 44 + stepLines.length * LEADING;
	// Centre the step on the spine; push the rows down if the step is taller.
	const stepOffset = (first + last) / 2 - stepHeight / 2;
	const top = 16 + Math.max(0, -stepOffset);
	const stepTop = top + stepOffset;
	const stepMid = stepTop + stepHeight / 2;

	body.push(`<rect x="${STEP.x}" y="${stepTop}" width="${STEP.w}" height="${stepHeight}" rx="8" class="k-agent"/>`);
	body.push(`<text x="${STEP.x + 16}" y="${stepTop + 22}" class="cap">STEP</text>`);
	body.push(...textLines(stepLines, STEP.x + 16, stepTop + 44, "s13 b t-agent"));
	if (rows.length) {
		body.push(`<path d="M${STEP.x + STEP.w},${stepMid} L${SPINE},${stepMid}" class="e e-ink"/>`);
		if (rows.length > 1) body.push(`<path d="M${SPINE},${top + first} L${SPINE},${top + last}" class="e e-ink"/>`);
	}
	let y = top;
	for (const row of rows) {
		const line = y + row.branch;
		body.push(`<g data-line="${row.entry.line}">`);
		body.push(`<path d="M${SPINE},${line} L${DEST.x - 2},${line}" class="e e-ink" marker-end="url(#${id})"/>`);
		body.push(...textLines(row.outcome, LABEL.x, line - 10 - (row.outcome.length - 1) * LEADING, "s12 b"));
		body.push(...textLines(row.reason, LABEL.x, line + 20, "s12 muted"));
		body.push(...textLines(row.raw, LABEL.x, line + 28 + row.reason.length * LEADING, "s12 t-stop"));
		body.push(`<rect x="${DEST.x}" y="${line - 17}" width="${DEST.w}" height="${16 + row.destination.length * LEADING}" rx="8" class="pill"/>`);
		body.push(...textLines(row.destination, DEST.x + 16, line + 4, "s12 b"));
		body.push("</g>");
		y += row.height + GAP;
	}
	y = Math.max(top + span, stepTop + stepHeight);
	for (const item of invalid) {
		const lines = wrap(`Line ${item.line}: ${item.text}`, 614);
		body.push(...textLines(lines, 32, y + 20, "s12 t-stop"));
		y += 32 + lines.length * LEADING;
	}
	const defs = rows.length
		? `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 z" class="t-ink"/></marker></defs>\n`
		: "";
	// No routed-flow nodes or edges: the playground's grid overlay is empty.
	const layout: Layout = { width: WIDTH, height: y + 16, nodes: [], routes: [], bands: [], legend: null, diagnostics, typography: new Typography() };
	const description = `Fan-out: ${step}. ${entries.map((e) => `${e.outcome}: ${e.reason}; destination: ${e.destination}`).join(". ")}`;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="ab ab-${mode}" viewBox="0 0 ${WIDTH} ${layout.height}" width="${WIDTH}" height="${layout.height}" role="img" aria-label="${esc(options.title ?? description)}">\n${svgStyle(mode)}\n${defs}${body.join("\n")}\n</svg>\n`;
	return { svg, diagnostics, layout };
}
