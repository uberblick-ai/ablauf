// Line grammar for the narrow flow. Never throws: problems become diagnostics.

export type Tone = "ink" | "muted" | "agent" | "done" | "rework" | "stop";
export type Kind = "text" | "pill" | "box" | "end" | "panel";
export type SideName = "top" | "right" | "bottom" | "left";
export type LabelAt = "start" | "end";
export type ChildKind = "pill" | "text" | "muted" | "strong" | "rule";

export interface Diagnostic {
	line: number;
	severity: "error" | "warning";
	message: string;
}

export interface Child {
	kind: ChildKind;
	text: string;
}

export interface FlowNode {
	id: string;
	kind: Kind;
	label: string;
	sub: string;
	tone: Tone;
	col: string;
	row: string; // id of the node whose row this one joins; empty starts a new row
	span: number;
	section: number;
	children: Child[];
	line: number;
}

export interface FlowEdge {
	from: string;
	to: string;
	label: string;
	dashed: boolean;
	tone: Tone;
	from_side: SideName | null;
	from_slot: number;
	to_side: SideName | null;
	to_slot: number;
	label_at: LabelAt;
	line: number;
}

export interface Model {
	nodes: FlowNode[];
	edges: FlowEdge[];
	sections: string[];
	columns: string[];
}

const KINDS: Kind[] = ["text", "pill", "box", "end", "panel"];
const TONES: Tone[] = ["ink", "muted", "agent", "done", "rework", "stop"];
const CHILD_KINDS: ChildKind[] = ["pill", "text", "muted", "strong", "rule"];
const DEFAULT_TONE: Record<Kind, Tone> = {
	text: "muted",
	pill: "muted",
	box: "agent",
	end: "done",
	panel: "stop",
};
const EDGE =
	/^(\S+)\s+(-->|-\.->)\s+(\S+)((?:\s+[a-z]+=\S+)*)\s*(?::\s*(.+))?$/;

// Splits on spaces, keeping "quoted strings" and key="quoted values" whole.
function tokens(text: string): string[] {
	const out: string[] = [];
	const re = /(\S+?="[^"]*"|"[^"]*"|\S+)/g;
	for (const m of text.matchAll(re)) out.push(m[1]);
	return out;
}

const unquote = (s: string) =>
	s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;

export function parse(source: string): {
	model: Model;
	diagnostics: Diagnostic[];
} {
	const diagnostics: Diagnostic[] = [];
	const model: Model = { nodes: [], edges: [], sections: [], columns: [] };
	const byId = new Map<string, FlowNode>();
	let sawHeader = false;
	let section = -1;
	let lastPanel: FlowNode | null = null;
	const warn = (line: number, message: string) =>
		diagnostics.push({ line, severity: "warning", message });
	const error = (line: number, message: string) =>
		diagnostics.push({ line, severity: "error", message });

	for (const [i, raw] of source.split("\n").entries()) {
		const line = i + 1;
		if (!raw.trim() || raw.trim().startsWith("#")) continue;
		const indented = raw.startsWith("  ");
		const text = raw.trim();

		if (!sawHeader) {
			sawHeader = true;
			const header = /^flow\s+v(\d+)$/.exec(text);
			if (header) {
				if (header[1] !== "0")
					warn(
						line,
						`flow v${header[1]} is newer than this renderer; drawing it as v0`,
					);
				continue;
			}
			warn(line, "first line should be `flow v0`; assuming v0");
		}

		if (indented) {
			if (!lastPanel) {
				error(line, "indented line outside a panel");
				continue;
			}
			const [kind, ...rest] = tokens(text);
			if (!CHILD_KINDS.includes(kind as ChildKind)) {
				error(line, `unknown panel line \`${kind}\``);
				continue;
			}
			// A quoted text wins over a bare word, so `pill id "text"` reads like a node line.
			const quoted = rest.find((t) => t.startsWith('"'));
			lastPanel.children.push({
				kind: kind as ChildKind,
				text: unquote(quoted ?? rest.join(" ")),
			});
			continue;
		}
		lastPanel = null;

		const edge = EDGE.exec(text);
		if (edge) {
			const e: FlowEdge = {
				from: edge[1],
				to: edge[3],
				dashed: edge[2] === "-.->",
				label: edge[5]?.trim() ?? "",
				tone: "ink",
				from_side: null,
				from_slot: 0,
				to_side: null,
				to_slot: 0,
				label_at: "start",
				line,
			};
			for (const t of tokens(edge[4] ?? "")) {
				const [key, value] = t.split("=");
				if (key === "tone") {
					if (TONES.includes(value as Tone)) e.tone = value as Tone;
					else warn(line, `unknown tone \`${value}\``);
				} else if (key === "from" || key === "to") {
					const m = /^(top|right|bottom|left)(?:\.(\d+))?$/.exec(value);
					if (!m) {
						warn(
							line,
							`${key}= takes top, right, bottom or left, optionally with a slot like bottom.2`,
						);
						continue;
					}
					if (key === "from")
						[e.from_side, e.from_slot] = [m[1] as SideName, Number(m[2] ?? 0)];
					else [e.to_side, e.to_slot] = [m[1] as SideName, Number(m[2] ?? 0)];
				} else if (key === "label") {
					if (value === "start" || value === "end") e.label_at = value;
					else warn(line, "label= takes start or end");
				} else warn(line, `unknown edge key \`${key}\``);
			}
			model.edges.push(e);
			continue;
		}

		const parts = tokens(text);
		if (parts[0] === "section") {
			model.sections.push(unquote(parts.slice(1).join(" ")));
			section = model.sections.length - 1;
			continue;
		}
		if (parts[0] === "columns") {
			if (model.columns.length) {
				error(line, "columns are declared once");
				continue;
			}
			model.columns = parts.slice(1);
			continue;
		}
		const [kind, id, ...rest] = parts;
		if (!KINDS.includes(kind as Kind)) {
			error(line, `unknown line \`${kind}\``);
			continue;
		}
		if (!id) {
			error(line, `\`${kind}\` needs an id`);
			continue;
		}
		if (byId.has(id)) {
			error(
				line,
				`duplicate id \`${id}\` (first on line ${byId.get(id)?.line})`,
			);
			continue;
		}
		if (!model.columns.length) model.columns = ["main"];

		const previous = model.nodes.at(-1);
		const node: FlowNode = {
			id,
			kind: kind as Kind,
			label: kind === "box" || kind === "pill" || kind === "panel" ? id : "",
			sub: "",
			tone: DEFAULT_TONE[kind as Kind],
			col: previous?.col ?? "",
			row: "",
			span: 1,
			section: Math.max(section, 0),
			children: [],
			line,
		};
		const words: string[] = [];
		for (const t of rest) {
			const kv = /^([a-z]+)=(.+)$/.exec(t);
			if (!kv) {
				words.push(unquote(t));
				continue;
			}
			const key = kv[1];
			const value = unquote(kv[2]);
			if (key === "tone") {
				if (TONES.includes(value as Tone)) node.tone = value as Tone;
				else warn(line, `unknown tone \`${value}\`; using ${node.tone}`);
			} else if (key === "col") {
				if (model.columns.includes(value)) node.col = value;
				else
					error(
						line,
						`unknown column \`${value}\`; columns are ${model.columns.join(", ")}`,
					);
			} else if (key === "row") node.row = value;
			else if (key === "span") {
				const n = Number(value);
				if (Number.isInteger(n) && n >= 1) node.span = n;
				else warn(line, "span= takes a whole number of rows");
			} else if (key === "title") node.label = value;
			else warn(line, `unknown key \`${key}\``);
		}
		if (!node.col) {
			node.col = model.columns[0];
			if (model.columns.length > 1)
				warn(line, `the first node needs col=; using ${node.col}`);
		}
		const quoted = words.join(" ");
		if (kind === "box") node.sub = quoted;
		else if (kind === "text" || kind === "end") node.label = quoted || id;
		else if (quoted) node.label = quoted;

		model.nodes.push(node);
		byId.set(id, node);
		if (kind === "panel") lastPanel = node;
	}

	for (const n of model.nodes) {
		if (!n.row) continue;
		const other = byId.get(n.row);
		if (!other || other === n) {
			error(n.line, `row=${n.row} must name another node; starting a new row`);
			n.row = "";
		} else if (other.row) {
			n.row = other.row; // join the row's owner, not a node that joined it
		}
	}
	model.edges = model.edges.filter((e) => {
		for (const end of [e.from, e.to]) {
			if (!byId.has(end)) {
				error(e.line, `unknown node \`${end}\`; edge dropped`);
				return false;
			}
		}
		if (e.from === e.to) {
			warn(e.line, `self-loops are not drawn in v0 (${e.from})`);
			return false;
		}
		return true;
	});
	return { model, diagnostics };
}
