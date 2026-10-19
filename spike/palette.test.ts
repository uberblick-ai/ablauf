import assert from "node:assert/strict";
import { test } from "node:test";
import { DARK, LIGHT, render } from "./flow/index.ts";

// Inspect every declaration block containing custom properties, including any
// accidentally added unscoped rule, rather than only finding the expected rule.
function paletteRules(css: string) {
	return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
		.filter(([, , body]) => /(^|;)\s*--/.test(body))
		.map(([, selector, body]) => ({
			selector: selector.trim(),
			declarations: body.split(";").map((s) => s.trim()).filter(Boolean).sort(),
		}));
}

for (const mode of ["light", "dark", "auto"] as const) {
	test(`${mode} SVG scopes every palette declaration to its root mode`, () => {
		const { svg, diagnostics } = render("flow v0\nbox agent tone=agent\n", {
			...(mode === "auto" ? {} : { scheme: mode }),
		});
		assert.deepEqual(diagnostics, []);
		assert.match(svg.split("\n")[0], new RegExp(` class="ab ab-${mode}"`));
		const style = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1];
		assert.ok(style);
		assert.doesNotMatch(style, /\.ab\s*\{\s*--/);

		const expected = (palette: typeof LIGHT) => [{
			selector: `.ab.ab-${mode}`,
			declarations: Object.entries(palette)
				.map(([key, value]) => `--${key}:var(--ab-${key},${value})`).sort(),
		}];
		if (mode === "auto") {
			const media = /@media\s*\(prefers-color-scheme:dark\)\s*\{([^{}]*\{[^{}]*\}[^{}]*)\}/g;
			const darkBlocks = [...style.matchAll(media)];
			assert.equal(darkBlocks.length, 1);
			assert.deepEqual(paletteRules(darkBlocks[0][1]), expected(DARK));
			const outsideMedia = style.replace(media, "");
			assert.doesNotMatch(outsideMedia, /@media/);
			assert.deepEqual(paletteRules(outsideMedia), expected(LIGHT));
			assert.equal(paletteRules(style).length, 2);
		} else {
			assert.doesNotMatch(style, /@media/);
			assert.deepEqual(paletteRules(style), expected(mode === "dark" ? DARK : LIGHT));
		}
	});
}
