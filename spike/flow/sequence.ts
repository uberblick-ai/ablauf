// Sequence owns its rows and evenly spaced lanes; it never routes flow nodes.
import { type TextStyle, Typography } from "./fonts.ts";
import type { Layout } from "./grid.ts";
import type { RenderOptions } from "./index.ts";
import { type Diagnostic, type Tone, TONES } from "./parse.ts";
import { esc, markerPrefix, svgStyle } from "./svg.ts";

interface Participant { id: string; title: string; tone: Tone; line: number }
interface Message { from: Participant; to: Participant; response: boolean; label: string; line: number }
const WIDTH = 678;
const GUTTER = 22;
const RIGHT = WIDTH - 8;
const LEADING = 18;
const STYLE = ".ab .seq-lane{fill:var(--neutral-bg)}.ab .seq-life{stroke:var(--line);stroke-width:1;stroke-opacity:.5}.ab .seq-response{stroke-width:1.2}";

// Fixed bounds apply to words and unbroken tokens alike. Use the same mono
// metrics as the emitted face, and always consume a glyph to make progress.
function wrap(text: string, width: number, fonts: Typography,
	fontSize: TextStyle["fontSize"] = 12, fontWeight: TextStyle["fontWeight"] = 400): string[] {
	const fits = (value: string) => fonts.width(value, "mono", fontSize, fontWeight) <= width;
	const lines: string[] = [];
	let line = "";
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (line && !fits(`${line} ${word}`)) { lines.push(line); line = ""; }
		const chars = [...word];
		while (chars.length && !fits(chars.join(""))) {
			let count = 1;
			while (count < chars.length && fits(chars.slice(0, count + 1).join(""))) count++;
			lines.push(chars.splice(0, count).join(""));
		}
		if (chars.length) line = line ? `${line} ${chars.join("")}` : chars.join("");
	}
	if (line || !lines.length) lines.push(line);
	return lines;
}

export function renderSequence(source: string, options: RenderOptions = {}) {
	// Sequence has only mono text. Ignoring the text role also keeps its face
	// and metrics out of sequence SVG bytes.
	const typography = new Typography({ mono: options.fonts?.mono });
	const diagnostics: Diagnostic[] = [];
	const participants: Participant[] = [];
	const byId = new Map<string, Participant>();
	const messages: Message[] = [];
	const invalid: { line: number; text: string }[] = [];
	let sawHeader = false;
	let sawMessage = false;
	const error = (line: number, message: string) => diagnostics.push({ line, severity: "error", message } as Diagnostic);
	for (const [i, raw] of source.split("\n").entries()) {
		const line = i + 1;
		const text = raw.trim();
		if (!text || text.startsWith("#")) continue;
		const before = diagnostics.length;
		if (!sawHeader) {
			sawHeader = true;
			const header = /^sequence\s+v(\d+)$/.exec(text);
			if (!header) error(line, "first line should be `sequence v0`; assuming v0");
			else if (Number(header[1]) > 0) diagnostics.push({ line, severity: "warning", message: `sequence v${header[1]} is newer than this renderer; drawing it as v0` });
			if (!header) invalid.push({ line, text });
			continue;
		}
		if (/^participant(?:\s|$)/.test(text)) {
			let rest = text.slice(11).trimStart();
			const id = /^([^\s"]+)/.exec(rest)?.[1];
			if (!id) error(line, "participant needs an id");
			else {
				rest = rest.slice(id.length);
				if (rest && !/^\s/.test(rest)) error(line, "expected whitespace after participant id");
				rest = rest.trimStart();
				let title = id;
				let tone: Tone = "ink";
				if (rest.startsWith('"')) {
					const quoted = /^"([^"]*)"/.exec(rest);
					if (!quoted) { error(line, "unclosed participant title; flow strings have no escapes"); rest = ""; }
					else {
						title = quoted[1];
						rest = rest.slice(quoted[0].length);
						if (rest && !/^\s/.test(rest)) error(line, "unexpected text after participant title");
					}
				}
				const seen = new Set<string>();
				for (const field of rest.trim().split(/\s+/).filter(Boolean)) {
					const key = /^([^=]+)=(.*)$/.exec(field);
					if (!key) { error(line, "unexpected text after participant; expected tone=TONE"); continue; }
					if (seen.has(key[1])) error(line, `duplicate participant key \`${key[1]}\``);
					else if (key[1] !== "tone") error(line, `unknown participant key \`${key[1]}\``);
					else if (!TONES.includes(key[2] as Tone)) error(line, `unknown tone \`${key[2]}\`; use one of ${TONES.join(", ")}`);
					else tone = key[2] as Tone;
					seen.add(key[1]);
				}
				if (sawMessage) error(line, "declare participants before the first message");
				if (byId.has(id)) error(line, `duplicate participant id \`${id}\`; keeping the first declaration`);
				// Reject malformed declarations as a whole; their exact source is
				// visible below. A duplicate or late declaration creates no lane.
				if (diagnostics.length === before) {
					const participant = { id, title, tone, line };
					participants.push(participant);
					byId.set(id, participant);
				}
			}
		} else {
			const colon = text.indexOf(":");
			if (colon < 0) error(line, "message needs a colon before its label");
			const head = colon < 0 ? text : text.slice(0, colon).trim();
			// Split on literal arrows in one pass. A backtracking endpoint regex
			// would repeatedly revisit arrows in a long malformed library input.
			const parts = head.split(/(-->|-\.->)/);
			const fromId = parts[0].trim();
			const toId = parts[2]?.trim() ?? "";
			if (head.includes("->>") || parts.length !== 3 || !fromId || !toId || /\s/.test(fromId) || /\s/.test(toId))
				error(line, "malformed message arrow; use --> (request) or -.-> (response)");
			else {
				sawMessage = true;
				const from = byId.get(fromId);
				const to = byId.get(toId);
				for (const id of new Set([fromId, toId]))
					if (!byId.has(id)) error(line, `unknown message participant \`${id}\``);
				if (from && to && colon >= 0) messages.push({ from, to, response: parts[1] === "-.->", label: text.slice(colon + 1).trim(), line });
			}
		}
		if (diagnostics.length > before) invalid.push({ line, text });
	}

	const mode = options.scheme === "light" || options.scheme === "dark" ? options.scheme : "auto";
	const laneWidth = (WIDTH - GUTTER) / Math.max(1, participants.length);
	const centres = new Map(participants.map((p, i) => [p, Math.round(GUTTER + laneWidth * (i + 0.5))]));
	const centre = (p: Participant) => centres.get(p) as number;
	const wrapped = (text: string, width: number, size: TextStyle["fontSize"] = 12, weight: TextStyle["fontWeight"] = 400) => wrap(text, width, typography, size, weight);
	const textLines = (lines: string[], x: number, y: number, classes: string, anchor = "") => lines.map((text, i) => `<text x="${x}" y="${y + i * LEADING}"${anchor ? ` text-anchor="${anchor}"` : ""} class="m ${classes}">${esc(text)}</text>`);
	const titles = participants.map((p) => wrapped(p.title, laneWidth - 16, 12, 600));
	const headerBottom = 36 + Math.max(1, ...titles.map((t) => t.length)) * LEADING;
	const body: string[] = [];
	const defs: string[] = [];
	const prefix = `${markerPrefix(options)}-seq`;
	for (const tone of [...new Set(messages.filter((m) => !m.response).map((m) => m.from.tone))].sort())
		defs.push(`<marker id="${prefix}-${tone}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 z" class="t-${tone}"/></marker>`);
	if (messages.some((m) => m.response)) defs.push(`<marker id="${prefix}-response" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10" class="e e-muted seq-response"/></marker>`);
	let y = headerBottom;
	for (const [i, message] of messages.entries()) {
		const from = centre(message.from), to = centre(message.to);
		const self = from === to;
		const loop = Math.min(24, (RIGHT - from) / 2);
		const labelX = self ? from + loop + 8 : Math.min(from, to) + 8;
		const labels = wrapped(message.label, RIGHT - labelX);
		const numbers = wrapped(String(i + 1).padStart(2, "0"), GUTTER - 2, 11);
		const arrowY = y + labels.length * LEADING + 8;
		const tone = message.response ? "muted" : message.from.tone;
		const path = self
			? `M${from},${arrowY} H${from + loop - 5} Q${from + loop},${arrowY} ${from + loop},${arrowY + 5} V${arrowY + 17} Q${from + loop},${arrowY + 22} ${from + loop - 5},${arrowY + 22} H${to}`
			: `M${from},${arrowY} L${to},${arrowY}`;
		body.push(`<g data-line="${message.line}" data-step="${i + 1}">`);
		body.push(...textLines(labels, labelX, y + 12, "s12 seq-label"));
		body.push(...textLines(numbers, 0, arrowY + 4, "s11 muted seq-number"));
		body.push(`<path d="${path}" class="e e-${tone}${message.response ? " dash seq-response" : ""}" marker-end="url(#${prefix}-${message.response ? "response" : tone})"/>`);
		if (!message.response) body.push(`<circle cx="${from}" cy="${arrowY}" r="2.5" class="t-${tone}"/>`);
		body.push("</g>");
		y = arrowY + Math.max(self ? 22 : 0, (numbers.length - 1) * LEADING) + 26;
	}
	for (const item of invalid) {
		const lines = wrapped(`Line ${item.line}: ${item.text}`, RIGHT - GUTTER - 8);
		body.push(`<g data-line="${item.line}">`, ...textLines(lines, GUTTER + 8, y + 12, "s12 t-stop seq-rejected"), "</g>");
		y += lines.length * LEADING + 14;
	}
	const height = y + 12;
	const background: string[] = [];
	for (const [i, p] of participants.entries()) {
		if (i % 2 === 1) background.push(`<rect x="${GUTTER + i * laneWidth}" y="8" width="${laneWidth}" height="${height - 16}" rx="8" class="seq-lane" fill-opacity="0.15"/>`);
		background.push(`<line x1="${centre(p)}" y1="${headerBottom - 8}" x2="${centre(p)}" y2="${height - 8}" class="seq-life"/>`);
	}
	for (const [i, p] of participants.entries()) {
		background.push(`<g data-line="${p.line}">`, `<circle cx="${centre(p)}" cy="20" r="3" class="t-${p.tone}"/>`, ...textLines(titles[i], centre(p), 40, `s12 b t-${p.tone} seq-title`, "middle"), "</g>");
	}
	const layout: Layout = { width: WIDTH, height, nodes: [], routes: [], bands: [], legend: null, diagnostics, typography };
	const description = `Sequence: ${participants.map((p) => p.title).join(", ")}. ${messages.map((m) => `${m.from.title} to ${m.to.title}: ${m.label}`).join(". ")}`;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="ab ab-${mode}" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" role="img" aria-label="${esc(options.title ?? description)}">\n${svgStyle(mode, typography, [STYLE])}\n<defs>${defs.join("\n")}</defs>\n${[...background, ...body].join("\n")}\n</svg>\n`;
	return { svg, diagnostics, layout };
}
