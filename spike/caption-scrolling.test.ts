import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Timeline } from "./flow/play.ts";
import { mountPlayback } from "./flow/playback.ts";
import { Doc, El } from "./test-dom.ts";

const long = "A complete caption with enough words to overflow the figure. ".repeat(12);
const timelines: Timeline[] = [
	{ name: "Captions", slug: "captions", steps: [
		{ target: "a", kind: "box", actor: "Author", caption: "Short", ms: 100, parts: ["a"] },
		{ target: "a", kind: "box", actor: "Reviewer", caption: long, ms: 100, parts: ["a"] },
		{ target: "a", kind: "box", actor: "", caption: "", ms: 100, parts: ["a"] },
	] },
	{ name: "Last long caption", slug: "last", steps: [
		{ target: "a", kind: "box", actor: "Other", caption: long, ms: 100, parts: ["a"] },
	] },
	{ name: "Empty", slug: "empty", steps: [] },
];

function setup(t: TestContext, data = timelines) {
	const doc = new Doc();
	const container = new El("main", doc);
	const svg = new El("svg", doc);
	container.append(svg);
	const mount = mountPlayback(container as unknown as HTMLElement, svg as unknown as SVGSVGElement, data);
	t.after(() => mount.destroy());
	const all = container.all();
	const cls = (name: string) => all.find(el => el.classList.contains(name)) as El;
	return { doc, container, all, cls, player: mount.player, caption: cls("abp-caption"), status: cls("abp-status") };
}

test("caption reserves a single scrollable line, native scrollbar space and geometry-free visible focus", t => {
	const f = setup(t);
	const css = f.all.find(el => el.tag === "style")?.textContent ?? "";
	const rule = (selector: string) => css.split(`${selector}{`)[1]?.split("}")[0] ?? "";
	const caption = rule(".ab-playback .abp-caption");
	assert.match(caption, /white-space:nowrap(?:;|$)/);
	assert.match(caption, /min-width:0(?:;|$)/);
	assert.match(caption, /min-height:1\.45em(?:;|$)/);
	assert.match(caption, /line-height:1\.45(?:;|$)/);
	assert.match(caption, /overflow-x:scroll(?:;|$)/, "reserve native scrollbar space in every state");
	assert.match(caption, /overflow-y:hidden(?:;|$)/);
	assert.match(caption, /scroll-behavior:auto(?:;|$)/);
	assert.equal(rule(".ab-playback .abp-caption:empty::before"), 'content:"\\00a0"', "blank captions still create a line box above the scrollbar");
	assert.match(rule(".ab-playback .abp-step"), /grid-template-rows:20px auto(?:;|$)/, "actor row stays reserved");
	const focus = rule(".ab-playback .abp-caption:focus-visible");
	assert.match(focus, /outline:2px solid var\(--abp-play\)/);
	assert.match(focus, /outline-offset:3px/);
	assert.doesNotMatch(focus, /(?:padding|border|height|margin):/);
});

test("caption keeps its named region tab stop and controls across idle, short, long, blank and empty", t => {
	for (const data of [timelines, [timelines[0]], [timelines[2]]]) {
		const f = setup(t, data);
		const check = (text: string) => {
			assert.equal(f.caption.textContent, text);
			assert.equal(f.caption.tabIndex, 0);
			assert.equal(f.caption.getAttribute("role"), "region");
			assert.equal(f.caption.getAttribute("aria-label"), "Step caption");
			assert.equal(f.caption.getAttribute("aria-live"), null);
			assert.deepEqual(f.container.all(), f.all, "the controls retain DOM identity and order");
			const previous = f.all.find(el => el.getAttribute("aria-label") === "Previous") as El;
			assert.ok(f.all.indexOf(f.caption) < f.all.indexOf(previous));
			assert.deepEqual(f.cls("abp-step").children.map(el => el.className), ["abp-counter", "abp-actor", "abp-caption"]);
			assert.equal(f.cls("abp-actions").all().filter(el => el.tag === "button").length, 3);
			assert.equal(f.all.filter(el => el.type === "range").length, 1);
		};
		check(data[0].steps.length ? "" : "No playable steps");
		if (data[0].steps.length) {
			f.player.next(); check("Short");
			f.player.next(); check(long);
			f.player.next(); check("");
			assert.equal(f.cls("abp-actor").textContent, "");
			f.player.seek(-1); check("");
			if (data.length > 1) { f.player.select(2); check("No playable steps"); }
		}
	}
});

test("step/scenario changes reset caption scrolling; same-step pause, resume and end preserve it", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const f = setup(t);
	f.caption.focus();
	f.caption.scrollLeft = 32;
	f.player.next();
	assert.equal(f.caption.scrollLeft, 0);
	f.caption.scrollLeft = 32;
	f.player.next();
	assert.equal(f.caption.scrollLeft, 0);
	assert.equal(f.status.textContent, `Reviewer: ${long}`);
	const writes = f.caption.writes;
	f.caption.scrollLeft = 120;
	f.player.play(); f.player.pause(); f.player.play();
	assert.equal(f.caption.scrollLeft, 120);
	assert.equal(f.caption.writes, writes, "same-step changes must not replace the text node and disturb native scrolling");
	t.mock.timers.tick(100);
	assert.equal(f.caption.scrollLeft, 0);
	assert.equal(f.caption.textContent, "");
	f.player.select(1);
	f.caption.scrollLeft = 120;
	f.player.play();
	t.mock.timers.tick(100);
	assert.equal(f.player.state.status, "ended");
	assert.equal(f.caption.scrollLeft, 120);
	f.player.select(0);
	assert.equal(f.caption.scrollLeft, 0);
	f.player.seek(0);
	f.caption.scrollLeft = 120;
	f.player.select(1); // Same step index, different scenario.
	assert.equal(f.caption.scrollLeft, 0);
	f.caption.scrollLeft = 120;
	f.player.seek(-1);
	assert.equal(f.caption.scrollLeft, 0);
	f.player.seek(0);
	f.caption.scrollLeft = 120;
	f.player.play();
	f.doc.motion.set(true);
	assert.equal(f.caption.scrollLeft, 0);
	f.player.next();
	f.caption.scrollLeft = 120;
	f.player.pause();
	assert.equal(f.caption.scrollLeft, 120);
	assert.equal(f.doc.activeElement, f.caption);
});

test("caption scrolling and bubbling navigation keys never announce, move focus or control playback", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const f = setup(t);
	f.player.seek(1);
	f.caption.focus();
	assert.equal(f.status.getAttribute("role"), "status");
	assert.equal(f.status.getAttribute("aria-live"), "polite");
	assert.equal(f.status.getAttribute("aria-atomic"), "true");
	assert.equal(f.status.textContent, `Reviewer: ${long}`);
	assert.equal(f.all.filter(el => el.getAttribute("aria-live")).length, 1);
	const writes = f.status.writes;
	for (const playing of [false, true]) {
		if (playing) f.player.play();
		const state = f.player.state;
		for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
			assert.equal(f.caption.fire("keydown", key), false, `${key} must retain native scrolling through ancestor listeners`);
			assert.deepEqual(f.player.state, state);
			assert.equal(f.doc.activeElement, f.caption);
		}
		f.caption.scrollLeft = 120;
		f.caption.fire("scroll");
		assert.equal(f.status.writes, writes);
		assert.deepEqual(f.player.state, state);
		assert.equal(f.doc.activeElement, f.caption);
	}
	t.mock.timers.tick(100);
	assert.equal(f.status.textContent, "");
	assert.equal(f.doc.activeElement, f.caption);
});
