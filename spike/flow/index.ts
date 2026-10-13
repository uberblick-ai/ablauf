import { grid } from "./grid.ts";
import { parse } from "./parse.ts";
import { type SvgOptions, toSvg } from "./svg.ts";

export type { Diagnostic } from "./parse.ts";

export function render(source: string, options: SvgOptions = {}) {
	const { model, diagnostics } = parse(source);
	const layout = grid(model, diagnostics);
	return {
		svg: toSvg(layout, options),
		diagnostics: layout.diagnostics,
		layout,
	};
}
