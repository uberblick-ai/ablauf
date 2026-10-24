import { renderFanout } from "./fanout.ts";
import type { FontsOptions } from "./fonts.ts";
import { grid } from "./grid.ts";
import { parse } from "./parse.ts";
import { fanoutTimeline, flowTimeline, splitPlay, type TimelineStep } from "./play.ts";
import { type SvgOptions, toSvg } from "./svg.ts";

import type { Diagnostic } from "./parse.ts";

export type { Diagnostic } from "./parse.ts";
export type { FontOptions, FontsOptions, TextStyle } from "./fonts.ts";
export { DARK, LIGHT } from "./svg.ts";
export type { TimelineStep } from "./play.ts";
export { createPlayer, type Player, type PlayerOptions } from "./player.ts";

export interface RenderOptions extends SvgOptions {
	fonts?: FontsOptions;
}

const byLine = (list: Diagnostic[]) => list.sort((a, b) => a.line - b.line);

export function render(source: string, options: RenderOptions = {}) {
	// A play section only adds part markers; the diagram draws the same.
	const { diagram, section, diagnostics: playDiagnostics } = splitPlay(source);
	const drawOptions = section ? { ...options, targets: true } : options;
	const first = diagram.split("\n").find((line) => line.trim() && !line.trim().startsWith("#"));
	let timeline: TimelineStep[] = [];
	if (/^fan-out(?:\s|$)/.test(first?.trim() ?? "")) {
		const { outcomes, ...result } = renderFanout(diagram, drawOptions);
		if (section) timeline = fanoutTimeline(section, outcomes, playDiagnostics);
		return { ...result, diagnostics: [...result.diagnostics, ...byLine(playDiagnostics)], timeline };
	}
	const { model, diagnostics } = parse(diagram);
	const layout = grid(model, diagnostics, options.fonts);
	if (section)
		timeline = flowTimeline(
			section,
			layout.nodes.map((p) => p.node.id),
			layout.routes.map((r) => [r.edge.from, r.edge.to]),
			playDiagnostics,
		);
	return {
		svg: toSvg(layout, drawOptions),
		diagnostics: [...layout.diagnostics, ...byLine(playDiagnostics)],
		layout,
		timeline,
	};
}
