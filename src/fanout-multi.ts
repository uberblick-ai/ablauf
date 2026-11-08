import { wrap } from "./fanout-wrap.ts";
import { Typography, type TextStyle } from "./fonts.ts";
import type { Layout } from "./grid.ts";
import type { RenderOptions } from "./index.ts";
import { type Diagnostic, type Tone, TONES } from "./parse.ts";
import { esc, markerPrefix, svgStyle } from "./svg.ts";

interface Box {
	text: string;
	reason: string;
	destination: string;
	tone?: Tone;
	line: number;
	depth: number;
	parent?: Box;
	children: Box[];
	blocks: { text: string; size: TextStyle["fontSize"]; weight: TextStyle["fontWeight"]; classes: string }[][];
	x: number;
	y: number;
	offset: number;
	height: number;
	envelope: number;
}
interface Ref {
	parent: Box;
	id: string;
	line: number;
	raw: string;
	target?: Box;
}
const QUOTED = /^"(?:[^"\\]|\\.)*"/;
const ID = /^[a-z][a-z0-9-]{0,39}$/;
const WIDTH = 678;
const LEADING = 18;

function box(text: string, line: number, parent?: Box): Box {
	return { text, line, parent, depth: parent ? parent.depth + 1 : 0,
		reason: "", destination: "", children: [], blocks: [], x: 0, y: 0, offset: 0, height: 0, envelope: 0 };
}

export function renderFanoutV1(source: string, options: RenderOptions = {}) {
	const typography = new Typography(options.fonts);
	const diagnostics: Diagnostic[] = [];
	const invalid = new Map<number, string>();
	const error = (line: number, message: string) => diagnostics.push({ line, severity: "error", message });
	const reject = (line: number, raw: string, message: string) => {
		error(line, message);
		invalid.set(line, raw.trim());
	};
	const root = box("", 1);
	const boxes = [root];
	const stack = [root];
	const ids = new Map<string, Box>();
	const refs: Ref[] = [];
	let headerLine = 1;
	let sawHeader = false;
	let sawStep = false;
	let secondStep = false;
	let sawStyle = false;
	let rejectedLevel: number | undefined;

	for (const [i, raw] of source.split("\n").entries()) {
		const line = i + 1;
		const text = raw.trim();
		if (!text || text.startsWith("#")) continue;
		if (!sawHeader) {
			headerLine = line;
			root.line = line;
			sawHeader = true;
			continue;
		}
		const before = diagnostics.length;
		const indent = /^[ \t]*/.exec(raw)?.[0] ?? "";
		const spaces = indent.replaceAll("\t", "  ").length;
		if (indent.includes("\t")) error(line, "a tab in indentation counts as two spaces; use spaces");
		if (spaces % 2) error(line, "indentation must use pairs of spaces");
		let level = Math.floor(spaces / 2);
		let rest = text;
		let recovering = false;
		const quoted = (): string => {
			const match = QUOTED.exec(rest);
			if (!match) {
				error(line, "expected a double-quoted string");
				// Recover at the next field, including a missing outcome followed
				// immediately by reason=. Never turn bare text into display text.
				const next = /(?:^|\s)[a-z]+=/.exec(rest);
				rest = next ? rest.slice(next.index).trimStart() : "";
				recovering = true;
				return "";
			}
			recovering = false;
			rest = rest.slice(match[0].length);
			try { return JSON.parse(match[0]) as string; }
			catch {
				error(line, "invalid quoted string; use JSON string escapes");
				return "";
			}
		};
		if (/^style(?:\s|$)/.test(text)) {
			if (level) error(line, "style must be at indentation level 0");
			const value = text.slice(5).trim();
			if (sawStyle) error(line, "a fan-out names at most one style");
			else if (sawStep || boxes.length > 1) error(line, "declare the style before the step");
			else if (value === "ladder") error(line, "style ladder is not supported in v1; drawing branches");
			else if (value !== "branches") error(line, `unknown style \`${value}\`; use branches`);
			sawStyle = true;
		} else if (/^step(?:\s|$)/.test(text)) {
			if (level) error(line, "step must be at indentation level 0");
			if (sawStep) {
				secondStep = true;
				error(line, "a fan-out names exactly one step");
			} else {
				rest = text.slice(4).trimStart();
				root.text = quoted();
				root.line = line;
				sawStep = true;
				if (!root.text.trim()) error(line, "step needs non-empty text");
				if (boxes.length > 1) error(line, "declare the step before its outcomes");
				if (rest.trim()) error(line, "unexpected text after step");
			}
		} else if (/^outcome(?:\s|$)/.test(text)) {
			if (secondStep) {
				reject(line, text, "outcome after a second step is rejected");
				continue;
			}
			if (rejectedLevel !== undefined && level > rejectedLevel) {
				reject(line, text, "outcome is in a rejected depth subtree");
				continue;
			}
			rejectedLevel = undefined;
			if (level >= stack.length) {
				error(line, "indentation jumps beyond the accepted outcome stack; clamping to its depth");
				level = stack.length - 1;
			}
			const parent = stack[level];
			rest = text.slice(7).trimStart();
			if (/^ref(?:\s|=|$)/.test(rest)) {
				const match = /^ref=("(?:[^"\\]|\\.)*")\s*$/.exec(rest);
				let id = "";
				try { if (match) id = JSON.parse(match[1]) as string; } catch { /* rejected below */ }
				if (!ID.test(id)) error(line, "a ref needs only ref= followed by a valid quoted id");
				else refs.push({ parent, id, line, raw: text });
			} else {
				if (level >= 3) {
					rejectedLevel = level;
					reject(line, text, "branches supports at most three outcome levels");
					continue;
				}
				const entry = box(quoted(), line, parent);
				if (!entry.text.trim()) error(line, "outcome entry needs a non-empty outcome");
				let id = "";
				let hasRef = false;
				const seen = new Set<string>();
				while (rest.trim()) {
					// Require whitespace between fields, but permit a field at the
					// recovery cursor after an absent quoted value.
					const key = /^(?:\s+|(?=[a-z]+=))([a-z]+)=/.exec(rest);
					if (!key) {
						error(line, "expected reason=, destination=, tone= or id= followed by a quoted string");
						break;
					}
					if (!/^\s/.test(rest) && !recovering) error(line, "expected whitespace before field");
					rest = rest.slice(key[0].length);
					const value = quoted();
					const field = key[1];
					if (field === "ref") hasRef = true;
					if (seen.has(field)) error(line, `duplicate field \`${field}\``);
					else if (field === "reason" || field === "destination") {
						if (value.trim()) entry[field] = value;
						else error(line, `outcome entry needs a non-empty ${field} when supplied`);
					} else if (field === "tone") {
						if (TONES.includes(value as Tone)) entry.tone = value as Tone;
						else error(line, `unknown tone \`${value}\`; use one of ${TONES.join(", ")}`);
					} else if (field === "id") {
						if (ID.test(value)) id = value;
						else error(line, "id must match ^[a-z][a-z0-9-]{0,39}$");
					} else error(line, `unknown field \`${field}\``);
					seen.add(field);
				}
				if (hasRef) error(line, "a ref takes no outcome text or other fields");
				else {
					if (id) {
						const prior = ids.get(id);
						if (prior) error(line, `duplicate id \`${id}\` on lines ${prior.line} and ${line}; keeping line ${prior.line}`);
						else ids.set(id, entry);
					}
					parent.children.push(entry);
					boxes.push(entry);
					stack.length = level + 1;
					stack.push(entry);
				}
			}
		} else error(line, "expected `style`, `step` or `outcome`");
		if (diagnostics.length > before) invalid.set(line, text);
	}
	if (!sawStep) error(headerLine, "a fan-out needs one step");
	if (boxes.length === 1) error(headerLine, "a fan-out needs at least one outcome entry");
	const targets = new Map<Box, Set<Box>>();
	for (const ref of refs) {
		const target = ids.get(ref.id);
		const prior = targets.get(ref.parent) ?? new Set<Box>();
		if (!target) reject(ref.line, ref.raw, `unknown ref \`${ref.id}\``);
		else if (target.depth <= ref.parent.depth) reject(ref.line, ref.raw, "ref target must be deeper than its parent");
		else if (target.parent === ref.parent) reject(ref.line, ref.raw, "ref target is already a declared child of this parent");
		else if (prior.has(target)) reject(ref.line, ref.raw, "duplicate ref from the same parent");
		else {
			ref.target = target;
			prior.add(target);
			targets.set(ref.parent, prior);
		}
	}

	const levels = 1 + Math.max(...boxes.map(b => b.depth));
	const width = Math.min(190, Math.floor((646 - 36 * (levels - 1)) / levels));
	for (const entry of boxes) {
		entry.x = 16 + entry.depth * (width + 36);
		const block = (text: string, size: TextStyle["fontSize"], weight: TextStyle["fontWeight"], classes: string, bindPrefix = false) =>
			wrap(text, width - 24, typography, size, weight, bindPrefix).map(text => ({ text, size, weight, classes }));
		entry.blocks.push(block(entry.text.trim() ? entry.text : entry === root ? "[missing step]" : "[missing outcome]",
			entry === root ? 13 : 12, 600, entry === root ? "s13 b t-agent" : "s12 b"));
		if (entry.reason) entry.blocks.push(block(entry.reason, 12, 400, "s12 muted"));
		if (entry.destination) {
			entry.blocks.push(block(`→ ${entry.destination.trim()}`, 12, 600, "s12 b", true));
		}
		const runs = entry.blocks.flat();
		entry.height = 16 + LEADING * runs.length + (entry.destination ? 10 : 0);
		if (runs.some(run => typography.width(run.text, "mono", run.size, run.weight) > width - 24))
			error(entry.line, "text does not fit its box");
	}

	// Compute relative positions bottom up. A parent's centre uses its first
	// and last child's *box* centres, not their envelope centres.
	function envelope(entry: Box): number {
		const gap = entry === root ? 18 : 10;
		const span = entry.children.reduce((sum, child) => sum + envelope(child), 0) + gap * Math.max(0, entry.children.length - 1);
		entry.envelope = Math.max(entry.height, span);
		let offset = (entry.envelope - span) / 2;
		for (const child of entry.children) {
			child.offset = offset;
			offset += child.envelope + gap;
		}
		const first = entry.children[0];
		const last = entry.children.at(-1);
		const centre = first && last ? (first.offset + first.y + first.height / 2 + last.offset + last.y + last.height / 2) / 2 : entry.envelope / 2;
		entry.y = Math.max(0, Math.min(entry.envelope - entry.height, centre - entry.height / 2));
		return entry.envelope;
	}
	envelope(root);
	function position(entry: Box, top: number) {
		// Child positions are relative to this envelope's top, not this box.
		for (const child of entry.children) position(child, top + child.offset);
		entry.y = Math.round(top + entry.y);
	}
	position(root, 16);

	const body: string[] = [];
	const marker = `${markerPrefix(options)}-ink`;
	interface Run { from: number; to: number; y: number }
	const runs: Run[] = [];
	const edge = (parent: Box, target: Box, y: number, line: number, isRef: boolean) => {
		const from = parent.x + width;
		const startY = Math.round(parent.y + parent.height / 2);
		const end = target.x - 16;
		const skip = target.depth > parent.depth + 1;
		const curveEnd = skip ? from + 20 : end;
		const bend = Math.round((from + curveEnd) / 2);
		if (isRef) {
			if (target.y + target.height - y < 6) error(line, "ref slot is closer than 6 px to the box bottom");
			if (boxes.some(b => b !== parent && b !== target && Math.hypot(
				Math.max(b.x - (target.x - 2), curveEnd - (b.x + width), 0),
				Math.max(b.y - y, y - (b.y + b.height), 0)) <= 4))
				error(line, "straight run passes within 4 px of an unrelated box");
			if (runs.some(run => run.y === y && Math.max(run.from, curveEnd) < Math.min(run.to, target.x - 2)))
				error(line, "straight runs overlap at the same height");
		}
		runs.push({ from: curveEnd, to: target.x - 2, y });
		body.push(`<g data-line="${line}"><path d="M${from},${startY} C${bend},${startY} ${bend},${y} ${curveEnd},${y} L${target.x - 2},${y}" class="e e-ink" marker-end="url(#${marker})"/></g>`);
	};
	for (const entry of boxes.slice(1)) edge(entry.parent as Box, entry, Math.round(entry.y + entry.height / 2), entry.line, false);
	const slots = new Map<Box, number>();
	for (const ref of refs) if (ref.target) {
		const k = (slots.get(ref.target) ?? 0) + 1;
		slots.set(ref.target, k);
		edge(ref.parent, ref.target, Math.round(ref.target.y + ref.target.height / 2 + 8 * k), ref.line, true);
	}
	for (const entry of boxes) {
		const tone = entry === root ? "k-agent" : entry.tone ? `k-${entry.tone}${entry.tone === "stop" ? " panel" : ""}` : "pill";
		body.push(`<g data-line="${entry.line}">`, `<rect x="${entry.x}" y="${entry.y}" width="${width}" height="${entry.height}" rx="8" class="${tone}"/>`);
		let y = entry.y + 22;
		for (const [index, block] of entry.blocks.entries()) {
			if (entry.destination && index === entry.blocks.length - 1) {
				body.push(`<line x1="${entry.x + 12}" y1="${y - 9}" x2="${entry.x + width - 12}" y2="${y - 9}" class="e e-ink" stroke-dasharray="2 4"/>`);
				y += 10;
			}
			for (const run of block) {
				body.push(`<text x="${entry.x + 12}" y="${y}" class="m ${run.classes}">${esc(run.text)}</text>`);
				y += LEADING;
			}
		}
		body.push("</g>");
	}
	let bottom = root.envelope + 16;
	for (const [line, text] of [...invalid].sort((a, b) => a[0] - b[0])) {
		const lines = wrap(`Line ${line}: ${text}`, 614, typography);
		for (const [i, text] of lines.entries()) body.push(`<text x="32" y="${bottom + 20 + i * LEADING}" class="m s12 t-stop">${esc(text)}</text>`);
		bottom += 32 + lines.length * LEADING;
	}
	const layout: Layout = { width: WIDTH, height: bottom + 16, nodes: [], routes: [], bands: [], legend: null, diagnostics, typography };
	const label = (entry: Box) => `${entry.text}${entry.parent && boxes.some(b => b !== entry && b.text === entry.text) ? ` [${entry.parent.text}]` : ""}`;
	const detail = (entry: Box) => `${label(entry)}${entry.reason || entry.destination ? ` (${[entry.reason, entry.destination].filter(Boolean).join("; ")})` : ""}`;
	const list = (items: string[]) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
	const sentences = [`Fan-out: ${root.text}.`];
	for (const parent of boxes) {
		if (parent.children.length) sentences.push(`${label(parent)} leads to ${list(parent.children.map(detail))}.`);
		for (const ref of refs) if (ref.parent === parent && ref.target) sentences.push(`${label(parent)} also leads to ${detail(ref.target)}.`);
	}
	const description = sentences.join(" ");
	const descId = `${markerPrefix(options)}-desc`;
	const described = options.title !== undefined ? ` aria-describedby="${descId}"` : "";
	const desc = options.title !== undefined ? `<desc id="${descId}">${esc(description)}</desc>\n` : "";
	const mode = options.scheme === "light" || options.scheme === "dark" ? options.scheme : "auto";
	const defs = boxes.length > 1 ? `<defs><marker id="${marker}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 z" class="t-ink"/></marker></defs>\n` : "";
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="ab ab-${mode}" viewBox="0 0 ${WIDTH} ${layout.height}" width="${WIDTH}" height="${layout.height}" role="img" aria-label="${esc(options.title ?? description)}"${described}>\n${desc}${svgStyle(mode, typography)}\n${defs}${body.join("\n")}\n</svg>\n`;
	return { svg, diagnostics, layout };
}
