import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { checkPalette, DARK, LIGHT, type Palette, type PlaybackContrast, render, type Token } from "../src/index.ts";
import { TONES } from "../src/parse.ts";
import { mountPlayback } from "../src/playback.ts";
import { inspect } from "./inspect-paints.ts";
import { Doc, El } from "./test-dom.ts";

const key = (p: { ink: string; inkOpacity?: number; ground: string[]; opacity?: number; groundOpacities?: number[] }) =>
	`${p.ink}/${p.inkOpacity ?? 1}/${p.ground.join("+")}/${(p.groundOpacities ?? p.ground.map((_, i) => i === p.ground.length - 1 ? p.opacity ?? 1 : 1)).join(",")}`;
const defaults = [[LIGHT, "#0a7a60"], [DARK, "#6ff0cf"]] as const;

test("one-argument results preserve exact pre-96 JSON, including all ratios and validation", () => {
	// Full result hashes captured from paint.ts at 3751cb9, before this change.
	for (const [palette, hash] of [[LIGHT, "cebad26b9d1ba1698004cdf09ab98e897e4c35ce9737aced6c2dcad4e71c9967"], [DARK, "20addf6d439c5b93a47b2db8d4a061139c5900c9ecac051ce4d1145e605552bd"]] as const) {
		const before = checkPalette(palette);
		assert.equal(createHash("sha256").update(JSON.stringify(before)).digest("hex"), hash);
		const after = checkPalette(palette, { play: "#000", unreachedOpacity: 0.3 });
		assert.deepEqual(after.pairs.slice(0, before.pairs.length), before.pairs.map(p => ({ ...p, threshold: 4.5 })));
		assert.throws(() => checkPalette({ ...palette, line: "invalid" }, { play: "#000", unreachedOpacity: 0.3 }), TypeError);
	}
	// Compile-time compatibility: static ink remains Token, playback adds play.
	const staticInk: Token = checkPalette(LIGHT).pairs[0].ink;
	const playInk: Token | "play" = checkPalette(LIGHT, { play: "#000", unreachedOpacity: 0 }).pairs[0].ink;
	assert.equal(staticInk, playInk);
});

test("effective opacity accepts CSS numbers/percentages and clamps finite out-of-range inputs", () => {
	const at = (unreachedOpacity: number | string) => checkPalette(LIGHT, { play: "#0a7a60", unreachedOpacity });
	for (const value of ["0.3", " 30% ", "+3e-1", "3e1%", ".3"]) assert.deepEqual(at(value), at(0.3));
	for (const value of [-0.1, "-10%", -Number.MAX_VALUE]) assert.deepEqual(at(value), at(0));
	for (const value of [1.1, "110%", Number.MAX_VALUE]) assert.deepEqual(at(value), at(1));
	assert.deepEqual(at("-0"), at(0));
	assert.deepEqual(at("0%"), at(0));
	assert.deepEqual(at("100%"), at(1));
});

test("playback requires both fields and rejects non-finite, malformed and unsupported inputs", () => {
	for (const unreachedOpacity of [undefined, null, true, {}, [], NaN, Infinity, -Infinity, "", " ", "NaN", "Infinity", "1e999", "1e999%", "0x1", "1.", "30 %", "10%%", "0.3px", "calc(1 / 3)", "var(--fade)", "0,3", "1 0", "--.3"]) {
		assert.throws(() => checkPalette(LIGHT, { play: "#000", unreachedOpacity } as PlaybackContrast), TypeError, String(unreachedOpacity));
	}
	for (const value of [null, false, 0, "", [], {}, { play: "#000" }, { unreachedOpacity: 0.3 }, Object.create({ play: "#000", unreachedOpacity: 0.3 })]) {
		assert.throws(() => checkPalette(LIGHT, value as PlaybackContrast), TypeError);
	}
	for (const play of [undefined, null, 3, "", "red", "currentColor", "var(--play)", "hsl(0 0% 0%)", "color(display-p3 1 0 0)", "#12345", "rgb(256 0 0)", "rgb(0 0 0 / 1.1)", "rgb(NaN 0 0)"]) {
		assert.throws(() => checkPalette(LIGHT, { play, unreachedOpacity: 0.3 } as PlaybackContrast), TypeError);
	}
	assert.deepEqual(checkPalette(LIGHT, { play: "#000", unreachedOpacity: 0.3, extra: true } as PlaybackContrast), checkPalette(LIGHT, { play: "#000", unreachedOpacity: 0.3 }));
});

test("play colours share palette syntax/alpha, and failing host text counts toward minimum", () => {
	const at = (play: string) => checkPalette(LIGHT, { play, unreachedOpacity: 0.3 });
	for (const black of ["#000", "#000f", "#000000ff", " rgb(0,0,0) ", "rgba(0,0,0,1)", "RGB(0% 0% 0% / 100%)", "color(srgb 0 0 0 / 1)"]) assert.deepEqual(at(black), at("#000000"));
	for (const alpha of ["#0008", "#00000088", "rgb(0 0 0 / 0.5333333333333333)", "color(srgb 0% 0% 0% / 53.33333333333333%)"]) assert.deepEqual(at(alpha), at("rgba(0,0,0,0.5333333333333333)"));
	for (const play of ["#fff", "transparent", "#0001"]) {
		const result = at(play);
		assert.ok(result.minimum < 4.5);
		assert.ok(result.pairs.some(p => p.ratio < 4.5 && /controls tab selected/.test(p.where)));
		assert.ok(result.pairs.some(p => p.ratio < 4.5 && /controls actor/.test(p.where)));
		assert.equal(result.minimum, Math.min(...result.pairs.filter(p => p.threshold === 4.5).map(p => p.ratio)));
	}
	const svgFailures = checkPalette({ ...LIGHT, agent: "#fff" }, { play: "#0a7a60", unreachedOpacity: 0 });
	assert.ok(svgFailures.pairs.some(p => p.ratio < 4.5 && /SVG unplayed agent box\/end/.test(p.where)));
});

test("palette and playback colour parsing handles long whitespace runs without delimiter backtracking", () => {
	const spaces = " ".repeat(50_000);
	for (const play of [`rgb(0${spaces}0 0)`, `rgb(0 0 0${spaces}/${spaces}1)`, `color(srgb 0${spaces}0 0 / 1)`]) {
		assert.deepEqual(checkPalette(LIGHT, { play, unreachedOpacity: 0.3 }), checkPalette(LIGHT, { play: "#000", unreachedOpacity: 0.3 }));
		assert.deepEqual(checkPalette({ ...LIGHT, agent: play }), checkPalette({ ...LIGHT, agent: "#000" }));
	}
	for (const play of [`rgb(0${spaces}0 0 / / 1)`, `rgb(0 0 0 /${spaces}1 0)`]) {
		assert.throws(() => checkPalette(LIGHT, { play, unreachedOpacity: 0.3 }), TypeError);
		assert.throws(() => checkPalette({ ...LIGHT, agent: play }), TypeError);
	}
});

test("built-in playback text meets each threshold at shape fade boundaries and intermediate values", () => {
	for (const [palette, play] of defaults) for (const unreachedOpacity of [0, 0.001, 0.01, ...Array.from({ length: 101 }, (_, i) => i / 100)]) {
		const result = checkPalette(palette, { play, unreachedOpacity });
		assert.ok(result.minimum >= 4.5, `${play}/${unreachedOpacity}: ${result.minimum}`);
		assert.ok(result.unreachedMinimum >= 3);
		assert.ok(result.pairs.every(p => p.ratio >= p.threshold));
	}
});

test("faded decision and nested pill grounds multiply fill opacity and colour alpha independently of text", () => {
	const palette: Palette = { ...LIGHT, bg: "#000", "agent-bg": "rgb(255 255 255 / .4)", surface: "rgb(255 255 255 / .5)", agent: "rgb(0 0 0 / .8)", ink: "rgb(0 0 0 / .8)" };
	const pairs = checkPalette(palette, { play: "#fff8", unreachedOpacity: 0.3 }).pairs;
	const decision = pairs.find(p => p.where === "playback SVG unplayed agent decision label on agent-bg diamond and surface label-box over canvas");
	const pill = pairs.find(p => p.where === "playback SVG unplayed agent panel pill label on agent-bg and pill surface over canvas");
	assert.ok(decision && pill);
	assert.deepEqual(decision.ground, ["bg", "agent-bg", "surface"]);
	assert.deepEqual(decision.groundOpacities, [1, 0.3, 0.82 * 0.3]);
	assert.deepEqual(pill.groundOpacities, [1, 0.3, 0.3]);
	const luminance = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	for (const [pair, ground] of [[decision, 0.12 * (1 - 0.123) + 0.123], [pill, 0.12 * 0.85 + 0.15]] as const) {
		const expected = (luminance(ground) + 0.05) / (luminance(ground * (1 - 0.8 * 0.8)) + 0.05);
		assert.ok(Math.abs(pair.ratio - expected) < 1e-12);
	}
	const gap = pairs.find(p => /SVG unplayed agent inline edge label.*over band/.test(p.where));
	assert.deepEqual(gap?.ground, ["bg", "band", "band"]);
	assert.deepEqual(gap?.groundOpacities, [1, 1, 1]);
	for (const p of pairs) {
		if (p.where.startsWith("playback SVG")) assert.equal(p.inkOpacity, p.threshold === 3 ? 0.8 : 1);
		if (p.groundOpacities) assert.equal(p.ground.length, p.groundOpacities.length);
	}
	decision.groundOpacities[1] = 0;
	assert.notDeepEqual(checkPalette(palette, { play: "#fff8", unreachedOpacity: 0.3 }).pairs, pairs);
});

test("actual emitted SVG paints and layered grounds are covered in every playback state", () => {
	for (const fade of [0, 0.01, 0.3, 0.67, 1]) {
		const pairs = checkPalette(LIGHT, { play: "#0a7a60", unreachedOpacity: fade }).pairs;
		const seen = new Set<string>();
		for (const tone of TONES) for (const shaded of [false, true]) {
			const prelude = `flow v0\ncolumns aside main\nsection "First"\n${shaded ? 'box padding col=main\nsection "Second"\n' : ""}`;
			const sources = [
				...["box", "end", "decision", "pill", "panel", "text"].map(kind => `${prelude}${kind} a col=main tone=${tone} ${kind === "box" ? 'Title "Subtitle"' : `"${kind === "decision" ? "Do the stakeholders approve the project concept?" : "Label"}"`}\n${kind === "panel" ? '  strong "Title"\n  text "Content"\n  muted "Aside"\n  pill "Child"\n' : ""}`),
				...["start", "inline"].map(mode => `${prelude}box a col=main\nbox b col=main\na --> b tone=${tone} label=${mode} : label\n`),
			];
			for (const source of sources) {
				const result = render(`${source}play\n step a\n`);
				assert.deepEqual(result.diagnostics, []);
				for (const state of ["current", "played", "unplayed"]) {
					const svg = result.svg.replace('class="ab ab-auto"', 'class="ab ab-auto ab-in-progress"')
						.replaceAll(/<g data-ab-part="([^"]+)">/g, `<g data-ab-part="$1" class="${state === "unplayed" ? "" : `ab-${state}`}">`);
					for (const preference of [false, true]) for (const p of inspect(svg, fade, 0.8, preference).filter(p => p.state)) {
						assert.equal(p.state, state);
						const threshold = state === "unplayed" && !preference ? 3 : 4.5;
						assert.ok(pairs.some(pair => pair.threshold === threshold && pair.where.startsWith(`playback SVG ${state} `) && key(pair) === key(p)), `${state}: ${p.classes}: ${key(p)}`);
						seen.add(`${state}/${threshold}/${key(p)}`);
					}
				}
			}
		}
		for (const pair of pairs.filter(p => p.where.startsWith("playback SVG"))) {
			const state = pair.where.split(" ")[2];
			assert.ok(seen.has(`${state}/${pair.threshold}/${key(pair)}`), `no rendered witness for ${pair.where}: ${key(pair)}`);
		}
	}
});

// Resolve the emitted controls' text colour/background rules against mounted
// elements and pointer/keyboard states. Fail on new unrecognised paint values.
function controlPaint(el: El, css: string, hover: boolean, focus: boolean): { ink: string; ground: string[] } {
	const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selectors, body], order) => {
		const declarations = Object.fromEntries(body.split(";").filter(Boolean).map(d => [d.slice(0, d.indexOf(":")), d.slice(d.indexOf(":") + 1)]));
		if (!("color" in declarations) && !("background" in declarations)) return [];
		return selectors.split(",").filter(s => !s.includes("::") && !s.includes(".abp-row")).map(selector => ({ selector: selector.trim(), declarations, order,
			specificity: (selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g)?.length ?? 0) * 10 + (selector.match(/\bbutton\b/g)?.length ?? 0) }));
	});
	function matches(node: El, selector: string): boolean {
		const parts = selector.split(" ");
		const last = parts.pop() ?? "";
		const simple = (candidate: El, part: string) => {
			if (part.includes(":hover") && !(candidate === el && hover)) return false;
			if (part.includes(":focus-visible") && !(candidate === el && focus)) return false;
			if (part.includes(":disabled") && !candidate.disabled) return false;
			if (part.includes('[aria-selected="true"]') && candidate.getAttribute("aria-selected") !== "true") return false;
			const rest = part.replace(/:(hover|focus-visible|disabled)|\[aria-selected="true"\]/g, "");
			assert.match(rest, /^(?:button)?(?:\.[\w-]+)*$/);
			if (rest.startsWith("button") && candidate.tag !== "button") return false;
			return [...rest.matchAll(/\.([\w-]+)/g)].every(([, name]) => candidate.classList.contains(name));
		};
		if (!simple(node, last)) return false;
		let ancestor = node.parent;
		while (parts.length) {
			const part = parts.pop() ?? "";
			while (ancestor && !simple(ancestor, part)) ancestor = ancestor.parent;
			if (!ancestor) return false;
			ancestor = ancestor.parent;
		}
		return true;
	}
	const chain: El[] = [];
	for (let node: El | null = el; node; node = node.parent) chain.unshift(node);
	let ink = "";
	const ground = ["bg"];
	let rootGround = false;
	for (const node of chain) {
		const values: Record<string, string> = {};
		for (const rule of rules.filter(r => matches(node, r.selector)).sort((a, b) => a.specificity - b.specificity || a.order - b.order)) Object.assign(values, rule.declarations);
		const token = (value: string) => { const match = /^var\(--abp-(\w+)\)$/.exec(value); assert.ok(match, value); return match[1]; };
		if (values.color) ink = token(values.color);
		if (node.classList.contains("ab-playback")) {
			assert.equal(values.background, "transparent", "host canvas supplies the contract bg");
			rootGround = true;
		}
		if (values.background && values.background !== "none" && node.classList.contains("ab-playback") === false) ground.push(token(values.background));
	}
	assert.ok(ink);
	assert.ok(rootGround);
	return { ink, ground };
}

test("mounted control text paints cover tabs, hover/selected/focus combinations, buttons and captions", () => {
	for (const shadow of [false, true]) for (const scheme of ["auto", "light", "dark"]) {
		const doc = new Doc();
		const container = new El(shadow ? "#shadow-root" : "main", doc);
		const svg = new El("svg", doc);
		svg.className = `ab ab-${scheme}`;
		const result = render('flow v0\nbox a\nplay "First"\n step a actor="Author" "Caption"\nplay "Empty"\n');
		const mount = mountPlayback(container as unknown as HTMLElement, svg as unknown as SVGSVGElement, result.timelines);
		const css = container.children.find(c => c.tag === "style")?.textContent ?? "";
		const pairs = checkPalette(LIGHT, { play: "#0a7a60", unreachedOpacity: 0.3 }).pairs.filter(p => p.where.startsWith("playback controls"));
		const witnessed = new Set<string>();
		const verify = (el: El, where: string, hover = false, focus = false) => {
			const pair = pairs.find(p => p.where === where);
			assert.ok(pair, where);
			assert.equal(key(controlPaint(el, css, hover, focus)), key(pair), where);
			witnessed.add(where);
		};
		const tab = container.all().find(el => el.getAttribute("role") === "tab");
		assert.ok(tab);
		for (const selected of [false, true]) for (const hover of [false, true]) for (const focus of [false, true]) {
			tab.setAttribute("aria-selected", String(selected));
			verify(tab, `playback controls tab ${selected ? "selected" : "normal"}${hover ? " hover" : ""}${focus ? " keyboard-focused" : ""} on canvas`, hover, focus);
		}
		for (const disabled of [false, true]) {
			mount.player.select(disabled ? 1 : 0);
			for (const el of container.all().filter(el => el.tag === "button" && !el.getAttribute("role"))) {
				assert.equal(el.disabled, disabled);
				for (const hover of [false, true]) for (const focus of disabled ? [false] : [false, true]) verify(el,
					`playback controls button ${disabled ? "disabled" : "enabled"}${hover ? " hover" : ""}${focus ? " keyboard-focused" : ""} on button background over canvas`, hover, focus);
			}
		}
		mount.player.select(0); mount.player.seek(0);
		for (const role of ["actor", "counter", "caption"]) {
			const el = container.all().find(el => el.classList.contains(`abp-${role}`));
			assert.ok(el?.textContent);
			verify(el, `playback controls ${role} on canvas`);
		}
		mount.player.select(1);
		const empty = container.all().find(el => el.classList.contains("abp-caption"));
		assert.ok(empty);
		assert.equal(empty.textContent, "No playable steps");
		verify(empty, "playback controls empty-state text on canvas");
		assert.equal(witnessed.size, pairs.length);
		assert.match(css, /font:14px\/1.5 var\(--ab-font-text,system-ui,sans-serif\)/);
		assert.equal(css.match(/var\(--ab-font-mono,ui-monospace,monospace\)/g)?.length, 5);
		assert.doesNotMatch(result.svg, /--ab-font-(text|mono)/);
		mount.destroy();
	}
});
