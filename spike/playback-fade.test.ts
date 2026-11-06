import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { render } from "./flow/index.ts";
import { createPlayer, mountPlayback } from "./flow/playback.ts";
import { Doc, El } from "./test-dom.ts";

const example = readFileSync(new URL("./examples/playback-fade.flow", import.meta.url), "utf8");
const crossing = readFileSync(new URL("./playground/playback-crossings.flow", import.meta.url), "utf8");

function setup(mounted: boolean, idPrefix = "fade", loop = false, doc = new Doc()) {
	const result = render(example, { idPrefix });
	assert.deepEqual(result.diagnostics, []);
	const container = new El("main", doc);
	const svg = new El("svg", doc);
	svg.className = "ab ab-auto";
	svg.setAttribute("data-ab-play", idPrefix);
	for (const match of result.svg.matchAll(/<g data-ab-part="([^"]+)">/g)) {
		const wrapper = new El("g", doc);
		wrapper.setAttribute("data-ab-part", match[1]);
		svg.append(wrapper);
	}
	container.append(svg);
	const mount = mounted ? mountPlayback(container as unknown as HTMLElement, svg as unknown as SVGSVGElement, result.timelines, { loop }) : undefined;
	const player = mount?.player ?? createPlayer(svg as unknown as SVGSVGElement, result.timelines, { loop });
	function frame(step: number, scenario = 0) {
		assert.equal(player.state.step, step);
		assert.equal(player.state.scenario, scenario);
		assert.equal(svg.classList.contains("ab-in-progress"), step >= 0);
		const steps = result.timelines[scenario].steps;
		const current = steps[step]?.parts ?? [];
		const played = steps.slice(0, Math.max(0, step)).flatMap(s => s.parts);
		for (const wrapper of svg.children) {
			const part = wrapper.getAttribute("data-ab-part") ?? "";
			assert.equal(wrapper.classList.contains("ab-current"), current.includes(part), part);
			assert.equal(wrapper.classList.contains("ab-played"), played.includes(part) && !current.includes(part), part);
		}
	}
	return { ...result, container, svg, doc, player, mount, frame };
}

test("embedded fade rules scope to each figure, composite whole parts and exempt inline gaps", () => {
	for (const scheme of [undefined, "light", "dark"] as const) {
		for (const idPrefix of ["first", "second"]) {
			const { svg, diagnostics } = render(example, { scheme, idPrefix });
			assert.deepEqual(diagnostics, []);
			const styles = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
			const selector = `.ab[data-ab-play="${idPrefix}"].ab-in-progress [data-ab-part]:not(.ab-current):not(.ab-played)`;
			const fadeRules = styles.match(/[^{}]+\{opacity:[^}]+\}/g);
			assert.deepEqual(fadeRules, [
				`${selector}:not(:has(.gap)){opacity:.3}`,
				`${selector}:has(.gap) text{opacity:.3}`,
			]);
			assert.match(styles, /\.ab \.gap\{fill:var\(--bg\)\}\.ab \.gap-band\{fill:var\(--band\)\}/);
			assert.match(styles, /\.ab-playing/);
			assert.doesNotMatch(svg.match(/<svg[^>]*>/)?.[0] ?? "", /ab-in-progress/);
			assert.equal(svg, render(example, { scheme, idPrefix }).svg);
		}
	}
});

test("pre-fade drawing and style bytes survive added fade/effects CSS and playback defaults", () => {
	// Captured from spike/out/loop-play.svg at 559775a720de6543ad0cf033df7973d6f32216e2.
	// The existing pre-playback.json.gz static baseline stays unchanged too.
	const before = gunzipSync(readFileSync(new URL("./fixtures/pre-fade-loop-play.svg.gz", import.meta.url))).toString()
		.replaceAll("#2869b8", "#0a7a60").replaceAll("#88baff", "#6ff0cf")
		// Tone-keeping playback dropped the current/played recolouring and heads.
		.replace(/--play-done:var\(--ab-play-done,#[0-9a-f]+\);/g, "")
		.replace(/\.ab\[data-ab-play="[^"]+"\] \[data-ab-part\]\.ab-(?:played|current) [^{}]+\{[^{}]*\}/g, "")
		.replace(/\.ab \.play-head-(?:played|current)\{[^{}]*\}/g, "")
		.replace(/\n<marker id="[^"]+-play-(?:played|current)"[\s\S]*?<\/marker>/g, "");
	const source = readFileSync(new URL("./examples/loop-play.flow", import.meta.url), "utf8");
	const after = render(source, { idPrefix: "loop-play" }).svg;
	const rules = /\.ab\[data-ab-play="loop-play"\]\.ab-in-progress [^{}]+\{opacity:\.3\}/g;
	assert.equal(after.match(rules)?.length, 2);
	// The final style line adds motion/glow; playback-effects.test.ts checks
	// its scope and guards and compares the complete post-112 baseline.
	const styles = after.match(/<style>([\s\S]*?)<\/style>/)?.[1];
	assert.ok(styles);
	const withoutEffects = after.replace(styles, styles.split("\n").slice(0, -1).join("\n"));
	assert.equal(withoutEffects.replace(rules, ""), before);
});

test("fade fixture covers all six node kinds and opaque inline gaps without geometry changes", () => {
	const playable = render(example);
	const plain = render(example.split('\nplay "Request"')[0]);
	assert.deepEqual(playable.diagnostics, []);
	assert.deepEqual(plain.diagnostics, []);
	assert.deepEqual(new Set(playable.layout.nodes.map(p => p.node.kind)), new Set(["text", "pill", "box", "decision", "panel", "end"]));
	assert.deepEqual(playable.layout, plain.layout);
	assert.equal(playable.svg.match(/class="gap"/g)?.length, 2);
	assert.equal(playable.svg.match(/class="gap gap-band"/g)?.length, 3);
	const shapes = (svg: string) => svg.replace(/<style>[\s\S]*?<\/style>|<defs>[\s\S]*?<\/defs>|<g data-ab-part="[^"]+">|<\/g>/g, "");
	assert.equal(shapes(playable.svg).replace(' data-ab-play="ab"', ""), shapes(plain.svg));
	for (const label of playable.svg.matchAll(/<g data-ab-part="edge-\d+">(<g>[\s\S]*?<\/g>)<\/g>/g)) {
		assert.match(label[1], /<rect[^>]*class="gap(?: gap-band)?"\/>/);
		assert.match(label[1], /<text /);
		assert.doesNotMatch(label[1], /opacity/);
	}
});

test("playground crossings retain only their expected warnings and unfaded canvas/band knockouts", () => {
	for (const scheme of ["light", "dark"] as const) {
		const { svg, diagnostics, layout } = render(crossing, { scheme });
		assert.deepEqual(diagnostics, [
			{ line: 18, severity: "warning", message: "edge west → east crosses north → south" },
			{ line: 20, severity: "warning", message: "edge band-west → band-east crosses band-north → band-south" },
		]);
		assert.equal(svg.match(/class="knockout"/g)?.length, 1);
		assert.equal(svg.match(/class="knockout knockout-band"/g)?.length, 1);
		assert.match(svg, /\.ab \.knockout\{fill:none;stroke:var\(--bg\);stroke-width:5\.6\}\.ab \.knockout-band\{stroke:var\(--band\)\}/);
		const plain = render(crossing.split('\nplay "Vertical paths"')[0], { scheme });
		assert.deepEqual(layout, plain.layout);
		assert.deepEqual(svg.match(/<path[^>]*class="knockout[^>]+/g), plain.svg.match(/<path[^>]*class="knockout[^>]+/g));
		for (const wrapper of svg.matchAll(/<g data-ab-part="[^"]+">([\s\S]*?)<\/g>/g)) assert.doesNotMatch(wrapper[1], /knockout/);
		assert.ok(svg.lastIndexOf('class="knockout') < svg.indexOf('class="arrow"'));
	}
});

for (const mounted of [false, true]) {
	const api = mounted ? "mount.player" : "createPlayer";
	test(`${api}: every rendered fragment follows navigation, scenarios, paused/ended/replay and loops`, t => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const f = setup(mounted);
		t.after(() => f.player.destroy());
		assert.equal(f.svg.children.length, 21, "six nodes and five stroke/head/label triples");
		f.frame(-1);
		f.player.play(); f.frame(0);
		f.player.pause(); f.frame(0);
		assert.equal(f.player.state.status, "paused");
		for (let i = 0; i < 6; i++) { f.player.seek(i); f.frame(i); }
		f.player.previous(); f.frame(4);
		f.player.next(); f.frame(5);
		f.player.play();
		t.mock.timers.tick(1800);
		assert.equal(f.player.state.status, "ended"); f.frame(-1);
		f.player.play(); f.frame(0);
		f.player.select(1); f.frame(0, 1);
		f.player.seek(2); f.frame(2, 1);
		f.player.select(0); f.frame(0);
		f.player.select(2); f.frame(-1, 2);
		f.player.play(); f.frame(-1, 2);
		f.player.next(); f.frame(-1, 2);
		f.player.select(0); f.player.seek(-1); f.frame(-1);
		f.player.next(); f.frame(0);
		f.player.previous(); f.frame(-1);
		const looping = setup(mounted, "looping", true);
		t.after(() => looping.player.destroy());
		looping.player.play();
		for (let i = 1; i < 6; i++) { t.mock.timers.tick(1800); looping.frame(i); }
		t.mock.timers.tick(1800); looping.frame(0);
		assert.equal(looping.player.state.status, "playing");
	});

	test(`${api}: reduced-motion resets are unfaded, manual steps still fade, disabling never restarts`, t => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const f = setup(mounted);
		t.after(() => f.player.destroy());
		f.doc.motion.set(true);
		f.player.play(); f.frame(-1);
		f.player.next(); f.frame(0);
		f.doc.motion.set(false);
		t.mock.timers.tick(60000); f.frame(0);
		assert.equal(f.player.state.status, "paused");
		f.player.play(); t.mock.timers.tick(1800); f.frame(1);
		f.doc.motion.set(true); f.frame(-1);
		assert.equal(f.player.state.status, "idle");
		f.doc.motion.set(false); t.mock.timers.tick(60000); f.frame(-1);
		f.player.select(1); f.frame(0, 1);
		f.doc.motion.set(true); f.player.play(); f.frame(-1, 1);
	});

	test(`${api}: repeated current parts take precedence over played parts on every fragment`, () => {
		const f = setup(mounted);
		f.timelines[0].steps.push(f.timelines[0].steps[1]);
		f.player.seek(6); f.frame(6);
		const parts = f.svg.children.filter(el => el.getAttribute("data-ab-part") === "edge-0");
		assert.equal(parts.length, 3);
		assert.ok(parts.every(el => el.classList.contains("ab-current") && !el.classList.contains("ab-played")));
		f.player.destroy(); f.frame(-1);
	});

	test(`${api}: destruction restores idle from every status and figures remain independent`, t => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		for (const status of ["idle", "playing", "paused", "ended"]) {
			for (const throughMount of mounted ? [false, true] : [false]) {
				const doc = new Doc();
				const one = setup(mounted, "first", false, doc);
				const two = setup(mounted, "second", false, doc);
				two.player.select(1); two.player.seek(1);
				if (status !== "idle") one.player.play();
				if (status === "paused") one.player.pause();
				if (status === "ended") {
					one.player.seek(5); one.player.play(); t.mock.timers.tick(1800);
				}
				assert.equal(one.player.state.status, status);
				if (throughMount) one.mount?.destroy(); else one.player.destroy();
				one.frame(-1); two.frame(1, 1);
				assert.equal(one.container.children.length, 1);
				one.player.play(); one.player.next(); one.player.select(0);
				t.mock.timers.tick(60000); one.frame(-1); two.frame(1, 1);
				two.player.destroy(); two.frame(-1, 1);
			}
		}
	});
}
