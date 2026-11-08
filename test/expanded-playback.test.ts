import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mountPlayback } from "../src/playback.ts";
import type { Timeline } from "../src/play.ts";
import { Doc, El } from "./test-dom.ts";

const timelines: Timeline[] = [
	{ name: "First", slug: "first", steps: [
		{ target: "a", kind: "box", actor: "Author", caption: "First remark", ms: 100, parts: ["a"] },
		{ target: "b", kind: "box", actor: "Reviewer", caption: "Second remark", ms: 200, parts: ["b"] },
	] },
	{ name: "Second", slug: "second", steps: [
		{ target: "b", kind: "box", actor: "Other actor", caption: "Other remark", ms: 300, parts: ["b"] },
	] },
	{ name: "Empty", slug: "empty", steps: [] },
];

function setup(t: TestContext, options: { expand?: boolean; autoplay?: boolean; pauseWhenOffscreen?: boolean; loop?: boolean; layout?: "auto" | "below" | "side" } = {}, data = timelines) {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const doc = new Doc();
	const container = new El("main", doc);
	const host = new El("button", doc);
	const figure = new El("div", doc);
	const svg = new El("svg", doc);
	svg.className = "ab ab-auto";
	svg.setAttribute("aria-label", "A playable flow <safe>");
	svg.setAttribute("width", "1200"); svg.setAttribute("height", "1500");
	for (const name of ["a", "b"]) {
		const part = new El("g", doc);
		part.setAttribute("data-ab-part", name);
		svg.append(part);
	}
	figure.append(svg);
	container.append(host, figure);
	const original = container.all();
	const mount = mountPlayback(container as unknown as HTMLElement, svg as unknown as SVGSVGElement, data, options);
	t.after(() => mount.destroy());
	const find = (cls: string) => container.all().find(el => el.classList.contains(cls)) as El;
	const button = (text: string) => container.all().find(el => el.tag === "button" && el.textContent === text) as El;
	const dialog = () => container.all().find(el => el.tag === "dialog") as El;
	return { mount, player: mount.player, doc, container, host, figure, svg, original, find, button, dialog,
		tick: (ms: number) => t.mock.timers.tick(ms) };
}

test("optional Expand row leaves the three actions intact; both entries open one labelled native dialog", t => {
	const f = setup(t, { expand: true });
	const controls = f.find("ab-playback");
	const inlineFigure = f.svg.parent;
	const expand = f.button("Expand");
	assert.equal(expand.type, "button");
	assert.equal(f.find("abp-controls").children[0], expand.parent);
	assert.equal(expand.parent?.className, "abp-expand");
	assert.deepEqual(f.find("abp-actions").children.slice(0, 3).map(el => el.getAttribute("aria-label") ?? el.textContent), ["Previous", "Play", "Next"]);
	expand.click();
	const dialog = f.dialog();
	assert.equal(dialog.open, true);
	assert.equal(dialog.getAttribute("aria-label"), "A playable flow <safe>");
	assert.equal(f.doc.activeElement, f.button("Close"));
	assert.equal(f.button("Close").autofocus, true);
	assert.equal(f.find("abp-expand").hidden, true);
	assert.equal(dialog.children[2], controls);
	assert.equal(f.svg.parent, f.find("abp-figure"));
	// The fake drawing region has no size, so the figure opens at Fit's 25% floor.
	assert.equal(f.find("abp-figure").style.properties.get("--abv-width"), "300px");
	assert.equal(f.find("abp-figure").style.properties.get("--abv-height"), "375px");
	f.mount.expand(); f.mount.expand();
	assert.equal(f.container.all().filter(el => el.tag === "dialog").length, 1);
	f.button("Close").click();
	assert.equal(f.dialog(), undefined);
	assert.equal(f.svg.parent, inlineFigure);
	assert.equal(f.doc.activeElement, expand);
	assert.equal(f.find("abp-expand").hidden, false);
	f.host.focus(); f.mount.expand();
	assert.ok(f.dialog().open);
	f.button("Close").click();
	assert.equal(f.doc.activeElement, f.host);
});

test("host expand works by default; Close, Escape, native close and backdrop return focus, content clicks do not close", t => {
	const f = setup(t);
	const inlineFigure = f.svg.parent;
	assert.equal(f.button("Expand"), undefined);
	for (const path of ["button", "escape", "native", "backdrop"]) {
		f.host.focus(); f.mount.expand();
		const dialog = f.dialog();
		f.find("ab-playback").click();
		assert.equal(dialog.open, true);
		if (path === "button") f.button("Close").click();
		if (path === "escape") assert.equal(dialog.fire("cancel"), true);
		if (path === "native") dialog.close();
		if (path === "backdrop") { dialog.fire("pointerdown"); dialog.click(); }
		assert.equal(f.dialog(), undefined);
		assert.equal(f.doc.activeElement, f.host);
		assert.equal(f.svg.parent, inlineFigure);
		assert.ok([...dialog.listeners.values()].every(set => set.size === 0));
	}
});

test("idle, paused and ended states and controls survive opening and closing in both directions", t => {
	const f = setup(t);
	const check = () => {
		const before = f.player.state;
		f.mount.expand(); f.tick(1000);
		assert.equal(f.player.state, before);
		f.button("Close").click();
		assert.equal(f.player.state, before);
	};
	check();
	f.player.select(1); f.player.seek(-1); check();
	f.player.next(); check();
	f.player.play(); f.tick(300); check();
	assert.equal(f.button("Replay").textContent, "Replay");
	f.mount.expand(); f.button("Replay").click();
	assert.equal(f.player.state.status, "playing");
	f.button("Pause").click(); f.button("Close").click();
	assert.deepEqual(f.player.state, { scenario: 1, step: 0, status: "paused" });
	assert.equal(f.button("Play").textContent, "Play");
});

test("Tab and Shift+Tab wrap at the modal boundaries, including empty scenarios", t => {
	const f = setup(t);
	f.mount.expand();
	const close = f.button("Close");
	const range = f.container.all().find(el => el.type === "range") as El;
	assert.equal(close.fire("keydown", "Tab", { shiftKey: true }), true);
	assert.equal(f.doc.activeElement, range);
	assert.equal(range.fire("keydown", "Tab"), true);
	assert.equal(f.doc.activeElement, close);
	f.player.select(2);
	assert.equal(close.fire("keydown", "Tab", { shiftKey: true }), true);
	assert.equal(f.doc.activeElement, f.find("abp-caption"));
	assert.equal(f.find("abp-caption").fire("keydown", "Tab"), true);
	assert.equal(f.doc.activeElement, close);
});

test("returned player and scenario tabs control the expanded view; closing preserves the latest state and captions", t => {
	const f = setup(t);
	const player = f.player;
	f.player.next(); f.mount.expand();
	assert.equal(f.mount.player, player);
	assert.equal(f.find("abp-caption").textContent, "First remark");
	player.next();
	assert.equal(f.find("abp-caption").textContent, "Second remark");
	player.previous(); assert.equal(player.state.step, 0);
	player.seek(-1); assert.equal(f.find("abp-caption").textContent, "");
	player.select(1); assert.equal(f.find("abp-actor").textContent, "Other actor");
	player.play(); assert.equal(f.button("Pause").textContent, "Pause");
	player.pause(); assert.equal(f.button("Play").textContent, "Play");
	f.button("First").click();
	assert.deepEqual(player.state, { scenario: 0, step: 0, status: "playing" });
	f.tick(100);
	assert.equal(f.find("abp-caption").textContent, "Second remark");
	f.button("Close").click();
	assert.deepEqual(player.state, { scenario: 0, step: 1, status: "playing" });
	f.tick(200); assert.equal(player.state.status, "ended");
	f.mount.expand(); f.button("Empty").click(); f.button("Close").click();
	assert.deepEqual(player.state, { scenario: 2, step: -1, status: "idle" });
	assert.equal(f.find("abp-caption").textContent, "No playable steps");
});

test("one player retains partial dwell and exclusive timers while moving; viewport autoplay is suspended in the modal", t => {
	const f = setup(t, { autoplay: true });
	f.doc.viewport.show(true);
	assert.equal(f.player.state.status, "playing");
	f.tick(40); f.mount.expand();
	f.doc.viewport.show(false); f.doc.viewport.show(true);
	assert.equal(f.player.state.status, "playing");
	f.tick(59); assert.equal(f.player.state.step, 0);
	f.tick(1); assert.equal(f.player.state.step, 1);
	f.tick(40); f.button("Close").click(); f.tick(159);
	assert.equal(f.player.state.status, "playing");
	f.tick(1); assert.equal(f.player.state.status, "ended");
	f.mount.expand(); f.player.play(); f.player.pause();
	f.doc.viewport.show(false); f.doc.viewport.show(true);
	assert.equal(f.player.state.status, "paused");
	f.button("Close").click(); f.doc.viewport.show(true);
	assert.equal(f.player.state.status, "paused");
});

test("opening idle autoplay before the first observation does not start it; reduced motion resets only playing and never restarts", t => {
	const f = setup(t, { autoplay: true });
	f.mount.expand(); f.doc.viewport.show(true); f.tick(1000);
	assert.equal(f.player.state.status, "idle");
	f.button("Close").click(); f.doc.viewport.show(true);
	assert.equal(f.player.state.status, "idle");
	f.player.play(); f.mount.expand();
	f.doc.motion.set(true);
	assert.deepEqual(f.player.state, { scenario: 0, step: -1, status: "idle" });
	assert.equal(f.find("abp-caption").textContent, "");
	f.player.next();
	assert.deepEqual(f.player.state, { scenario: 0, step: 0, status: "paused" });
	f.button("Close").click(); f.mount.expand();
	assert.equal(f.player.state.status, "paused");
	f.doc.motion.set(false); f.tick(60000);
	assert.equal(f.player.state.status, "paused");
	f.button("Close").click();
	assert.equal(f.player.state.status, "paused");
});

for (const entry of ["mount", "player"] as const) test(`${entry}.destroy while open removes all owned DOM, listeners, observers and timers and preserves host content`, t => {
	const f = setup(t, { autoplay: true, expand: true });
	f.mount.expand(); f.player.play();
	const elements = f.container.all();
	const dialog = f.dialog();
	const lateClose = [...(dialog.listeners.get("close") ?? [])];
	const lateViewport = [...f.doc.viewport.observers].map(observer => observer.callback);
	f[entry].destroy(); f.mount.destroy(); f.player.destroy();
	f.mount.expand(); f.player.play(); f.player.next(); f.player.select(1);
	for (const callback of lateClose) callback({} as Event);
	for (const callback of lateViewport) callback([{ target: f.svg, isIntersecting: true, intersectionRatio: 1 }]);
	f.doc.motion.set(true); f.tick(60000);
	assert.deepEqual(f.container.all(), f.original);
	assert.ok(elements.every(el => [...el.listeners.values()].every(listeners => listeners.size === 0)));
	assert.equal(f.doc.viewport.observers.size, 0);
	assert.equal(f.doc.motion.listeners.size, 0);
	assert.deepEqual(f.player.state, { scenario: 0, step: -1, status: "idle" });
});

test("no timelines exposes inert expand without adding DOM", t => {
	const f = setup(t, { expand: true, autoplay: true }, []);
	f.mount.expand(); f.mount.expand();
	assert.deepEqual(f.container.all(), f.original);
	f.mount.destroy(); f.mount.expand();
	assert.deepEqual(f.container.all(), f.original);
});

test("expansion stays in the host theme scope and retains the same wrappers and SVG", t => {
	const f = setup(t);
	f.container.style.setProperty("--ab-bg", "#123456");
	f.container.style.setProperty("--ab-play", "#abcdef");
	const root = f.find("ab-playback");
	const figure = f.find("abp-figure");
	f.mount.expand();
	assert.equal(f.dialog().parent, f.container);
	assert.ok(f.dialog().classList.contains("ab-auto"));
	assert.equal(f.find("abp-figure"), figure);
	assert.equal(root.parent, f.dialog());
	assert.equal(f.svg.style.properties.size, 0);
	f.button("Close").click();
	assert.equal(root.parent, f.container);
	assert.equal(f.svg.style.properties.size, 0);
});

test("a drag from content into the backdrop gutter does not close the view", t => {
	const f = setup(t);
	f.mount.expand();
	f.find("abp-caption").fire("pointerdown");
	f.dialog().click();
	assert.equal(f.dialog().open, true);
	f.dialog().fire("pointerdown"); f.find("ab-playback").click();
	assert.equal(f.dialog().open, true);
	f.dialog().fire("pointerdown"); f.dialog().click();
	assert.equal(f.dialog(), undefined);
});

test("expanded playback bypasses viewport pausing but retains lifecycle guards and inline visibility after close", t => {
	const f = setup(t, { autoplay: true, pauseWhenOffscreen: true });
	f.doc.viewport.show(false);
	f.player.play(); assert.equal(f.player.state.status, "idle");
	f.mount.expand();
	f.player.play(); f.tick(40);
	f.doc.viewport.show(false); f.tick(59);
	assert.equal(f.player.state.status, "playing");
	assert.equal(f.player.state.step, 0);
	f.tick(1); assert.equal(f.player.state.step, 1);
	f.doc.setHidden(true);
	assert.equal(f.player.state.status, "paused");
	f.doc.setHidden(false); f.doc.viewport.show(true);
	assert.equal(f.player.state.status, "paused");
	f.player.play(); f.button("Close").click();
	f.doc.viewport.show(false);
	assert.equal(f.player.state.status, "paused");
	f.doc.viewport.show(true);
	assert.equal(f.player.state.status, "playing");
});

test("expanded completion retains caption, scroll and highlights before Replay", t => {
	const f = setup(t);
	f.player.select(1); f.mount.expand(); f.player.play();
	f.find("abp-caption").scrollLeft = 90;
	f.tick(300);
	assert.deepEqual(f.player.state, { scenario: 1, step: 0, status: "ended" });
	for (const [cls, text] of [["abp-counter", "1/1"], ["abp-actor", "Other actor"], ["abp-caption", "Other remark"], ["abp-status", "Other actor: Other remark"]]) assert.equal(f.find(cls).textContent, text);
	assert.equal(f.find("abp-caption").scrollLeft, 90);
	assert.equal(f.svg.classList.contains("ab-in-progress"), true);
	assert.equal(f.svg.classList.contains("ab-playing"), false);
	assert.ok(f.svg.children[1].classList.contains("ab-current"));
	f.button("Close").click();
	assert.equal(f.button("Replay").textContent, "Replay");
	f.button("Replay").click();
	assert.deepEqual(f.player.state, { scenario: 1, step: 0, status: "playing" });
});

test("expansion keeps the single-line caption and scroll position through same-step updates and restores side layout", t => {
	const f = setup(t, { layout: "side", expand: true });
	const root = f.find("ab-playback");
	assert.equal(root.classList.contains("abp-side"), true);
	const rows = f.container.all().filter(el => el.classList.contains("abp-row"));
	f.player.next(); f.mount.expand();
	assert.equal(root.classList.contains("abp-below"), true);
	assert.ok(rows.every(row => !f.container.all().includes(row)));
	const caption = f.find("abp-caption");
	assert.equal(caption.tabIndex, 0);
	assert.equal(caption.getAttribute("aria-label"), "Step caption");
	caption.scrollLeft = 70;
	f.player.play(); f.player.pause();
	f.doc.resize.flush(); f.doc.frames.flush();
	assert.equal(root.classList.contains("abp-below"), true);
	assert.equal(caption.scrollLeft, 70);
	f.button("Close").click();
	assert.equal(root.classList.contains("abp-side"), true);
	assert.ok(rows.every(row => f.container.all().includes(row)));
	assert.equal(caption.scrollLeft, 70);
	f.mount.expand(); f.player.next();
	assert.equal(caption.scrollLeft, 0);
});

test("rebind while expanded retains dialog, controls and subscriptions, updates scheme/size and safely handles no timelines", t => {
	const f = setup(t, { autoplay: true, expand: true, layout: "side" });
	const player = f.player;
	const states: unknown[] = [];
	player.subscribe(state => states.push(state));
	player.select(1); player.play(); f.mount.expand();
	const dialog = f.dialog();
	const caption = f.find("abp-caption");
	const replacement = new El("svg", f.doc);
	replacement.className = "ab ab-dark";
	replacement.setAttribute("aria-label", "Updated figure");
	replacement.setAttribute("width", "900"); replacement.setAttribute("height", "1100");
	f.svg.replaceWith(replacement);
	const data = [...timelines].reverse();
	f.mount.update(replacement as unknown as SVGSVGElement, data);
	assert.equal(f.mount.player, player);
	assert.equal(f.dialog(), dialog);
	assert.equal(dialog.getAttribute("aria-label"), "Updated figure");
	assert.equal(dialog.classList.contains("ab-dark"), true);
	assert.equal(f.find("abp-figure").style.properties.get("--abv-width"), "225px");
	assert.equal(f.find("abp-figure").style.properties.get("--abv-height"), "275px");
	assert.equal(f.find("abp-caption"), caption);
	assert.deepEqual(player.state, { scenario: 1, step: 0, status: "paused" });
	f.doc.viewport.show(false); f.doc.viewport.show(true); f.tick(1000);
	assert.equal(player.state.status, "paused");
	assert.equal(states.at(-1), player.state);
	f.find("abp-caption").focus();
	assert.equal(f.find("abp-caption").fire("keydown", "Tab"), false);
	f.button("Close").focus();
	assert.equal(f.button("Close").fire("keydown", "Tab", { shiftKey: true }), true);
	assert.equal(f.doc.activeElement?.type, "range");
	f.mount.update(replacement as unknown as SVGSVGElement, []);
	assert.equal(f.dialog(), undefined);
	assert.equal(f.container.all().some(el => el.classList.contains("ab-playback")), false);
	assert.equal(replacement.parent, f.figure);
	f.mount.expand(); assert.equal(f.dialog(), undefined);
	f.mount.update(replacement as unknown as SVGSVGElement, timelines);
	f.mount.expand(); assert.equal(f.dialog().open, true);
	f.button("Close").click();
	f.mount.destroy();
	assert.equal(replacement.parent, f.figure);
});

test("opening and closing restore caption scrolling after browser reparenting resets it", t => {
	const f = setup(t);
	f.player.next();
	const root = f.find("ab-playback");
	const caption = f.find("abp-caption");
	const remove = root.remove.bind(root);
	t.mock.method(root, "remove", () => { remove(); caption.scrollLeft = 0; });
	caption.scrollLeft = 70;
	f.mount.expand();
	assert.equal(caption.scrollLeft, 70);
	caption.scrollLeft = 120;
	f.button("Close").click();
	assert.equal(caption.scrollLeft, 120);
	f.mount.expand(); f.player.next();
	assert.equal(caption.scrollLeft, 0);
	f.button("Close").click();
	assert.equal(caption.scrollLeft, 0);
});
