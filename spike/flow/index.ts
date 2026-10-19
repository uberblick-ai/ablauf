import type { FontsOptions } from "./fonts.ts";
import { grid } from "./grid.ts";
import { parse } from "./parse.ts";
import { type SvgOptions, toSvg } from "./svg.ts";

export type { Diagnostic } from "./parse.ts";
export type { FontOptions, FontsOptions, TextStyle } from "./fonts.ts";
export { DARK, LIGHT } from "./svg.ts";

export interface RenderOptions extends SvgOptions {
	fonts?: FontsOptions;
}

export function render(source: string, options: RenderOptions = {}) {
	const { model, diagnostics } = parse(source);
	const layout = grid(model, diagnostics, options.fonts);
	return {
		svg: toSvg(layout, options),
		diagnostics: layout.diagnostics,
		layout,
	};
}
