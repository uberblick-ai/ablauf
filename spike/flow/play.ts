// Shared play grammar. Diagram strings keep their existing parsers.
import type { Diagnostic } from "./parse.ts";

export interface PlayStep {
	target: string;
	actor?: string;
	caption: string;
	ms: number;
	line: number;
}

export interface Scenario {
	name: string;
	line: number;
	steps: PlayStep[];
}

export interface TimelineStep {
	target: string;
	kind: string;
	actor: string;
	caption: string;
	ms: number;
	parts: string[];
}

export interface Timeline {
	name: string;
	slug: string;
	steps: TimelineStep[];
}

// Read exactly one JSON string, leaving the unconsumed input for the grammar.
function stringAt(text: string): [string, string] {
	const match = /^"(?:[^"\\]|\\.)*"/.exec(text);
	if (!match) throw new Error("expected a JSON string");
	return [JSON.parse(match[0]) as string, text.slice(match[0].length)];
}

export function splitPlay(source: string) {
	const diagnostics: Diagnostic[] = [];
	const scenarios: Scenario[] = [];
	const lines = source.split("\n");
	// A node or participant named `play` can still be the source of an edge.
	const isHeader = (text: string) => /^play(?:\s|$)/.test(text) && !/^play\s+(?:-->|-\.->)\s/.test(text);
	const start = lines.findIndex(line => isHeader(line.trim()));
	if (start < 0) return { source, scenarios, diagnostics };
	const error = (line: number, message: string) => diagnostics.push({ line, severity: "error", message } as Diagnostic);
	let current: Scenario | undefined;
	let tempo = 1600;
	let sawTempo = false;
	let sawStep = false;
	const duration = (text: string, line: number) => {
		const match = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(text);
		const ms = match ? Number(match[1]) * (match[2] === "s" ? 1000 : 1) : NaN;
		if (Number.isFinite(ms) && ms >= 100 && ms <= 60000) return ms;
		error(line, `invalid playback duration \`${text}\`; using tempo ${tempo}ms`);
		return tempo;
	};
	for (let i = start; i < lines.length; i++) {
		const text = lines[i].trim();
		const line = i + 1;
		if (!text || text.startsWith("#")) continue;
		if (isHeader(text)) {
			current = { name: `Scenario ${scenarios.length + 1}`, line, steps: [] };
			scenarios.push(current);
			tempo = 1600;
			sawTempo = false;
			sawStep = false;
			try {
				const rest = text.slice(4).trim();
				if (rest) {
					const [name, tail] = stringAt(rest);
					if (tail.trim()) throw new Error("unexpected text after scenario name");
					current.name = name;
				}
			} catch {
				error(line, "unreadable play section; expected play or play \"Name\"");
			}
			continue;
		}
		if (/^tempo(?:\s|$)/.test(text)) {
			if (sawTempo || sawStep) error(line, "tempo must occur once, before steps");
			else tempo = duration(text.slice(5).trim(), line);
			sawTempo = true;
			continue;
		}
		try {
			if (!current) throw new Error("expected play section");
			if (!/^step\s/.test(text)) throw new Error("expected step");
			sawStep = true;
			let rest = text.slice(4).trim();
			let target: string;
			if (rest.startsWith('"')) [target, rest] = stringAt(rest);
			else {
				const match = /^(\S+)/.exec(rest);
				if (!match) throw new Error("expected target");
				target = match[1];
				rest = rest.slice(target.length);
			}
			let ms = tempo;
			let actor: string | undefined;
			let caption = "";
			if (rest && !/^\s/.test(rest)) throw new Error("expected space after target");
			rest = rest.trim();
			if (rest && !rest.startsWith('"') && !rest.startsWith("actor=")) {
				const token = rest.split(/\s/, 1)[0];
				ms = duration(token, line);
				rest = rest.slice(token.length).trim();
			}
			if (rest.startsWith("actor=")) {
				[actor, rest] = stringAt(rest.slice(6));
				if (rest && !/^\s/.test(rest)) throw new Error("expected space after actor");
				rest = rest.trim();
			}
			if (rest) [caption, rest] = stringAt(rest);
			if (rest.trim()) throw new Error("unexpected text after caption");
			current.steps.push({ target, actor, caption, ms, line });
		} catch {
			error(line, "unreadable play line; expected step TARGET [DURATION] [actor=\"...\"] [\"caption\"]");
		}
	}
	return { source: lines.slice(0, start).join("\n"), scenarios, diagnostics };
}
