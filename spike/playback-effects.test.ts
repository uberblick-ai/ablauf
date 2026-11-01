import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, type TestContext } from "node:test";
import { gunzipSync } from "node:zlib";
import { render, LIGHT, DARK } from "./flow/index.ts";
import { createPlayer, mountPlayback } from "./flow/playback.ts";
import { Doc, El } from "./test-dom.ts";

const source = `flow v0
box a
decision b "Proceed?"
pill c
text d "Isolated"
a --> b : inline label=inline
a -.-> b
b --> c
play "Route"
 tempo 100ms
 step a
 step b
 step c
play "Isolated"
 step d 100ms
play "Empty"
`;

function setup(t: TestContext, mode: "headless" | "mounted" | "controls", loop = false, doc = new Doc(), idPrefix = "effects") {
	const result = render(source, { idPrefix });
	assert.deepEqual(result.diagnostics.map(d => d.message), ["edge a → b overlaps a → b"], "parallel-edge fixture has one intentional overlap");
	const container = new El("main", doc);
	const svg = new El("svg", doc);
	svg.className = "ab ab-auto original";
	for (const match of result.svg.matchAll(/data-ab-part="([^"]+)"/g)) {
		const wrapper = new El("g", doc);
		wrapper.className = "original";
		wrapper.setAttribute("data-ab-part", match[1]);
		svg.append(wrapper);
	}
	container.append(svg);
	const element = svg as unknown as SVGSVGElement;
	const mount = mode === "headless" ? undefined : mountPlayback(container as unknown as HTMLElement, element, result.timelines, { loop });
	const player = mount?.player ?? createPlayer(element, result.timelines, { loop, onChange: () => check() });
	t.after(() => player.destroy());
	function check() {
		const { state } = player;
		assert.equal(svg.classList.contains("ab-playing"), state.status === "playing");
		assert.equal(svg.classList.contains("ab-in-progress"), state.step >= 0);
		assert.ok(svg.classList.contains("original"));
		const steps = result.timelines[state.scenario].steps;
		const current = new Set(steps[state.step]?.parts);
		const played = new Set(steps.slice(0, Math.max(0, state.step)).flatMap(step => step.parts));
		for (const wrapper of svg.children) {
			const part = wrapper.getAttribute("data-ab-part") ?? "";
			assert.equal(wrapper.classList.contains("ab-current"), current.has(part));
			assert.equal(wrapper.classList.contains("ab-played"), !current.has(part) && played.has(part));
		}
	}
	function action(name: "play" | "pause" | "next" | "previous") {
		if (mode === "controls") {
			const label = name === "play" ? player.state.status === "ended" ? "Replay" : "Play" : name === "pause" ? "Pause" : name === "next" ? "Next" : "Previous";
			const button = container.all().find(el => el.tag === "button" && (el.getAttribute("aria-label") ?? el.textContent) === label);
			assert.ok(button, label);
			button.click();
		} else player[name]();
		check();
	}
	check();
	return { svg, container, player, mount, doc, check, action, tick: (ms: number) => { t.mock.timers.tick(ms); check(); } };
}

for (const mode of ["headless", "mounted", "controls"] as const) {
	test(`${mode}: playing hook follows dwell, pause, navigation, end, replay and teardown`, t => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const f = setup(t, mode);
		f.action("play");
		assert.equal(f.player.state.step, 0);
		assert.ok(f.svg.children.filter(el => el.classList.contains("ab-current")).every(el => el.getAttribute("data-ab-part") === "node-0"), "first step has no incoming edge");
		f.tick(100);
		assert.equal(f.player.state.step, 1);
		for (const part of ["edge-0", "edge-1"]) {
			assert.ok(f.svg.children.filter(el => el.getAttribute("data-ab-part") === part).every(el => el.classList.contains("ab-current")), "both parallel incoming edges are current");
		}
		f.action("pause");
		assert.equal(f.player.state.status, "paused");
		assert.ok(f.svg.classList.contains("ab-in-progress"));
		f.tick(10000);
		assert.equal(f.player.state.step, 1);
		f.action("play"); f.action("previous");
		assert.equal(f.player.state.status, "paused");
		f.action("play"); f.action("next");
		assert.equal(f.player.state.status, "paused");
		f.action("play");
		f.tick(100); f.tick(100);
		assert.equal(f.player.state.status, "ended");
		assert.ok(f.svg.classList.contains("ab-in-progress"));
		f.action("play");
		assert.equal(f.player.state.step, 0);
		f.player.seek(-1); f.check();
		assert.ok(!f.svg.classList.contains("ab-in-progress"));
		f.action("play"); f.player.select(1); f.check();
		assert.equal(f.player.state.status, "paused");
		f.action("play"); f.player.select(2); f.check();
		f.player.play(); f.check();
		assert.equal(f.player.state.status, "idle");
		f.player.select(0); f.action("play");
		f.player.destroy(); f.check();
		assert.equal(f.svg.className, "ab ab-auto original");
		assert.ok(f.svg.children.every(el => el.className === "original"));
		f.player.play(); f.tick(10000);
	});

	test(`${mode}: loops stay playing; reduced motion resets and never restarts automatically`, t => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const f = setup(t, mode, true);
		f.action("play");
		f.tick(100); f.tick(100); f.tick(100);
		assert.deepEqual(f.player.state, { scenario: 0, step: 0, status: "playing" });
		f.doc.motion.set(true); f.check();
		assert.equal(f.player.state.status, "idle");
		f.action("next");
		assert.equal(f.player.state.status, "paused");
		assert.ok(f.svg.classList.contains("ab-in-progress"));
		f.action("play");
		assert.equal(f.player.state.status, "idle");
		f.doc.motion.set(false); f.tick(10000);
		assert.equal(f.player.state.status, "idle");
		f.action("play");
		assert.equal(f.player.state.status, "playing");
		if (f.mount) f.mount.destroy(); else f.player.destroy();
		f.check();
	});
}

test("independently driven roots, including a shadow container, retain their own playing state", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const doc = new Doc();
	const one = setup(t, "headless", false, doc, "one");
	const two = setup(t, "mounted", false, doc, "two");
	two.container.tag = "#shadow-root";
	one.action("play"); two.action("play");
	one.action("pause"); two.check();
	assert.ok(two.svg.classList.contains("ab-playing"));
	one.player.destroy(); two.check();
	two.doc.motion.set(true); two.check();
	assert.equal(two.player.state.status, "idle");
});

test("post-112 idle SVG bytes change only by added styles and playback colour substitutions", () => {
	const baseline = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/pre-playback-motion.json.gz", import.meta.url))).toString()) as {
		sha: string; fixtures: { file: string; outputs: string[] }[];
	};
	assert.equal(baseline.sha, "fb1a0f9068b4d6a4ed7e07c9318507f548799cc4");
	for (const { file, outputs } of baseline.fixtures) {
		const input = readFileSync(new URL(`./examples/${file}`, import.meta.url), "utf8");
		for (const [i, scheme] of ([undefined, "light", "dark"] as const).entries()) {
			const expected = outputs[i].replaceAll("#2869b8", "#0a7a60").replaceAll("#88baff", "#6ff0cf").replaceAll("#62798e", "#596e81").replaceAll("#8498ac", "#5f9e8a");
			const actual = render(input, { scheme, idPrefix: file.slice(0, -5) }).svg;
			const originalStyle = expected.match(/<style>([\s\S]*?)<\/style>/)?.[1];
			const newStyle = actual.match(/<style>([\s\S]*?)<\/style>/)?.[1];
			assert.ok(originalStyle && newStyle);
			assert.ok(newStyle.startsWith(`${originalStyle}\n`), `${file}: existing rules remain byte-identical apart from defaults`);
			assert.equal(actual.replace(newStyle, originalStyle), expected);
			assert.doesNotMatch(actual.match(/<svg[^>]*>/)?.[0] ?? "", /ab-current|ab-in-progress|ab-playing/);
		}
	}
});

test("embedded effects target current shapes, with figure-local seamless forward dashes and reduced-motion guards", () => {
	const names = new Set<string>();
	for (const idPrefix of ["first", "second", "1:<unsafe>."]) {
		const { svg } = render(source, { idPrefix });
		assert.equal(svg, render(source, { idPrefix }).svg);
		const id = svg.match(/data-ab-play="([^"]+)"/)?.[1];
		const root = `.ab[data-ab-play="${id}"]`;
		const css = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
		const effects = css.split("\n").at(-1) ?? "";
		const filterRules = [...effects.matchAll(/([^{}]+)\{([^{}]*filter:[^{}]*)\}/g)];
		assert.equal(filterRules.length, 1);
		assert.equal(filterRules[0][1], `${root} [data-ab-part].ab-current :is(rect:not(.gap),.decision,.e)`);
		assert.match(filterRules[0][2], /drop-shadow\(0 0 var\(--ab-play-glow,6px\) color-mix\(in srgb,var\(--play\) 55%,transparent\)\)/);
		assert.match(filterRules[0][2], /stroke-width:2\.2/);
		const name = effects.match(/@keyframes ([\w-]+)/)?.[1];
		assert.ok(name);
		assert.ok(!names.has(name)); names.add(name);
		assert.ok(effects.includes(`${root}.ab-playing [data-ab-part].ab-current .e{stroke-dasharray:8 6;animation:${name} .7s linear infinite}`));
		assert.ok(effects.includes(`@keyframes ${name}{from{stroke-dashoffset:0}to{stroke-dashoffset:-14}}`));
		assert.match(effects, /@media \(prefers-reduced-motion:reduce\).*animation:none.*transition:none/);
		// Every effect selector is local. Only keyframes may escape the root;
		// running dashes require playing, and transitions only exist while playing.
		for (const [, selector, body] of effects.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
			if (selector === "from" || selector === "to") continue;
			for (const item of selector.split(/,(?=\.ab\[)/)) assert.ok(item.startsWith(root), item);
			if (/transition:|animation:/.test(body)) assert.ok(selector.includes(".ab-playing"));
			if (/stroke-dasharray:/.test(body)) assert.equal(selector, `${root}.ab-playing [data-ab-part].ab-current .e`);
		}
		assert.doesNotMatch(effects, /\.knockout|\.gap-band|\.ab-played|filter:[^{}]+\}[^{]*\.arrow/);
	}
});

test("playback current and played defaults reach WCAG sRGB 4.5:1 on canvas and band", () => {
	function luminance(hex: string) {
		const channels = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
		return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
	}
	for (const [scheme, palette, defaults] of [["light", LIGHT, ["#0a7a60", "#596e81"]], ["dark", DARK, ["#6ff0cf", "#5f9e8a"]]] as const) {
		const svg = render(source, { scheme }).svg;
		for (const [i, token] of ["play", "play-done"].entries()) {
			const colour = svg.match(new RegExp(`--${token}:var\\(--ab-${token},(#[0-9a-f]+)\\)`))?.[1];
			assert.equal(colour, defaults[i]);
			for (const ground of [palette.bg, palette.band]) {
				const a = luminance(colour as string), b = luminance(ground);
				const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
				assert.ok(ratio >= 4.5, `${scheme} ${token} on ${ground}: ${ratio}`);
			}
		}
		assert.ok(!Object.hasOwn(palette, "play"), "playback stays outside the static palette");
	}
});
