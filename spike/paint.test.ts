import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { checkPalette, DARK, LIGHT, type Palette, render, TOKENS, type Token } from "./flow/index.ts";
import { TONES } from "./flow/parse.ts";
import { catalog } from "./playground/catalog.ts";

const root = import.meta.dirname;
const key = (ink: string, ground: string[], opacity?: number, groundOpacities?: number[]) => `${ink}/${ground.join("+")}/${(groundOpacities ?? ground.map((_, i) => i === ground.length - 1 ? opacity ?? 1 : 1)).join(",")}`;
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const pair = (palette: Palette, ink: Token, ground: Token[], opacity?: number) => {
	const p = checkPalette(palette).pairs.find((p) => key(p.ink, p.ground, p.opacity) === key(ink, ground, opacity));
	assert.ok(p);
	return p;
};

test("TOKENS follows the theming table and both palettes have exactly its keys", () => {
	const table = readFileSync(join(root, "../docs/theming.md"), "utf8");
	assert.deepEqual(TOKENS, [...table.matchAll(/^\| `--ab-([^`]+)`/gm)].map((m) => m[1]));
	assert.equal(new Set(TOKENS).size, TOKENS.length);
	assert.ok(Object.isFrozen(TOKENS));
	for (const palette of [LIGHT, DARK]) assert.deepEqual(Object.keys(palette).sort(), [...TOKENS].sort());
});

test("ordinary WCAG contrast and the unrounded minimum", () => {
	const palette = Object.fromEntries(TOKENS.map((t) => [t, "#fff"])) as Palette;
	palette.ink = "#000";
	close(pair(palette, "ink", ["bg"]).ratio, 21);
	close(pair(palette, "muted", ["bg"]).ratio, 1);
	const result = checkPalette(palette);
	assert.equal(result.minimum, Math.min(...result.pairs.map((p) => p.ratio)));
	assert.equal(result.minimum, 1);
});

test("unchanged built-ins: LIGHT minimum is rework-toned edge labels on band; DARK passes 4.5", () => {
	const light = checkPalette(LIGHT);
	const minimum = light.pairs.find((p) => p.ratio === light.minimum);
	assert.ok(minimum);
	assert.equal(minimum.ink, "rework");
	assert.deepEqual(minimum.ground, ["bg", "band"]);
	assert.match(minimum.where, /rework-toned edge labels on band/);
	close(light.minimum, 4.395772012043759);
	close(checkPalette(DARK).minimum, 4.706637464097893);
	assert.ok(checkPalette(DARK).minimum >= 4.5);
});

test("decision opacity applies only to surface, composited in encoded sRGB before luminance", () => {
	const palette = { ...LIGHT, bg: "#000", band: "#fff", surface: "#fff", "agent-bg": "#000", agent: "#000" };
	// .82 white over black gives encoded sRGB .82, not linear-light .82.
	const expected = (((0.82 + 0.055) / 1.055) ** 2.4 + 0.05) / 0.05;
	close(pair(palette, "agent", ["bg", "agent-bg", "surface"], 0.82).ratio, expected);
	close(pair(palette, "agent", ["bg", "band", "surface"], 0.82).ratio, 21);
	close(pair(palette, "agent", ["bg", "surface"], 0.82).ratio, expected);
	// Colour alpha multiplies fill-opacity. Other layers keep their own alpha.
	palette.surface = "rgb(100% 100% 100% / 50%)";
	const half = (((0.41 + 0.055) / 1.055) ** 2.4 + 0.05) / 0.05;
	close(pair(palette, "agent", ["bg", "agent-bg", "surface"], 0.82).ratio, half);
	palette.agent = "rgba(0, 0, 0, 0.5)";
	const foreground = ((0.205 + 0.055) / 1.055) ** 2.4;
	close(pair(palette, "agent", ["bg", "agent-bg", "surface"], 0.82).ratio, (half * 0.05) / (foreground + 0.05));
});

test("accepted hex, resolved RGB and color(srgb) forms agree, including alpha", () => {
	for (const white of ["#fff", "#ffff", "#ffffff", "#ffffffff", "rgb(255, 255, 255)", "rgba(255,255,255,1)", "RGB(100% 100% 100% / 100%)", "color(srgb 1 1 1)", " color(srgb 100% 100% 100% / 1) "]) {
		close(pair({ ...LIGHT, bg: white, ink: "#000" }, "ink", ["bg"]).ratio, 21);
	}
	for (const half of ["#fff8", "#ffffff88", "rgb(255 255 255 / 0.5333333333333333)"]) {
		const result = pair({ ...LIGHT, bg: "#000", ink: half }, "ink", ["bg"]).ratio;
		close(result, (((136 / 255 + 0.055) / 1.055) ** 2.4 + 0.05) / 0.05);
	}
	close(pair({ ...LIGHT, ink: "transparent" }, "ink", ["bg"]).ratio, 1);
});

test("every token is validated; missing, unsupported, invalid and transparent canvas inputs throw", () => {
	for (const token of TOKENS) {
		for (const value of [undefined, null, "", "red", "currentColor", "var(--x)", "hsl(0 0% 50%)", "oklch(.5 .1 20)", "color(display-p3 1 0 0)", "#12", "#gggggg", "rgb(NaN 0 0)", "rgb(1e999 0 0)", "rgb(256 0 0)", "rgb(0 0)", "rgb(0 0 0 / -1)", "rgb(0,0,0 / 1)", "rgb(0%,0,0)", "rgb(1. 0 0)", "color(srgb 1 0 0 / 2)"]) {
			assert.throws(() => checkPalette({ ...LIGHT, [token]: value } as Palette), TypeError, `${token}: ${value}`);
		}
		const missing: Partial<Palette> = { ...LIGHT };
		delete missing[token];
		assert.throws(() => checkPalette(missing as Palette), /Missing palette colour/);
	}
	for (const bg of ["transparent", "#0000", "rgba(0,0,0,.9)"]) assert.throws(() => checkPalette({ ...LIGHT, bg }), /opaque host canvas/);
	assert.throws(() => checkPalette(null as unknown as Palette), TypeError);
});

test("callers cannot mutate later results or the supplied palette through pairs", () => {
	const before = checkPalette(LIGHT);
	before.pairs[0].ground.push("line");
	before.pairs[0].where = "changed";
	const layered = before.pairs.find((p) => p.groundOpacities);
	assert.ok(layered?.groundOpacities);
	layered.groundOpacities[0] = 0;
	assert.notDeepEqual(checkPalette(LIGHT), before);
});

test("stacked lane, two group fills and note preserve exact translucent host colour composition", () => {
	const result = checkPalette({ ...LIGHT, bg: "#000", "neutral-bg": "rgba(255,255,255,.4)", "rework-bg": "rgb(255 255 255 / .3)", rework: "rgba(0,0,0,.8)" });
	const paint = result.pairs.find((p) => p.ink === "rework" && p.ground.join(",") === "bg,neutral-bg,neutral-bg,neutral-bg,rework-bg");
	assert.ok(paint);
	assert.deepEqual(paint.groundOpacities, [1, 0.15, 0.5, 0.5, 1]);
	// White lane alpha .06, then white group alphas .2 and .2, then
	// white note alpha .3: encoded channel .57888. Ink leaves 20%.
	const linear = (v: number) => ((v + 0.055) / 1.055) ** 2.4;
	close(paint.ratio, (linear(0.57888) + 0.05) / (linear(0.115776) + 0.05));
	for (const p of result.pairs) {
		assert.ok(p.opacity === undefined || p.groundOpacities === undefined);
		if (p.groundOpacities) {
			assert.equal(p.ground.length, p.groundOpacities.length);
			assert.equal(p.groundOpacities[0], 1);
			assert.ok(p.groundOpacities.every((v) => v >= 0 && v <= 1));
		}
	}
});

// This small SVG inspector reads the *emitted* cascade and paint geometry. It
// does not import a second class/paint table from production or the tests.
// Unsupported selectors, fill values and filled shapes fail closed, so extending
// the renderer requires teaching this inspector how to observe the new paint.
type Element = { tag: string; attrs: Record<string, string>; classes: string[] };
function inspect(svg: string) {
	const css = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1];
	assert.ok(css);
	const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].flatMap(([, selector, body], order) => {
		const declarations = Object.fromEntries(body.split(";").filter(Boolean).map((d) => d.split(":")));
		assert.ok(!("opacity" in declarations), "inspector must handle new group/element opacity");
		if (!("fill" in declarations) && !("fill-opacity" in declarations)) return [];
		// checkPalette covers the static palette. Play states use separate host
		// tokens and are inactive in these full-figure renders; playback.test.ts
		// covers their SVG contract. Refuse active states rather than misreport
		// their text as an ordinary static paint.
		const state = /^\.ab\[data-ab-play="[A-Za-z0-9_.-]+"\] \[data-ab-part\]\.ab-(played|current) :is\(text,circle\)$/.exec(selector.trim());
		if (state) {
			assert.doesNotMatch(svg, /class="[^"]*\bab-(?:current|played)\b/, "static paint inspector cannot inspect active playback states");
			assert.deepEqual(declarations, { fill: `var(--${state[1] === "current" ? "play" : "play-done"})` });
			return [];
		}
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
	const observations: { ink: Token; ground: Token[]; groundOpacities: number[]; classes: string }[] = [];
	const body = svg.replace(/<style>[\s\S]*?<\/style>|<defs>[\s\S]*?<\/defs>/g, "");
	for (const match of body.matchAll(/<(\w+)\b([^>]*)>/g)) {
		const el: Element = { tag: match[1], attrs: Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]])), classes: [] };
		el.classes = (el.attrs.class ?? "").split(" ");
		assert.ok(!el.attrs.transform, "inspector must handle new transforms");
		assert.ok(!el.attrs.style && !el.attrs.opacity, "inspector must handle new inline styles/opacity");
		const p = paint(el);
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
				observations.push({ ink: p.token, ground: ["bg", ...layers.map((s) => s.token)], groundOpacities: [1, ...layers.map((s) => s.opacity)], classes: `${el.attrs.class} on ${layers.map((s) => s.element.attrs.class).join(" + ") || "canvas"}` });
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

const contract = new Set(checkPalette(LIGHT).pairs.map((p) => key(p.ink, p.ground, p.opacity, p.groundOpacities)));
function covered(svg: string, name: string) {
	const observations = inspect(svg);
	assert.ok(observations.length, name);
	for (const p of observations) assert.ok(contract.has(key(p.ink, p.ground, undefined, p.groundOpacities)), `${name}: ${p.classes}: ${key(p.ink, p.ground, undefined, p.groundOpacities)} absent from contract`);
	return observations;
}

test("every example and real playground catalogue entry has its emitted text paints in the contract", () => {
	const entries = catalog(root);
	assert.deepEqual(entries.map((g) => g.kind), ["Flow", "Fan-out"]);
	const paths = new Set(entries.flatMap((g) => g.flows.map((e) => join(e.folder, `${e.name}.flow`))));
	for (const name of readdirSync(join(root, "examples"))) if (name.endsWith(".flow")) paths.add(join("examples", name));
	for (const path of paths) {
		const source = readFileSync(join(root, path), "utf8");
		for (const scheme of [undefined, "light", "dark"] as const) covered(render(source, { scheme }).svg, `${path}/${scheme}`);
	}
});

test("focused renders cover every tone, section ground, label mode, node/legend kind and fan-out diagnostic", () => {
	const seen = new Set<string>();
	const observe = (source: string) => {
		for (const p of covered(render(source).svg, source)) seen.add(key(p.ink, p.ground, undefined, p.groundOpacities));
	};
	for (const tone of TONES) {
		for (const shaded of [false, true]) {
			const prelude = `flow v0\nsection "First"\n${shaded ? 'box padding\nsection "Second"\n' : ""}`;
			for (const kind of ["box", "end", "decision", "pill", "panel", "text"]) {
				observe(`${prelude}${kind} a tone=${tone} "${kind === "decision" ? "Do the stakeholders approve the project concept?" : "Label"}"${kind === "box" ? ' sub="Subtitle"' : ""}\n${kind === "panel" ? '  strong "Title"\n  text "Content"\n  muted "Aside"\n  pill "Child"\n' : ""}`);
			}
			for (const mode of ["start", "inline"]) observe(`${prelude}box a\nbox b\na --> b tone=${tone} label=${mode} : label\n`);
		}
		for (const kind of ["box", "end", "decision", "pill", "panel"]) observe(`flow v0\nlegend\n  ${kind} tone=${tone} sample="Sample" "Meaning"\n`);
		for (const style of ["branches", "ladder"]) observe(`fan-out v0\nstyle ${style}\nstep "Step"\noutcome "Outcome" reason="Reason" destination="Destination" tone="${tone}" extra="Invalid"\ninvalid\n`);
		observe(`sequence v0\nparticipant a tone=${tone}\nparticipant b tone=${tone}\nparticipant c tone=${tone}\na --> b: Request on canvas\nb -.-> a: Response on canvas\nb --> c: Request on tint\nc -.-> b: Response on tint\ninvalid\n`);
	}
	for (const host of ["a", "b"]) for (const depth of [0, 1, 2, 3]) {
		const opening = Array.from({ length: depth }, () => "alt Branch").join("\n");
		observe(`sequence v0\nparticipant a\nparticipant b\nparticipant c\nsection "Phase"\n${opening}\n${host} --> c: ${"Cross the boundaries ".repeat(4)}\n${host} -.-> c: Response\nnote over ${host}: Note\n${depth ? "else Other\n" : ""}${"end\n".repeat(depth)}`);
	}
	// Distinct actual paints, rather than a second hand-maintained pair list.
	for (const ink of ["ink", "muted", "neutral", "agent", "system", "done", "rework", "stop"]) {
		assert.ok(seen.has(key(ink, ["bg"])));
		assert.ok(seen.has(key(ink, ["bg", "band"])));
	}
	for (const tone of ["neutral", "agent", "system", "done", "rework", "stop"]) {
		for (const ground of [["bg", "surface"], ["bg", "band", "surface"], ["bg", `${tone}-bg`, "surface"], ["bg", "band", `${tone}-bg`, "surface"]]) assert.ok(seen.has(key(tone, ground, 0.82)), key(tone, ground, 0.82));
	}
	for (const paint of contract) assert.ok(seen.has(paint), `contract paint has no rendered witness: ${paint}`);
});

test("coverage detects new text and ground paints from SVG CSS", () => {
	const svg = render('flow v0\nbox a\n').svg;
	assert.throws(() => covered(svg.replace("fill:var(--agent)", "fill:var(--line)"), "changed text paint"), /absent from contract/);
	assert.throws(() => covered(svg.replace("fill:var(--agent-bg)", "fill:var(--line)"), "changed ground paint"), /absent from contract/);
});

test("sequence annotation witnesses cover each actual layered role and both message kinds across boundaries", () => {
	for (const depth of [0, 1, 2, 3]) for (const host of ["a", "b"]) {
		const opening = "alt Condition\n".repeat(depth), closing = "end\n".repeat(depth);
		const long = "Across lane and group fills ".repeat(8);
		const result = render(`sequence v0\nparticipant a\nparticipant b\nparticipant c\nsection "Phase"\n${opening}${host} --> c: ${long}\n${host} -.-> c: ${long}\nnote over ${host}: Note\nnote over ${host}, c: Spanning note\n${depth ? "else Other\n" : ""}${closing}`);
		assert.deepEqual(result.diagnostics, []);
		const observed = covered(result.svg, `${depth}/${host}`);
		const ground: Token[] = ["bg", ...(host === "b" ? ["neutral-bg" as const] : []), ...Array<Token>(Math.min(2, depth)).fill("neutral-bg")];
		const multipliers = [1, ...(host === "b" ? [0.15] : []), ...Array<number>(Math.min(2, depth)).fill(0.5)];
		const has = (role: string, ink: Token, extra: Token[] = []) => observed.some((p) => p.classes.includes(role) && key(p.ink, p.ground, undefined, p.groundOpacities) === key(ink, [...ground, ...extra], undefined, [...multipliers, ...extra.map(() => 1)]));
		assert.ok(has("seq-label", "ink"));
		assert.ok(has("seq-note-text", "rework", ["rework-bg"]));
		if (depth) {
			assert.ok(has("seq-kind", "ink"));
			assert.ok(has("seq-group-label", "muted"));
			assert.ok(has("seq-else-label", "muted"));
		}
		for (const row of result.svg.matchAll(/<g data-line="\d+" data-step="\d+">([\s\S]*?)<\/g>/g)) {
			// Keep the actual fill geometry while inspecting each message run.
			const onlyRow = result.svg.replace(/<g data-line="\d+" data-step="\d+">[\s\S]*?<\/g>/g, (whole) => whole.includes(row[1]) ? whole : "");
			const grounds = covered(onlyRow, "crossing message").filter((p) => p.classes.startsWith("m s12 seq-label")).map((p) => key(p.ink, p.ground, undefined, p.groundOpacities));
			assert.ok(new Set(grounds).size >= 2);
		}
	}
});
