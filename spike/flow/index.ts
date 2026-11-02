import { renderFanout } from "./fanout.ts";
import type { FontsOptions } from "./fonts.ts";
import { grid } from "./grid.ts";
import { parse } from "./parse.ts";
import { splitPlay, type Timeline } from "./play.ts";
import { resolveFlow } from "./play-flow.ts";
import { renderSequence } from "./sequence.ts";
import { type SvgOptions, toSvg } from "./svg.ts";

export type { Diagnostic } from "./parse.ts";
export type { Timeline, TimelineStep } from "./play.ts";
export type { FontOptions, FontsOptions, TextStyle } from "./fonts.ts";
export { DARK, LIGHT } from "./svg.ts";
export { TOKENS, checkPalette, type Token, type Palette } from "./paint.ts";

export interface RenderOptions extends SvgOptions {
	fonts?: FontsOptions;
}

export function render(source: string, options: RenderOptions = {}) {
	const play = splitPlay(source);
	source = play.source;
	const first = source.split("\n").find((line) => line.trim() && !line.trim().startsWith("#"));
	const kind = /^(fan-out|sequence)(?:\s|$)/.exec(first?.trim() ?? "")?.[1];
	if (kind === "sequence") {
		const result = renderSequence(source, options, play.scenarios);
		result.diagnostics.push(...play.diagnostics);
		return result;
	}
	if (kind === "fan-out") {
		const result = renderFanout(source, options);
		result.diagnostics.push(...play.diagnostics, ...play.scenarios.map(s => ({ line: s.line, severity: "error" as const, message: `${kind} playback is not supported yet` })));
		return { ...result, timelines: [] as Timeline[] };
	}
	const { model, diagnostics } = parse(source);
	const layout = grid(model, diagnostics, options.fonts);
	layout.diagnostics.push(...play.diagnostics);
	const timelines = resolveFlow(play.scenarios, layout);
	return {
		svg: toSvg(layout, options, play.scenarios.length > 0),
		diagnostics: layout.diagnostics,
		layout,
		timelines,
	};
}
