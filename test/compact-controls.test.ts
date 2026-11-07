import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Timeline } from "../src/play.ts";
import { mountPlayback } from "../src/playback.ts";
import { Doc, El } from "./test-dom.ts";

const timelines: Timeline[] = [
	{ name: "First", slug: "first", steps: [
		{ target: "a", kind: "box", actor: "Author", caption: "First step", ms: 100, parts: ["a"] },
		{ target: "a", kind: "box", actor: "", caption: "Second step", ms: 100, parts: ["a"] },
		{ target: "a", kind: "box", actor: "Reviewer", caption: "Last step", ms: 100, parts: ["a"] },
	] },
	{ name: "Second", slug: "second", steps: [
		{ target: "a", kind: "box", actor: "Other", caption: "Only step", ms: 100, parts: ["a"] },
	] },
	{ name: "Empty", slug: "empty", steps: [] },
];

function setup(t: TestContext) {
	const doc = new Doc();
	const container = new El("main", doc);
	const svg = new El("svg", doc);
	container.append(svg);
	const mount = mountPlayback(container as unknown as HTMLElement, svg as unknown as SVGSVGElement, timelines);
	t.after(() => mount.destroy());
	const all = container.all();
	const cls = (name: string) => all.find(el => el.classList.contains(name)) as El;
	const tracks = all.filter(el => el.classList.contains("abp-segments"));
	const active = () => tracks.filter(el => !el.classList.contains("abp-inactive"));
	const segments = () => active()[0].children;
	const states = () => segments().map(el => el.classList.contains("abp-current") ? "current" : el.classList.contains("abp-played") ? "played" : "future");
	return { doc, container, all, cls, tracks, active, segments, states, mount, player: mount.player,
		range: all.find(el => el.type === "range") as El };
}

test("counter and segments follow direct navigation, playback, scenarios and full figure", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const f = setup(t);
	const counter = f.cls("abp-counter");
	assert.equal(counter.textContent, "");
	assert.deepEqual(f.states(), ["future", "future", "future"]);
	f.player.next();
	assert.equal(counter.textContent, "1/3");
	assert.deepEqual(f.states(), ["current", "future", "future"]);
	f.player.play();
	t.mock.timers.tick(100);
	assert.equal(counter.textContent, "2/3");
	assert.deepEqual(f.states(), ["played", "current", "future"]);
	t.mock.timers.tick(100);
	assert.equal(counter.textContent, "3/3");
	assert.deepEqual(f.states(), ["played", "played", "current"]);
	t.mock.timers.tick(100);
	assert.equal(f.player.state.status, "ended");
	assert.equal(counter.textContent, "");
	assert.deepEqual(f.states(), ["future", "future", "future"]);
	f.player.seek(-1);
	assert.equal(counter.textContent, "");
	assert.deepEqual(f.states(), ["future", "future", "future"]);
	f.range.value = "2"; f.range.fire("input");
	assert.equal(counter.textContent, "3/3");
	assert.deepEqual(f.states(), ["played", "played", "current"]);
	f.player.select(1);
	assert.equal(f.active().length, 1);
	assert.equal(counter.textContent, "1/1");
	assert.deepEqual(f.states(), ["current"]);
	assert.ok(f.tracks[0].children.every(el => !el.classList.contains("abp-current") && !el.classList.contains("abp-played")));
	f.player.select(2);
	assert.equal(counter.textContent, "");
	assert.deepEqual(f.segments(), []);
	assert.equal(f.cls("abp-caption").textContent, "No playable steps");
	assert.ok(f.range.disabled);
	f.player.select(0);
	assert.equal(counter.textContent, "1/3");
	f.player.play();
	f.doc.motion.set(true);
	assert.equal(counter.textContent, "");
	assert.deepEqual(f.states(), ["future", "future", "future"]);
});

test("pointer segments seek and pause without moving range focus or adding announcements", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const f = setup(t);
	f.range.focus();
	f.player.play();
	f.segments()[2].click();
	assert.deepEqual(f.player.state, { scenario: 0, step: 2, status: "paused" });
	assert.equal(f.range.value, "2");
	assert.equal(f.range.getAttribute("aria-valuetext"), "Step 3 of 3");
	assert.equal(f.cls("abp-counter").textContent, "3/3");
	assert.deepEqual(f.states(), ["played", "played", "current"]);
	const status = f.cls("abp-status");
	assert.equal(status.textContent, "Reviewer: Last step");
	const writes = status.writes;
	f.player.play(); f.segments()[2].click();
	assert.equal(status.writes, writes, "pause at the same step must not reannounce");
	t.mock.timers.tick(1000);
	assert.equal(f.player.state.status, "paused");
	f.segments()[0].click();
	assert.equal(f.cls("abp-counter").textContent, "1/3");
	assert.deepEqual(f.states(), ["current", "future", "future"]);
	f.player.select(1); f.player.play(); f.segments()[0].click();
	assert.deepEqual(f.player.state, { scenario: 1, step: 0, status: "paused" });
	assert.equal(f.doc.activeElement, f.range);
	assert.deepEqual(f.container.all(), f.all, "all scenario tracks retain their DOM identity");
	assert.equal(f.cls("abp-counter").getAttribute("aria-hidden"), "true");
	for (const track of f.tracks) {
		assert.equal(track.getAttribute("aria-hidden"), "true");
		for (const segment of track.children) {
			assert.equal(segment.tag, "span");
			assert.equal(segment.getAttribute("tabindex"), null);
			assert.equal(segment.getAttribute("role"), null);
		}
	}
	assert.equal(f.all.filter(el => el.getAttribute("aria-live")).length, 1);
	assert.equal(f.cls("abp-actions").all().filter(el => el.tag === "button").length, 3);
	assert.equal(f.range.parent?.tag, "label");
	assert.equal(f.range.parent?.textContent, "Step");
	assert.equal(f.range.min, "-1");
	assert.equal(f.range.max, "0");
	assert.equal(f.range.tabIndex, 0);
	assert.equal(f.range.getAttribute("aria-hidden"), null);
});

test("every control glow uses the shared switch; hidden range has a visible focus target", t => {
	const f = setup(t);
	const css = f.all.find(el => el.tag === "style")?.textContent ?? "";
	const glows = [...css.matchAll(/(?:text-shadow|box-shadow):([^;}]+)/g)];
	assert.equal(glows.length, 2);
	for (const glow of glows) {
		assert.match(glow[1], /0 0 var\(--ab-play-glow,/);
		assert.match(glow[1], /color-mix\(in srgb,var\(--abp-play\)/);
	}
	assert.match(css, /\.abp-navigation:focus-within/);
	assert.match(css, /\.abp-counter:empty\{visibility:hidden\}/);
});
