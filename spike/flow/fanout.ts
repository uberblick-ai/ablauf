// An edge-free list: the author supplies one step and ordered outcome rows.
import { Typography } from "./fonts.ts";
import { CHAR, type Layout } from "./grid.ts";
import type { Diagnostic } from "./parse.ts";
import { esc, type SvgOptions, svgStyle } from "./svg.ts";

interface Entry {
	outcome: string;
	reason: string;
	destination: string;
	line: number;
	raw: string; // Keep malformed source visible, including unrecognised fields.
}

const QUOTED = /^"(?:[^"\\]|\\.)*"/;
const WIDTH = 678;
const XS = [32, 190, 464];
const WIDTHS = [142, 258, 182];
const LEADING = 18;

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
	const textLines = (lines: string[], x: number, y: number, classes: string) => {
		for (const [i, text] of lines.entries())
			body.push(`<text x="${x}" y="${y + i * LEADING}" class="m ${classes}">${esc(text)}</text>`);
	};
	const stepLines = wrap(step.trim() ? step : "[missing step]", 614, CHAR.mono13);
	const stepHeight = 44 + stepLines.length * LEADING;
	body.push(`<rect x="16" y="16" width="646" height="${stepHeight}" rx="8" class="k-agent"/>`);
	body.push('<text x="32" y="38" class="cap">STEP</text>');
	textLines(stepLines, 32, 60, "s13 b t-agent");
	let y = 16 + stepHeight + 30;
	for (const [i, title] of ["OUTCOME", "REASON", "DESTINATION"].entries())
		body.push(`<text x="${XS[i]}" y="${y}" class="cap">${title}</text>`);
	y += 14;
	for (const entry of entries) {
		const cells = (["outcome", "reason", "destination"] as const).map((field, i) =>
			wrap(entry[field].trim() ? entry[field] : `[missing ${field}]`, WIDTHS[i]),
		);
		const lines = Math.max(...cells.map((cell) => cell.length));
		const rawLines = entry.raw ? wrap(`Line ${entry.line}: ${entry.raw}`, 614) : [];
		const h = 24 + lines * LEADING + (rawLines.length ? 12 + rawLines.length * LEADING : 0);
		body.push(`<g data-line="${entry.line}">`);
		body.push(`<rect x="16" y="${y}" width="646" height="${h}" rx="8" class="pill"/>`);
		for (const [i, cell] of cells.entries()) textLines(cell, XS[i], y + 26, i === 1 ? "s12 muted" : "s12 b");
		textLines(rawLines, 32, y + 38 + lines * LEADING, "s12 t-stop");
		body.push("</g>");
		y += h + 8;
	}
	for (const item of invalid) {
		const lines = wrap(`Line ${item.line}: ${item.text}`, 614);
		textLines(lines, 32, y + 20, "s12 t-stop");
		y += 32 + lines.length * LEADING;
	}
	// No routed-flow nodes or edges: the playground's grid overlay is empty.
	const layout: Layout = { width: WIDTH, height: y + 16, nodes: [], routes: [], bands: [], legend: null, diagnostics, typography: new Typography() };
	const description = `Fan-out: ${step}. ${entries.map((e) => `${e.outcome}: ${e.reason}; destination: ${e.destination}`).join(". ")}`;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="ab" viewBox="0 0 ${WIDTH} ${layout.height}" width="${WIDTH}" height="${layout.height}" role="img" aria-label="${esc(options.title ?? description)}">\n${svgStyle(options.scheme)}\n${body.join("\n")}\n</svg>\n`;
	return { svg, diagnostics, layout };
}
