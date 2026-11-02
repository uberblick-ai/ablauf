// Sequence owns its rows and evenly spaced lanes; it never routes flow nodes.
import { type TextStyle, Typography } from "./fonts.ts";
import type { Layout } from "./grid.ts";
import type { RenderOptions } from "./index.ts";
import { type Diagnostic, type Tone, TONES } from "./parse.ts";
import type { Scenario } from "./play.ts";
import { nameTimelines } from "./play-timelines.ts";
import { esc, markerPrefix, playStyle, svgStyle } from "./svg.ts";

interface Participant { id: string; title: string; tone: Tone; line: number }
interface Message { from: Participant; to: Participant; response: boolean; label: string; line: number }
type GroupKind = "alt" | "opt" | "loop" | "group";
interface Group {
	kind: GroupKind; label: string; line: number; parent?: Group; depth: number;
	first: number; last: number; self: number; left: number; right: number; top: number; bottom: number;
}
type Row = { type: "message"; message: Message } | { [K in "open" | "else" | "end"]: { type: K; group: Group; label: string; line: number } }["open" | "else" | "end"]
	| { type: "note"; participants: Participant[]; label: string; line: number }
	| { type: "section"; label: string; line: number };
const RESERVED = new Set(["alt", "opt", "loop", "group", "else", "end", "note", "section"]);
const WIDTH = 678;
const GUTTER = 22;
const RIGHT = WIDTH - 8;
const LEADING = 18;
const STYLE = ".ab .seq-lane{fill:var(--neutral-bg)}.ab .seq-life{stroke:var(--line);stroke-width:1;stroke-opacity:.5}.ab .seq-response{stroke-width:1.2}.ab .seq-group{fill:var(--neutral-bg)}.ab .seq-kind{fill:var(--ink)}.ab .seq-note{fill:var(--rework-bg)}.ab .seq-note-text{fill:var(--rework)}.ab .seq-divider{stroke:var(--line);stroke-width:1;stroke-dasharray:2 4}.ab .seq-rule{stroke:var(--line);stroke-width:1}";

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

// Adjacency follows accepted, visible row order, not source line numbers.
// Notes attach backward; opening/branch/section labels attach forward.
function sequencePlayback(scenarios: Scenario[], participants: Participant[], rows: Row[], diagnostics: Diagnostic[]) {
	const headers = new Map(participants.map((p, i) => [p, `participant-${i}`]));
	const rowParts = new Map<Row, string>();
	const messages: { message: Message; parts: string[] }[] = [];
	let annotation = 0;
	let precedingLabels: string[] = [];
	let previous: string[] | undefined;
	for (const row of rows) {
		if (row.type === "end") continue;
		if (row.type === "message") {
			const { from, to } = row.message;
			const part = `message-${messages.length}`;
			rowParts.set(row, part);
			const parts = [part, ...new Set([headers.get(from) as string, headers.get(to) as string]), ...precedingLabels];
			messages.push({ message: row.message, parts });
			previous = parts;
			precedingLabels = [];
		} else {
			const part = `annotation-${annotation++}`;
			rowParts.set(row, part);
			if (row.type === "note") {
				previous?.push(part);
				precedingLabels = [];
			} else {
				precedingLabels.push(part);
				previous = undefined;
			}
		}
	}
	const timelines = nameTimelines(scenarios).map((timeline, index) => {
		for (const step of scenarios[index].steps) {
			const number = /^\d+$/.test(step.target) ? Number(step.target) : NaN;
			const resolved = Number.isSafeInteger(number) && number > 0 ? messages[number - 1] : undefined;
			if (!resolved) {
				diagnostics.push({ line: step.line, severity: "error", message: `unknown sequence playback target \`${step.target}\`; expected a drawn message number; step skipped` });
				continue;
			}
			const { from, to } = resolved.message;
			timeline.steps.push({ target: String(number), kind: "message", actor: step.actor ?? (from === to ? from.title : `${from.title} → ${to.title}`), caption: step.caption, ms: step.ms, parts: [...resolved.parts] });
		}
		return timeline;
	});
	return { timelines, headers, rowParts };
}

export function renderSequence(source: string, options: RenderOptions = {}, scenarios: Scenario[] = []) {
	// Sequence has only mono text. Ignoring the text role also keeps its face
	// and metrics out of sequence SVG bytes.
	const typography = new Typography({ mono: options.fonts?.mono });
	const diagnostics: Diagnostic[] = [];
	const participants: Participant[] = [];
	const byId = new Map<string, Participant>();
	const messages: Message[] = [];
	const rows: Row[] = [];
	const groups: Group[] = [];
	const stack: Group[] = [];
	const touch = (people: Participant[]) => {
		const group = stack.at(-1);
		if (group) for (const p of people) {
			const index = participants.indexOf(p);
			group.first = Math.min(group.first, index);
			group.last = Math.max(group.last, index);
		}
	};
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
				if (RESERVED.has(id)) error(line, `reserved annotation id \`${id}\`; choose another participant id`);
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
		} else if (/^(alt|opt|loop|group|else|end|note|section)(?:\s|$)/.test(text)) {
			const keyword = /^\S+/.exec(text)?.[0] as string;
			const label = text.slice(keyword.length).trim();
			if (["alt", "opt", "loop", "group"].includes(keyword)) {
				if (!label) error(line, `${keyword} needs a label`);
				else {
					const group: Group = { kind: keyword as GroupKind, label, line, parent: stack.at(-1), depth: stack.length,
						first: Infinity, last: -1, self: -1, left: 0, right: 0, top: 0, bottom: 0 };
					groups.push(group); stack.push(group);
					rows.push({ type: "open", group, label, line });
				}
			} else if (keyword === "else") {
				const group = stack.at(-1);
				if (!label) error(line, "else needs a label");
				if (group?.kind !== "alt") error(line, "else requires the current group to be alt");
				if (diagnostics.length === before && group) rows.push({ type: "else", group, label, line });
			} else if (keyword === "end") {
				if (label) error(line, "end must have no trailing text");
				if (!stack.length) error(line, "end without an open group");
				if (diagnostics.length === before) rows.push({ type: "end", group: stack.pop() as Group, label, line });
			} else if (keyword === "section") {
				const title = /^"([^"]*)"$/.exec(label)?.[1];
				if (!title?.trim()) error(line, "section needs a non-empty flow-quoted title and no trailing text");
				if (stack.length) error(line, "section cannot occur inside a group");
				if (diagnostics.length === before && title) rows.push({ type: "section", label: title, line });
			} else {
				const colon = label.indexOf(":");
				const head = colon < 0 ? label : label.slice(0, colon);
				// Literal splitting and trimming keep long malformed whitespace
				// linear, without competing whitespace repetitions in regexes.
				const ids = /^over(?:\s|$)/.test(head) ? head.slice(4).trim().split(",").map((id) => id.trim()) : undefined;
				const noteText = colon < 0 ? "" : label.slice(colon + 1).trim();
				if (!ids || ids.length < 1 || ids.length > 2 || ids.some((id) => !id || /\s/.test(id)) || new Set(ids).size !== ids.length || !noteText)
					error(line, "note needs over, one or two distinct participant ids, a colon and non-empty text");
				else for (const id of ids) if (!byId.has(id)) error(line, `unknown note participant \`${id}\``);
				if (diagnostics.length === before && ids) {
					const people = ids.map((id) => byId.get(id) as Participant);
					touch(people);
					rows.push({ type: "note", participants: people, label: noteText, line });
				}
			}
		} else {
			const colon = text.indexOf(":");
			if (colon < 0) error(line, "message needs a colon before its label");
			const head = colon < 0 ? text : text.slice(0, colon).trim();
			// Literal searches bound the work on malformed library input, even
			// when it contains thousands of arrows and no valid endpoints.
			const request = head.indexOf("-->");
			const response = head.indexOf("-.->");
			const at = request < 0 ? response : response < 0 ? request : Math.min(request, response);
			const arrow = at === response ? "-.->" : "-->";
			const fromId = at < 0 ? "" : head.slice(0, at).trim();
			const toId = at < 0 ? "" : head.slice(at + arrow.length).trim();
			if (head.includes("->>") || toId.includes("-->") || toId.includes("-.->") || !fromId || !toId || /\s/.test(fromId) || /\s/.test(toId))
				error(line, "malformed message arrow; use --> (request) or -.-> (response)");
			else {
				sawMessage = true;
				const from = byId.get(fromId);
				const to = byId.get(toId);
				for (const id of new Set([fromId, toId]))
					if (!byId.has(id)) error(line, `unknown message participant \`${id}\``);
				if (from && to && colon >= 0) {
					const message = { from, to, response: arrow === "-.->", label: text.slice(colon + 1).trim(), line };
					messages.push(message); rows.push({ type: "message", message }); touch([from, to]);
					const group = stack.at(-1);
					if (group && from === to) group.self = Math.max(group.self, participants.indexOf(from));
				}
			}
		}
		if (diagnostics.length > before) invalid.push({ line, text });
	}
	for (const group of [...stack].reverse()) {
		error(group.line, `unclosed ${group.kind} group; closing at EOF`);
		rows.push({ type: "end", group, label: "", line: group.line });
	}
	// Propagate touched lanes bottom-up without recursion or a syntax depth cap.
	for (const group of [...groups].reverse()) {
		if (group.last < 0) { group.first = 0; group.last = Math.max(0, participants.length - 1); }
		if (group.parent) {
			group.parent.first = Math.min(group.parent.first, group.first);
			group.parent.last = Math.max(group.parent.last, group.last);
			group.parent.self = Math.max(group.parent.self, group.self);
		}
	}

	const playable = scenarios.length > 0;
	const playback = sequencePlayback(scenarios, participants, rows, diagnostics);
	const part = (identity: string) => playable ? ` data-ab-part="${identity}"` : "";
	const mode = options.scheme === "light" ? "light" : options.scheme === "dark" ? "dark" : "auto";
	const laneWidth = (WIDTH - GUTTER) / Math.max(1, participants.length);
	const centres = new Map(participants.map((p, i) => [p, Math.round(GUTTER + laneWidth * (i + 0.5))]));
	const centre = (p: Participant) => centres.get(p) as number;
	const wrapped = (text: string, width: number, size: TextStyle["fontSize"] = 12, weight: TextStyle["fontWeight"] = 400) => wrap(text, width, typography, size, weight);
	const textLines = (lines: string[], x: number, y: number, classes: string, anchor = "") => lines.map((text, i) => `<text x="${x}" y="${y + i * LEADING}"${anchor ? ` text-anchor="${anchor}"` : ""} class="m ${classes}">${esc(text)}</text>`);
	const titles = participants.map((p) => wrapped(p.title, laneWidth - 16, 12, 600));
	const headerBottom = 30 + Math.max(1, ...titles.map((t) => t.length)) * LEADING;
	for (const group of groups) {
		const first = group.last < 0 ? 0 : group.first;
		const last = group.last < 0 ? Math.max(0, participants.length - 1) : group.last;
		const inset = Math.min(group.depth, 6) * Math.min(4, laneWidth / 48);
		group.left = Math.max(GUTTER + 2 + inset, GUTTER + first * laneWidth + 2 + inset);
		group.right = Math.min(RIGHT - inset, GUTTER + (last + 1) * laneWidth - 2 - inset);
		if (group.self >= 0) {
			const from = centre(participants[group.self]);
			group.right = Math.min(RIGHT, Math.max(group.right, from + Math.min(24, (RIGHT - from) / 2) + 4));
		}
		if (group.parent) {
			group.left = Math.max(group.left, group.parent.left);
			group.right = Math.min(group.right, group.parent.right);
		}
	}
	const body: string[] = [];
	const defs: string[] = [];
	const prefix = `${markerPrefix(options)}-seq`;
	for (const tone of [...new Set(messages.filter((m) => !m.response).map((m) => m.from.tone))].sort())
		defs.push(`<marker id="${prefix}-${tone}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 z" class="t-${tone}"/></marker>`);
	if (messages.some((m) => m.response)) defs.push(`<marker id="${prefix}-response" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10" class="e e-muted seq-response"/></marker>`);
	let y = headerBottom;
	let step = 0;
	const drawing: Group[] = [];
	for (const row of rows) {
		if (row.type === "end") { row.group.bottom = y; drawing.pop(); y += 6; continue; }
		if (row.type === "open" || row.type === "else") {
			const group = row.group;
			if (row.type === "open") { group.top = y; drawing.push(group); }
			else {
				body.push(`<line x1="${group.left + 8}" y1="${y}" x2="${group.right - 8}" y2="${y}" class="seq-divider"/>`);
				y += 8;
			}
			// Separate kind and label runs keep the weight/paint explicit. The
			// first label line follows the kind when it fits; continuations wrap.
			const kind = (row.type === "open" ? group.kind : "else").toUpperCase();
			const x = group.left + 10, width = group.right - x - 10;
			const kindLines = wrapped(kind, width, 11, 600);
			body.push(`<g data-line="${row.line}" data-annotation="${row.type}"${part(playback.rowParts.get(row) as string)}>`, ...textLines(kindLines, x, y + 14, "s11 b seq-kind"));
			const kindWidth = typography.width(kindLines.at(-1) as string, "mono", 11, 600) + 12;
			const label = row.label.toUpperCase();
			const inline = typography.width(label, "mono", 11) <= width - kindWidth;
			const labels = wrapped(label, width, 11);
			const labelY = y + 14 + (kindLines.length - (inline ? 1 : 0)) * LEADING;
			body.push(...textLines(labels, inline ? x + kindWidth : x, labelY, `s11 muted seq-${row.type === "open" ? "group" : "else"}-label`), "</g>");
			y = labelY + labels.length * LEADING + 2;
			continue;
		}
		if (row.type === "section") {
			const labels = wrapped(row.label.toUpperCase(), RIGHT - GUTTER - 16, 11);
			body.push(`<g data-line="${row.line}" data-annotation="section"${part(playback.rowParts.get(row) as string)}>`, ...textLines(labels, GUTTER + 8, y + 16, "s11 muted seq-section"));
			const end = GUTTER + 8 + typography.width(labels.at(-1) as string, "mono", 11) + 12;
			const ruleY = y + 12 + (labels.length - 1) * LEADING;
			// The heading is a part; its structural rule never fades.
			if (playable) body.push("</g>");
			if (end < RIGHT) body.push(`<line x1="${end}" y1="${ruleY}" x2="${RIGHT}" y2="${ruleY}" class="seq-rule"/>`);
			if (!playable) body.push("</g>");
			y += labels.length * LEADING + 12;
			continue;
		}
		if (row.type === "note") {
			const positions = row.participants.map(centre).sort((a, b) => a - b);
			const group = drawing.at(-1);
			const left = group ? group.left + 8 : GUTTER + 4, right = group ? group.right - 8 : RIGHT;
			// A single-lifeline note fits its text, up to 300px, so short notes stay small.
			const fit = Math.max(80, typography.width(row.label, "mono", 12) + 24);
			const width = Math.min(right - left, positions.length === 1 ? Math.min(300, fit) : positions[1] - positions[0]);
			const x = Math.max(left, Math.min(right - width, (positions[0] + positions[positions.length - 1]) / 2 - width / 2));
			const labels = wrapped(row.label, width - 24);
			const height = labels.length * LEADING + 12;
			body.push(`<g data-line="${row.line}" data-annotation="note"${part(playback.rowParts.get(row) as string)}>`, `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" class="seq-note"/>`,
				`<rect x="${x}" y="${y + 5}" width="3" height="${height - 10}" rx="1.5" class="t-rework"/>`,
				...textLines(labels, x + 12, y + 16, "s12 seq-note-text"), "</g>");
			y += height + 10; continue;
		}
		const message = row.message;
		const i = step++;
		const from = centre(message.from), to = centre(message.to);
		const self = from === to;
		const loop = Math.min(24, (RIGHT - from) / 2);
		const labelX = self ? from + loop + 8 : Math.min(from, to) + 8;
		const labels = wrapped(message.label, RIGHT - labelX);
		const numbers = wrapped(String(i + 1).padStart(2, "0"), GUTTER - 2, 11);
		const arrowY = y + labels.length * LEADING + 2;
		const tone = message.response ? "muted" : message.from.tone;
		const path = self
			? `M${from},${arrowY} H${from + loop - 5} Q${from + loop},${arrowY} ${from + loop},${arrowY + 5} V${arrowY + 17} Q${from + loop},${arrowY + 22} ${from + loop - 5},${arrowY + 22} H${to}`
			: `M${from},${arrowY} L${to},${arrowY}`;
		body.push(`<g data-line="${message.line}" data-step="${i + 1}"${part(playback.rowParts.get(row) as string)}>`);
		body.push(...textLines(labels, labelX, y + 12, "s12 seq-label"));
		body.push(...textLines(numbers, 0, arrowY + 4, "s11 muted seq-number"));
		body.push(`<path d="${path}" class="e e-${tone}${message.response ? " dash seq-response" : ""}" marker-end="url(#${prefix}-${message.response ? "response" : tone})"/>`);
		if (!message.response) body.push(`<circle cx="${from}" cy="${arrowY}" r="2.5" class="t-${tone}"/>`);
		body.push("</g>");
		y = arrowY + Math.max(self ? 22 : 0, (numbers.length - 1) * LEADING) + 12;
	}
	for (const item of invalid) {
		const lines = wrapped(`Line ${item.line}: ${item.text}`, RIGHT - GUTTER - 8);
		body.push(`<g data-line="${item.line}">`, ...textLines(lines, GUTTER + 8, y + 12, "s12 t-stop seq-rejected"), "</g>");
		y += lines.length * LEADING + 14;
	}
	const height = y + 12;
	const background: string[] = [];
	for (const i of participants.keys()) {
		if (i % 2 === 1) background.push(`<rect x="${GUTTER + i * laneWidth}" y="8" width="${laneWidth}" height="${height - 16}" rx="8" class="seq-lane" fill-opacity="0.15"/>`);
	}
	for (const group of groups) if (group.depth < 2) background.push(`<rect x="${group.left}" y="${group.top}" width="${group.right - group.left}" height="${group.bottom - group.top}" rx="8" class="seq-group" fill-opacity="0.5"/>`);
	for (const p of participants) background.push(`<line x1="${centre(p)}" y1="${headerBottom - 8}" x2="${centre(p)}" y2="${height - 8}" class="seq-life"/>`);
	for (const [i, p] of participants.entries()) {
		background.push(`<g data-line="${p.line}"${part(playback.headers.get(p) as string)}>`, `<circle cx="${centre(p)}" cy="20" r="3" class="t-${p.tone}"/>`, ...textLines(titles[i], centre(p), 40, `s12 b t-${p.tone} seq-title`, "middle"), "</g>");
	}
	const layout: Layout = { width: WIDTH, height, nodes: [], routes: [], bands: [], legend: null, diagnostics, typography };
	const description = `Sequence: ${participants.map((p) => p.title).join(", ")}. ${messages.map((m) => `${m.from.title} to ${m.to.title}: ${m.label}`).join(". ")}`;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="ab ab-${mode}"${playable ? ` data-ab-play="${markerPrefix(options)}"` : ""} viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" role="img" aria-label="${esc(options.title ?? description)}">\n${svgStyle(mode, typography, [STYLE, ...(playable ? [playStyle(mode, markerPrefix(options), "sequence")] : [])])}\n<defs>${defs.join("\n")}</defs>\n${[...background, ...body].join("\n")}\n</svg>\n`;
	return { svg, diagnostics, layout, timelines: playback.timelines };
}
