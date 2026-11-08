import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { checkPalette, DARK, LIGHT, render } from "../src/index.ts";
import { TONES } from "../src/parse.ts";
import { createPlayer, mountPlayback } from "../src/playback.ts";
import { inspect } from "./inspect-paints.ts";
import { Doc, El } from "./test-dom.ts";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const styles = ["branches", "ladder"] as const;
const schemes = [undefined, "light", "dark"] as const;
const diagram = (style: string) => `fan-out v0
style ${style}
step "Choose"
outcome "Done" reason="Checks passed" destination="Review" tone="done"
outcome "Blocked" reason="Needs a person" destination="Ask" tone="stop"
outcome "Later" reason="Wait" destination="Queue"
`;
const plays = `play "Röute"
 tempo 100ms
 step "Done" "First caption"
 step "Blocked" 200ms actor="Maintainer" "Last caption"
play "Röute"
 step "Later"
play "Empty"
`;
const parts = (svg: string) => new Map([...svg.matchAll(/<g[^>]*data-ab-part="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g)].map(m => [m[1], m[2]]));

test("historical static fan-outs retain every SVG byte in all schemes and have no timelines", () => {
	const baseline = JSON.parse(gunzipSync(readFileSync(new URL("./golden/pre-sequence-playback.json.gz", import.meta.url))).toString()) as {
		fixtures: { file: string; outputs: string[] }[];
	};
	const fixtures = baseline.fixtures.filter(f => /^fan-out v0/m.test(read(`../examples/${f.file}`)));
	assert.equal(fixtures.length, 3);
	for (const f of fixtures) for (const [i, scheme] of schemes.entries()) {
		const result = render(read(`../examples/${f.file}`), { scheme, idPrefix: f.file.slice(0, -5) });
		assert.equal(result.svg, f.outputs[i]);
		assert.deepEqual(result.timelines, []);
	}
});

for (const style of styles) {
	test(`${style}: shared naming/order, exact parsed targets, actor overrides and original-line recovery`, () => {
		const targets = [" Exact  text ", "Exact text", "exact text", 'Quote " and \\ slash', "Line\nBreak", "Repeat", "Repeat", "", " \t "];
		const source = `fan-out v0\nstyle ${style}\nstep "Choose"\n${targets.map(t => `outcome ${JSON.stringify(t)} reason="Why" destination="Next"`).join("\n")}\n`;
		const attempted = [...targets.slice(0, 5), "Repeat", "", " \t ", "[missing outcome]", "EXACT TEXT", "unknown", targets[0]];
		const play = `play "Röute"\n tempo 800ms\n${attempted.map(t => ` step ${JSON.stringify(t)}`).join("\n")}\nplay "Röute"\n step "Exact text" 100ms actor="Custom" "Caption"\nplay\n`;
		const result = render(source + play);
		assert.deepEqual(result.timelines.map(t => [t.name, t.slug]), [["Röute", "route"], ["Röute", "route-2"], ["Scenario 3", "scenario-3"]]);
		assert.deepEqual(result.timelines[0].steps.map(s => [s.target, s.actor, s.kind, s.ms]), [...targets.slice(0, 5), targets[0]].map(t => [t, t, "outcome", 800]));
		assert.deepEqual(result.timelines[1].steps[0], { target: "Exact text", kind: "outcome", actor: "Custom", caption: "Caption", ms: 100,
			parts: ["fanout-step", ...(style === "ladder" ? ["fanout-rail"] : []), "outcome-1"] });
		const playbackErrors = result.diagnostics.filter(d => /playback target/.test(d.message));
		const firstPlayStep = source.split("\n").length + 2;
		assert.deepEqual(playbackErrors.map(d => d.line), [5, 6, 7, 8, 9, 10].map(i => firstPlayStep + i));
		assert.match(playbackErrors[0].message, /ambiguous/);
		assert.ok(playbackErrors.slice(1).every(d => d.message.includes("unknown")));
		assert.equal(parts(result.svg).size, targets.length + (style === "ladder" ? 2 : 1), "all entries draw, including ambiguous and missing ones");
		// A genuine outcome with this text can be selected; a synthetic label cannot.
		const real = render(`${source}outcome "[missing outcome]" reason="Why" destination="Next"\nplay\n step "[missing outcome]"\n`);
		assert.equal(real.timelines[0].steps[0].parts.at(-1), "outcome-9");
	});

	test(`${style}: shared play parser recovery and independent outcomes`, () => {
		const source = `${diagram(style)}play\n tempo 800ms\n step "Later" 99ms\n step "Done" actor="bad\\q"\n step "Blocked"\n step "Later"\n step "Later"\n`;
		const result = render(source);
		assert.deepEqual(result.diagnostics.map(d => d.line), [9, 10]);
		assert.deepEqual(result.timelines[0].steps.map(s => [s.target, s.ms]), [["Later", 800], ["Blocked", 800], ["Later", 800], ["Later", 800]]);
		assert.deepEqual(result.timelines[0].steps[0].parts, result.timelines[0].steps.at(-1)?.parts);
	});

	test(`${style}: complete entry parts include rejected source, shared elements stay separate`, () => {
		const result = render(`${diagram(style)}outcome "Partial" reason="Why" destination="Next" extra="Retained"\ninvalid below\nplay\n step "Partial"\n`);
		const groups = parts(result.svg);
		assert.equal(groups.size, style === "ladder" ? 6 : 5);
		assert.match(groups.get("fanout-step") ?? "", /<rect.*class="k-agent"/);
		assert.match(groups.get("fanout-step") ?? "", />Choose<\/text>/);
		const entry = groups.get("outcome-3") ?? "";
		for (const word of ["Partial", "Why", "Next", "Retained"]) assert.ok(entry.includes(word), word);
		assert.match(entry, /class="m s12 t-stop"/);
		assert.doesNotMatch([...groups.values()].join(""), /invalid below/);
		assert.match(result.svg, /invalid below/);
		if (style === "ladder") {
			assert.match(groups.get("fanout-rail") ?? "", /<path .*class="e e-ink"/);
			assert.match(entry, /<circle .*r="6"/);
			assert.match(entry, /<line .*class="rule"/);
		} else {
			assert.equal(entry.match(/<path /g)?.length, 2, "branch and effect arrow");
			assert.match(entry, /<rect .*class="pill"/);
		}
		for (const step of result.timelines[0].steps) for (const part of step.parts) assert.ok(groups.has(part), part);
	});

	test(`${style}: resolution preserves custom mono metrics and unchanged layout/drawing`, () => {
		const target = " Wide  outcome ".repeat(5);
		const source = `${diagram(style)}outcome ${JSON.stringify(target)} reason="Reason" destination="Destination"\n`;
		const calls: string[] = [];
		const options = { fonts: { mono: { family: "Wide Mono", measureText: (text: string) => { calls.push(text); return [...text].length * 24; } }, text: { family: "Unused", measureText: () => { throw new Error("must use mono"); } } } };
		const plain = render(source, options);
		const before = [...calls]; calls.length = 0;
		const playable = render(`${source}play\n step ${JSON.stringify(target)}\n`, options);
		assert.deepEqual(calls, before, "playback adds no text measurement or layout pass");
		assert.deepEqual(playable.layout, plain.layout);
		assert.equal(playable.timelines[0].steps[0].target, target);
		const drawing = (svg: string) => svg.replace(/<style>[\s\S]*?<\/style>/, "").replace(/ data-ab-play="[^"]*"| data-ab-part="[^"]*"/g, "").replace(/<g>|<\/g>/g, "");
		assert.equal(drawing(playable.svg).replace(/\n+/g, "\n"), drawing(plain.svg).replace(/\n+/g, "\n"));
		assert.notEqual(playable.layout.height, render(source).layout.height, "host metrics actually alter wrapping");
	});

	test(`${style}: current-only glow, native paints, scoped fading/dashes and preference guards`, () => {
		for (const scheme of schemes) for (const idPrefix of ["first", "1:<unsafe>."]) {
			const { svg } = render(diagram(style) + plays, { scheme, idPrefix });
			assert.equal(svg, render(diagram(style) + plays, { scheme, idPrefix }).svg);
			const id = svg.match(/data-ab-play="([^"]+)"/)?.[1];
			const root = `.ab[data-ab-play="${id}"]`;
			const outcome = '[data-ab-part^="outcome-"]';
			const css = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
			const unplayed = `${root}.ab-in-progress [data-ab-part]${outcome}:where(:not(.ab-current):not(.ab-played))`;
			assert.ok(css.includes(`${unplayed} :is(rect:not(.gap),path:not(.knockout),circle,line){opacity:var(--ab-play-unreached-opacity,.3)}`));
			assert.ok(css.includes(`${unplayed} text{opacity:var(--ab-play-unreached-text-opacity,.8)}`));
			assert.ok(css.includes(`@media (prefers-contrast:more),(forced-colors:active){${unplayed} text{opacity:1}}`));
			const effects = css.split("\n").at(-1) ?? "";
			assert.ok(effects.includes(`${root} ${outcome}.ab-current :is(rect,.e,circle){filter:drop-shadow(`));
			assert.ok(effects.includes(`${root} ${outcome}.ab-current :is(rect,.e){stroke-width:2.2}`));
			assert.ok(effects.includes(`${root} ${outcome}:has(rect.k-done){color:var(--done)}`));
			assert.ok(effects.includes(`${root} [data-ab-part]:has(circle.t-done){color:var(--done)}`));
			assert.ok(effects.includes(`${root} [data-ab-part]{color:var(--play)}`));
			assert.match(css, /--play:var\(--ab-play,#[0-9a-f]+\)/);
			assert.ok(effects.includes(`${root}.ab-playing ${outcome}.ab-current .e{stroke-dasharray:8 6;animation:`));
			assert.match(effects, /@media \(prefers-reduced-motion:reduce\).*animation:none;stroke-dasharray:none.*transition:none/);
			assert.doesNotMatch(effects, /\.rule|transform|\bfill:|\bstroke:|fanout-step|fanout-rail|ab-played/);
			for (const [, selector, body] of effects.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
				if (selector === "from" || selector === "to") continue;
				assert.ok(selector.startsWith(root), selector);
				if (/filter:|stroke-width:|animation:|transition:/.test(body)) assert.ok(selector.includes(outcome), selector);
				if (/filter:|stroke-width:|animation:/.test(body)) assert.ok(selector.includes(".ab-current"));
			}
		}
	});
}

test("fan-out text paints over independently faded fills are checked at each state's threshold", () => {
	for (const style of styles) for (const [scheme, palette, play] of [["light", LIGHT, "#0a7a60"], ["dark", DARK, "#6ff0cf"]] as const) {
		for (const tone of [...TONES, undefined]) for (const fade of [0, 0.3, 1]) for (const preference of [false, true]) {
			const source = `fan-out v0\nstyle ${style}\nstep "Shared"\noutcome "Outcome" reason="Reason" destination="Destination" ${tone ? `tone="${tone}"` : ""} extra="Rejected"\ninvalid below\nplay\n step "Outcome"\n`;
			const result = render(source, { scheme });
			const textFade = preference ? 1 : 0.8;
			const pairs = checkPalette(palette, { play, unreachedOpacity: fade, unreachedTextOpacity: textFade }).pairs;
			for (const state of ["current", "played", "unplayed"] as const) {
				const svg = result.svg.replace(`class="ab ab-${scheme}"`, `class="ab ab-${scheme} ab-in-progress"`)
					.replace('data-ab-part="outcome-0"', `data-ab-part="outcome-0"${state === "unplayed" ? "" : ` class="ab-${state}"`}`);
				const observations = inspect(svg, fade, preference ? 0.1 : 0.8, preference);
				assert.ok(observations.some(p => p.state === state && p.classes.includes("t-stop")), "partial-entry rejected text is observed");
				assert.ok(observations.some(p => !p.state && p.classes.includes("t-stop")), "invalid lines outside parts stay full opacity");
				for (const p of observations) {
					const threshold = p.state === "unplayed" && !preference ? 3 : 4.5;
					const witness = pairs.find(pair => pair.ink === p.ink && JSON.stringify(pair.ground) === JSON.stringify(p.ground)
						&& JSON.stringify(pair.groundOpacities ?? pair.ground.map(() => 1)) === JSON.stringify(p.groundOpacities)
						&& (pair.inkOpacity ?? 1) === p.inkOpacity && pair.threshold === threshold);
					assert.ok(witness, `${style}/${scheme}/${tone}/${state}: uncovered ${JSON.stringify(p)}`);
					assert.ok(witness.ratio >= threshold, `${witness.where}: ${witness.ratio}`);
				}
			}
		}
	}
});

for (const style of styles) for (const layout of ["headless", "below", "side"] as const) {
	test(`${style}, ${layout}: current/played, completion, Replay, full figure, scenarios and reduced motion`, t => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const result = render(diagram(style) + plays);
		assert.deepEqual(result.diagnostics, []);
		const doc = new Doc(), container = new El("main", doc), svg = new El("svg", doc);
		svg.className = "ab ab-auto";
		for (const name of parts(result.svg).keys()) {
			const part = new El("g", doc); part.setAttribute("data-ab-part", name); svg.append(part);
		}
		container.append(svg);
		const mount = layout === "headless" ? undefined : mountPlayback(container as unknown as HTMLElement, svg as unknown as SVGSVGElement, result.timelines, { layout });
		const player = mount?.player ?? createPlayer(svg as unknown as SVGSVGElement, result.timelines);
		t.after(() => mount ? mount.destroy() : player.destroy());
		const part = (name: string) => svg.children.find(p => p.getAttribute("data-ab-part") === name) as El;
		const control = (name: string) => {
			const button = container.all().find(el => el.tag === "button" && (el.getAttribute("aria-label") ?? el.textContent) === name);
			assert.ok(button, name); button.click();
		};
		const full = () => {
			assert.ok(!svg.classList.contains("ab-in-progress") && !svg.classList.contains("ab-playing"));
			assert.ok(svg.children.every(p => !p.className));
		};
		full();
		if (mount) control("Play"); else player.play();
		assert.ok(part("outcome-0").classList.contains("ab-current"));
		t.mock.timers.tick(100);
		assert.ok(part("outcome-0").classList.contains("ab-played"));
		assert.ok(!part("outcome-0").classList.contains("ab-current"));
		assert.ok(part("outcome-1").classList.contains("ab-current"));
		assert.equal(part("outcome-2").className, "");
		assert.ok(part("fanout-step").classList.contains("ab-current"), "shared parts remain on every path");
		player.pause();
		assert.equal(player.state.status, "paused");
		assert.ok(svg.classList.contains("ab-in-progress") && !svg.classList.contains("ab-playing"));
		player.play(); t.mock.timers.tick(200);
		assert.deepEqual(player.state, { scenario: 0, step: 1, status: "ended" });
		assert.ok(part("outcome-0").classList.contains("ab-played"));
		assert.ok(part("outcome-1").classList.contains("ab-current"));
		if (mount) {
			for (const [cls, text] of [["abp-actor", "Maintainer"], ["abp-caption", "Last caption"], ["abp-counter", "2/2"]]) {
				assert.equal(container.all().find(el => el.classList.contains(cls))?.textContent, text);
			}
			control("Replay");
		} else player.play();
		assert.deepEqual(player.state, { scenario: 0, step: 0, status: "playing" });
		assert.equal(part("outcome-1").className, "", "Replay clears the earlier path");
		player.seek(-1); full();
		player.select("route-2"); player.next();
		assert.equal(part("outcome-0").className, "");
		assert.ok(part("outcome-2").classList.contains("ab-current"));
		player.select("empty"); full();
		player.select(0); player.play(); t.mock.timers.tick(100); t.mock.timers.tick(200);
		doc.motion.set(true);
		if (mount) control("Replay"); else player.play();
		assert.equal(player.state.status, "idle"); full();
		player.next(); assert.equal(player.state.status, "paused");
		assert.ok(part("outcome-0").classList.contains("ab-current"));
		player.destroy(); full();
		assert.equal(doc.motion.listeners.size, 0);
	});
}

test("both playback examples and the primer form are copyable with multiple scenarios", () => {
	for (const name of ["approvals-play", "run-endings-ladder-play"]) {
		const result = render(read(`../examples/${name}.flow`));
		assert.deepEqual(result.diagnostics, []);
		assert.equal(result.timelines.length, 3);
		assert.ok(result.timelines[0].steps.length >= 3);
	}
	const primer = read("../docs/PRIMER.md").split("## Fan-out\n")[1].split("## Sequence\n")[0];
	const form = [...primer.matchAll(/```(?:text)?\n([\s\S]*?)```/g)].find(m => m[1].includes("play "))?.[1];
	assert.ok(form);
	assert.deepEqual(render(form).diagnostics, []);
	assert.equal(render(form).timelines.length, 2);
});
