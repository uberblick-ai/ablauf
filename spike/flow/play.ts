// Playback: a `play` section after a diagram names its parts in the order a
// run reached them. The section never changes the drawing; it resolves to a
// timeline of parts (see svg.ts) that a player lights one step at a time.
//
//   play
//     tempo 1.6s
//     step reviewer 2.4s "changes requested"

import type { Diagnostic } from "./parse.ts";
import { edgePart, nodePart, outcomeIndexPart, STEP_PART } from "./svg.ts";

export interface TimelineStep {
	/** The `data-ab-part` values this step lights. */
	parts: string[];
	ms: number;
	caption: string;
	line: number;
}

interface PlayStep {
	target: string;
	ms: number | null;
	caption: string;
	line: number;
}

export interface PlaySection {
	tempo: number;
	steps: PlayStep[];
	line: number;
}

const DEFAULT_TEMPO = 1500;
const SECONDS = /^(\d+(?:\.\d+)?)s$/;
const QUOTED = /"((?:[^"\\]|\\.)*)"/y;
const unquote = (s: string) => s.replace(/\\(.)/g, "$1");

// Splits a source at its unindented `play` line. The diagram keeps its own
// line numbers, and the section reports diagnostics on the source's lines.
export function splitPlay(source: string): { diagram: string; section: PlaySection | null; diagnostics: Diagnostic[] } {
	const lines = source.split("\n");
	const at = lines.findIndex((l) => /^play\s*$/.test(l));
	if (at < 0) return { diagram: source, section: null, diagnostics: [] };
	const diagnostics: Diagnostic[] = [];
	const section: PlaySection = { tempo: DEFAULT_TEMPO, steps: [], line: at + 1 };
	for (let i = at + 1; i < lines.length; i++) {
		const line = i + 1;
		const text = lines[i].trim();
		if (!text || text.startsWith("#")) continue;
		const tempo = /^tempo\s+(\S+)$/.exec(text);
		if (tempo) {
			const s = SECONDS.exec(tempo[1]);
			if (s) section.tempo = Number(s[1]) * 1000;
			else diagnostics.push({ line, severity: "error", message: "tempo takes seconds, like `tempo 1.5s`" });
			continue;
		}
		const step = parseStep(text, line);
		if (typeof step === "string") diagnostics.push({ line, severity: "error", message: step });
		else section.steps.push(step);
	}
	if (!section.steps.length)
		diagnostics.push({ line: at + 1, severity: "warning", message: "a play section needs at least one step" });
	return { diagram: lines.slice(0, at).join("\n"), section, diagnostics };
}

// `step TARGET [TIME] ["caption"]`, where TARGET is an id or a quoted text.
function parseStep(text: string, line: number): PlayStep | string {
	const head = /^step\s+/.exec(text);
	if (!head) return `cannot read \`${text}\` in a play section; expected \`step\` or \`tempo\``;
	let rest = text.slice(head[0].length);
	let target: string;
	QUOTED.lastIndex = 0;
	const quoted = QUOTED.exec(rest);
	if (quoted) {
		target = unquote(quoted[1]);
		rest = rest.slice(quoted[0].length).trim();
	} else {
		const id = /^[A-Za-z0-9_-]+/.exec(rest);
		if (!id) return "a step needs a target: a node id, or an outcome's text in quotes";
		target = id[0];
		rest = rest.slice(id[0].length).trim();
	}
	let ms: number | null = null;
	const time = /^(\S+s)(?:\s+|$)/.exec(rest);
	if (time && SECONDS.test(time[1])) {
		ms = Number(SECONDS.exec(time[1])?.[1]) * 1000;
		rest = rest.slice(time[0].length);
	}
	let caption = "";
	if (rest) {
		QUOTED.lastIndex = 0;
		const c = QUOTED.exec(rest);
		if (!c || c[0].length !== rest.length) return `cannot read \`${rest}\` after the step's target; expected a time like \`2s\` and a caption in quotes`;
		caption = unquote(c[1]);
	}
	return { target, ms, caption, line };
}

const timed = (section: PlaySection, s: PlayStep, parts: string[]): TimelineStep => ({
	parts,
	ms: s.ms ?? section.tempo,
	caption: s.caption,
	line: s.line,
});

// A flow step lights its node and every edge from the previous step's node.
export function flowTimeline(section: PlaySection, nodes: string[], edges: [string, string][], diagnostics: Diagnostic[]): TimelineStep[] {
	const known = new Set(nodes);
	const out: TimelineStep[] = [];
	let previous: PlayStep | null = null;
	for (const s of section.steps) {
		if (!known.has(s.target)) {
			diagnostics.push({ line: s.line, severity: "error", message: `no node \`${s.target}\` to play` });
			continue;
		}
		const parts = [nodePart(s.target)];
		if (previous) {
			const from = previous.target;
			if (edges.some(([a, b]) => a === from && b === s.target)) parts.push(edgePart(from, s.target));
			else diagnostics.push({ line: s.line, severity: "warning", message: `no edge ${from} --> ${s.target}; nothing lights between them` });
		}
		out.push(timed(section, s, parts));
		previous = s;
	}
	return out;
}

// A fan-out step names an outcome by its text and lights the step with it.
export function fanoutTimeline(section: PlaySection, outcomes: string[], diagnostics: Diagnostic[]): TimelineStep[] {
	const out: TimelineStep[] = [];
	for (const s of section.steps) {
		const matches = outcomes.flatMap((o, i) => (o === s.target ? [i + 1] : []));
		if (matches.length !== 1) {
			diagnostics.push({
				line: s.line,
				severity: "error",
				message: matches.length ? `${matches.length} outcomes read "${s.target}"; rename one to play it` : `no outcome "${s.target}" to play`,
			});
			continue;
		}
		out.push(timed(section, s, [STEP_PART, outcomeIndexPart(matches[0])]));
	}
	return out;
}
