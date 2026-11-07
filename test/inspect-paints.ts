import assert from "node:assert/strict";
import { TOKENS, type Token } from "../src/index.ts";

// This small SVG inspector reads the *emitted* cascade and paint geometry. It
// does not import a second class/paint table from production or the tests.
// Unsupported selectors, fill values and filled shapes fail closed, so extending
// the renderer requires teaching this inspector how to observe the new paint.
type Element = { tag: string; attrs: Record<string, string>; classes: string[] };
export function inspect(svg: string, fade?: number) {
	const css = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1];
	assert.ok(css);
	const idleCss = css.replace(/@keyframes [^{]+\{(?:[^{}]*\{[^{}]*\})+\}/g, "");
	let hiddenSequenceOverlays = false;
	const rules = [...idleCss.matchAll(/([^{}]+)\{([^{}]+)\}/g)].flatMap(([, selector, body], order) => {
		const declarations = Object.fromEntries(body.split(";").filter(Boolean).map((d) => d.split(":")));
		// Fade rules affect only a shown step. Refuse active roots rather than
		// treating dimmed text as a static palette paint; playback-fade.test.ts
		// checks these rules, their opaque backgrounds and the root lifecycle.
		if (/^\.ab\[data-ab-play="[A-Za-z0-9_.-]+"\]\.ab-in-progress \[data-ab-part\]:where\(:not\(\.ab-current\):not\(\.ab-played\)\) :is\(rect:not\(\.gap\),path:not\(\.knockout\),circle,line\)$/.test(selector.trim())) {
			if (fade === undefined) assert.doesNotMatch(svg, /class="[^"]*\bab-in-progress\b/, "static paint inspector cannot inspect active playback fading");
			assert.deepEqual(declarations, { opacity: "var(--ab-play-unreached-opacity,.3)" });
			return [];
		}
		if (/^\.ab\[data-ab-play="[A-Za-z0-9_.-]+"\]\.ab-in-progress \[data-ab-part\]:not\(\.ab-current\):not\(\.ab-played\)(?::not\(:has\(\.gap\)\)|:has\(\.gap\) text)$/.test(selector.trim())) {
			assert.doesNotMatch(svg, /class="[^"]*\bab-in-progress\b/, "static paint inspector cannot inspect active playback fading");
			assert.deepEqual(declarations, { opacity: ".3" });
			return [];
		}
		// Only the current sequence gutter number takes the playback colour.
		// It is inactive in this static inspector; sequence-playback.test.ts
		// checks its state rule. Keep refusing active figures and new paints.
		if (/^\.ab\[data-ab-play="[A-Za-z0-9_.-]+"\] \[data-ab-part\]\.ab-current \.seq-number$/.test(selector.trim())) {
			assert.doesNotMatch(svg, /class="[^"]*\bab-current\b/, "static paint inspector cannot inspect current playback parts");
			assert.deepEqual(declarations, { fill: "var(--play)", "font-weight": "600" });
			return [];
		}
		// These two shapes are invisible in idle and cannot add a ground
		// paint. Recognize only their exact scoped rules, retaining fail-closed
		// behavior for changed defaults and any new opacity or fill selector.
		const overlay = /^\.ab\[data-ab-play="[A-Za-z0-9_.-]+"\](.*)$/.exec(selector.trim())?.[1];
		if (overlay === " :is(.seq-packet,.seq-time-band)") {
			assert.deepEqual(declarations, { opacity: "0", "pointer-events": "none" });
			hiddenSequenceOverlays = true;
			return [];
		}
		if (overlay === " .seq-time-band") { assert.deepEqual(declarations, { fill: "var(--play)" }); return []; }
		if (overlay === " .seq-packet") { assert.equal(declarations.fill, "none"); assert.ok(!("opacity" in declarations)); return []; }
		const overlayOpacity: Record<string, string> = {
			".ab-in-progress [data-ab-part].ab-current .seq-time-band": ".1",
		};
		if (overlay && overlayOpacity[overlay]) { assert.deepEqual(declarations, { opacity: overlayOpacity[overlay] }); return []; }
		assert.ok(!("opacity" in declarations), "inspector must handle new group/element opacity");
		if (!("fill" in declarations) && !("fill-opacity" in declarations)) return [];
		assert.match(selector.trim(), /^\.ab (?:text|(?:\.[\w-]+)+)$/);
		const classes = [...selector.matchAll(/\.([\w-]+)/g)].slice(1).map((m) => m[1]);
		return [{ classes, text: selector.trim() === ".ab text", declarations, specificity: classes.length * 10 + (selector.trim() === ".ab text" ? 1 : 0), order }];
	});
	const paint = (el: Element) => {
		const values: Record<string, string> = {};
		for (const r of rules.filter((r) => (!r.text || el.tag === "text") && r.classes.every((c) => el.classes.includes(c))).sort((a, b) => a.specificity - b.specificity || a.order - b.order)) Object.assign(values, r.declarations);
		Object.assign(values, Object.fromEntries(Object.entries(el.attrs).filter(([k]) => k === "fill" || k === "fill-opacity")));
		if (!values.fill) {
			assert.ok(["svg", "g", "line"].includes(el.tag), `unsupported implicit fill on ${el.tag}`);
			return null;
		}
		if (values.fill === "none") return null;
		const token = /^var\(--([\w-]+)\)$/.exec(values.fill)?.[1];
		assert.ok(TOKENS.includes(token as Token), `unsupported emitted fill ${values.fill}`);
		return { token: token as Token, opacity: Number(values["fill-opacity"] ?? 1) };
	};
	const shapes: { element: Element; token: Token; opacity: number; contains: (x: number, y: number) => boolean }[] = [];
	const observations: { ink: Token; ground: Token[]; groundOpacities: number[]; classes: string; state?: string }[] = [];
	const stack: (string | undefined)[] = [];
	const active = /class="[^"]*\bab-in-progress\b/.test(svg);
	const body = svg.replace(/<style>[\s\S]*?<\/style>|<defs>[\s\S]*?<\/defs>/g, "");
	for (const match of body.matchAll(/<(\/?)(\w+)\b([^>]*)>/g)) {
		if (match[1]) { stack.pop(); continue; }
		const el: Element = { tag: match[2], attrs: Object.fromEntries([...match[3].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]])), classes: [] };
		el.classes = (el.attrs.class ?? "").split(" ");
		const state = el.attrs["data-ab-part"] && active
			? el.classes.includes("ab-current") ? "current" : el.classes.includes("ab-played") ? "played" : "unplayed"
			: stack.at(-1);
		if (!match[0].endsWith("/>")) stack.push(state);
		assert.ok(!el.attrs.transform, "inspector must handle new transforms");
		if (el.attrs.style) {
			assert.equal(el.tag, "g");
			assert.match(el.attrs["data-ab-part"], /^message-\d+$/);
			assert.match(el.attrs.style, /^--seq-length:\d+(?:\.\d+)?$/);
		}
		assert.ok(!el.attrs.opacity, "inspector must handle new inline opacity");
		if (el.classes.some(c => ["seq-packet", "seq-time-band"].includes(c))) {
			assert.ok(hiddenSequenceOverlays, "idle sequence overlays must be hidden");
			assert.ok(["path", "rect"].includes(el.tag), "only overlay shapes may be omitted");
			continue;
		}

		const p = paint(el);
		if (p && state === "unplayed" && ["rect", "path", "circle", "line"].includes(el.tag) && !el.classes.includes("gap") && !el.classes.includes("knockout")) p.opacity *= fade ?? 1;
		if (!p) {
			assert.notEqual(el.tag, "text", "every text must have a resolved ink");
			continue;
		}
		const n = (attr: string) => Number(el.attrs[attr]);
		if (el.tag === "text") {
			assert.equal(p.opacity, 1, "inspector must handle new text opacity");
			const x = n("x"), y = n("y") - 4;
			const top = shapes.findLast((s) => s.contains(x, y));
			// A decision's label rectangle straddles its diamond. Observe both
			// centre and side of that actual rectangle, regardless of label length.
			const points = top && top.opacity !== 1 && top.element.tag === "rect"
				? [x, Number(top.element.attrs.x) + 2, Number(top.element.attrs.x) + Number(top.element.attrs.width) - 2]
				: [x];
			// Message text can cross lane and group boundaries. Sample the
			// whole emitted run, including both sides of every fill boundary.
			if (el.classes.includes("seq-label")) {
				const content = body.slice((match.index ?? 0) + match[0].length).split("</text>")[0].replace(/&(?:amp|lt|gt|quot|apos);/g, "x");
				const end = x + [...content].length * 7.2;
				for (const shape of shapes.filter((s) => s.element.tag === "rect")) {
					const left = Number(shape.element.attrs.x), right = left + Number(shape.element.attrs.width);
					for (const boundary of [left, right]) for (const px of [boundary - 0.01, boundary + 0.01]) if (px > x && px < end) points.push(px);
				}
			}
			for (const px of points) {
				const layers = shapes.filter((s) => s.contains(px, y));
				observations.push({ ink: p.token, ground: ["bg", ...layers.map((s) => s.token)], groundOpacities: [1, ...layers.map((s) => s.opacity)], state, classes: `${el.attrs.class} on ${layers.map((s) => s.element.attrs.class).join(" + ") || "canvas"}` });
			}
		} else if (el.tag === "rect") {
			shapes.push({ element: el, ...p, contains: (x, y) => x >= n("x") && x <= n("x") + n("width") && y >= n("y") && y <= n("y") + n("height") });
		} else if (el.tag === "path") {
			const points = [...(el.attrs.d ?? "").matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
			assert.equal(points.length, 4, `unsupported filled path ${el.attrs.d}`);
			const [top, right, bottom, left] = points;
			const cx = (left[0] + right[0]) / 2, cy = (top[1] + bottom[1]) / 2;
			shapes.push({ element: el, ...p, contains: (x, y) => Math.abs(x - cx) / (right[0] - cx) + Math.abs(y - cy) / (bottom[1] - cy) <= 1 });
		} else if (el.tag === "circle") {
			shapes.push({ element: el, ...p, contains: (x, y) => (x - n("cx")) ** 2 + (y - n("cy")) ** 2 <= n("r") ** 2 });
		} else assert.fail(`unsupported filled element ${el.tag}`);
	}
	return observations;
}

