import { renderFanout } from "./fanout.ts";
import { grid } from "./grid.ts";
import { parse } from "./parse.ts";
import { type SvgOptions, toSvg } from "./svg.ts";

export type { Diagnostic } from "./parse.ts";
export { DARK, LIGHT } from "./svg.ts";

export function render(source: string, options: SvgOptions = {}) {
	const first = source.split("\n").find((line) => line.trim() && !line.trim().startsWith("#"));
	if (/^fan-out(?:\s|$)/.test(first?.trim() ?? "")) return renderFanout(source, options);
	const { model, diagnostics } = parse(source);
	const layout = grid(model, diagnostics);
	return {
		svg: toSvg(layout, options),
		diagnostics: layout.diagnostics,
		layout,
	};
}
