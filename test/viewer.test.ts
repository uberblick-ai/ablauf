import assert from "node:assert/strict";
import { type TestContext, test } from "node:test";
import type { Timeline } from "../src/play.ts";
import { mountPlayback } from "../src/playback.ts";
import { openViewer, type Viewer, type ViewerOptions } from "../src/viewer.ts";
import { Doc, El } from "./test-dom.ts";

const timelines: Timeline[] = [
	{ name: "Only", slug: "only", steps: [
		{ target: "a", kind: "box", actor: "Author", caption: "First", ms: 100, parts: ["a"] },
		{ target: "a", kind: "box", actor: "Author", caption: "Second", ms: 100, parts: ["a"] },
	] },
];

// A drawing region of a given client size: every div the code creates gets it.
function setup(t: TestContext, { width = 400, height = 300, region = [1000, 800], shadow = false } = {}) {
	const doc = new Doc();
	const page = new El("html", doc);
	Object.assign(doc, { documentElement: page });
	page.style.overflow = "auto";
	const create = doc.createElement.bind(doc);
	doc.createElement = (tag: string) => {
		const el = create(tag);
		if (tag === "div") { el.clientWidth = region[0]; el.clientHeight = region[1]; }
		return el;
	};
	const host = new El("main", doc);
	const scope = new El(shadow ? "#shadow-root" : "div", doc);
	host.append(scope);
	const opener = new El("button", doc);
	const before = new El("p", doc);
	const after = new El("p", doc);
	const svg = new El("svg", doc);
	svg.className = "ab ab-dark";
	svg.setAttribute("aria-label", "Deploy <flow>");
	svg.setAttribute("width", String(width)); svg.setAttribute("height", String(height));
	scope.append(opener, before, svg, after);
	const original = scope.all();
	const viewers: Viewer[] = [];
	const open = (options?: ViewerOptions) => {
		const viewer = openViewer(svg as unknown as SVGSVGElement, options);
		viewers.push(viewer);
		return viewer;
	};
	t.after(() => { for (const viewer of viewers) viewer.close(); });
	const all = () => scope.all();
	const dialog = () => all().find(el => el.tag === "dialog") as El;
	const canvas = () => all().find(el => el.classList.contains("abv-canvas")) as El;
	const button = (text: string) => all().find(el => el.tag === "button" && (el.getAttribute("aria-label") === text || el.textContent === text)) as El;
	const width_ = () => Number.parseFloat(canvas().style.properties.get("--abv-width") ?? "");
	const percent = () => all().find(el => el.classList.contains("abv-zoom"))?.textContent;
	const status = () => all().find(el => el.classList.contains("abv-status"))?.textContent;
	return { doc, page, scope, svg, opener, original, open, dialog, canvas, button, width: width_, percent, status, all };
}

test("openViewer moves a static SVG into a labelled modal with the toolbar and restores it on close", t => {
	const f = setup(t);
	f.opener.focus();
	let closes = 0;
	const viewer = f.open({ onClose: () => closes++ });
	const dialog = f.dialog();
	assert.equal(dialog.open, true);
	assert.ok(dialog.classList.contains("ab-viewer") && dialog.classList.contains("ab-dark"));
	assert.equal(dialog.getAttribute("aria-label"), "Deploy <flow>");
	assert.equal(f.svg.parent, f.canvas());
	assert.equal(f.canvas().getAttribute("role"), "region");
	const toolbar = dialog.children[1];
	assert.deepEqual(toolbar.children.filter(el => el.tag === "button").map(el => el.getAttribute("aria-label") ?? el.textContent), ["Close", "Zoom out", "Zoom in", "Fit to window"]);
	assert.equal(f.doc.activeElement, f.button("Close"));
	assert.equal(f.page.style.overflow, "hidden", "the page behind does not scroll");
	assert.equal(f.all().some(el => el.className.startsWith("abp")), false, "static views have no playback UI");
	assert.equal(f.open(), viewer, "reopening returns the open handle");
	assert.equal(f.all().filter(el => el.tag === "dialog").length, 1);
	viewer.close(); viewer.close();
	assert.equal(viewer.closed, true);
	assert.equal(closes, 1);
	assert.deepEqual(f.all(), f.original);
	assert.equal(f.page.style.overflow, "auto");
	assert.equal(f.doc.activeElement, f.opener);
	assert.ok(dialog.all().every(el => [...el.listeners.values()].every(set => set.size === 0)));
	assert.notEqual(f.open(), viewer, "a closed viewer is not reused");
});

test("every close path cleans up first and notifies once, returning focus", t => {
	const f = setup(t);
	for (const path of ["button", "escape", "native", "backdrop", "handle"]) {
		f.opener.focus();
		let closes = 0;
		let restored = false;
		const viewer = f.open({ onClose: () => { closes++; restored = f.svg.parent?.tag !== "div" || f.dialog() === undefined; } });
		const dialog = f.dialog();
		f.canvas().click();
		assert.equal(dialog.open, true, "content clicks do not close");
		if (path === "button") f.button("Close").click();
		if (path === "escape") assert.equal(dialog.fire("cancel"), true);
		if (path === "native") dialog.close();
		if (path === "backdrop") { dialog.fire("pointerdown"); dialog.click(); }
		if (path === "handle") viewer.close();
		viewer.close(); dialog.close();
		assert.equal(closes, 1, path);
		assert.ok(restored, `${path}: onClose runs after the SVG is back`);
		assert.deepEqual(f.all(), f.original);
		assert.equal(f.doc.activeElement, f.opener);
	}
});

test("a drag that starts in content and ends on the backdrop does not close", t => {
	const f = setup(t);
	f.open();
	f.canvas().fire("pointerdown", "", { pointerId: 1, pointerType: "mouse", button: 0, clientX: 0, clientY: 0 });
	f.dialog().click();
	assert.equal(f.dialog().open, true);
});

test("a figure that fits opens centred at 100%; a larger one opens at Fit; initialZoom fit is capped at 100%", t => {
	const small = setup(t);
	const viewer = small.open();
	assert.equal(viewer.zoom, 1);
	assert.equal(small.percent(), "100%");
	assert.equal(small.width(), 400);
	assert.equal(small.canvas().scrollLeft, 0);
	viewer.close();
	const fitSmall = small.open({ initialZoom: "fit" });
	assert.equal(fitSmall.zoom, 1);
	small.doc.resize.flush(); small.doc.frames.flush();
	assert.equal(fitSmall.zoom, 1);

	const large = setup(t, { width: 2000, height: 1000 });
	assert.equal(large.open().zoom, 0.5);
	assert.equal(large.percent(), "50%");
	assert.equal(large.width(), 1000);
});

test("Fit uses the smaller ratio, floors at 25% and centres the overflow, which stays scrollable", t => {
	const f = setup(t, { width: 4000, height: 2000, region: [200, 400] });
	const viewer = f.open();
	assert.equal(viewer.zoom, 0.25);
	assert.equal(f.width(), 1000);
	assert.equal(f.canvas().scrollLeft, 400, "centred: (1000 - 200) / 2");
	assert.equal(f.button("Zoom out").disabled, true);
	f.canvas().fire("pointerdown", "", { pointerId: 1, pointerType: "mouse", button: 0, clientX: 100, clientY: 100 });
	f.canvas().fire("pointermove", "", { pointerId: 1, clientX: 40, clientY: 100 });
	assert.equal(f.canvas().scrollLeft, 460, "dragging pans");
	f.canvas().fire("pointerup", "", { pointerId: 1 });
	f.canvas().fire("pointermove", "", { pointerId: 1, clientX: 0, clientY: 100 });
	assert.equal(f.canvas().scrollLeft, 460, "released pointers no longer pan");
});

test("minus and plus step 25 points around the centre and clamp to 25%-400%", t => {
	const f = setup(t, { width: 400, height: 400, region: [400, 400] });
	const viewer = f.open();
	f.button("Zoom in").click();
	assert.equal(viewer.zoom, 1.25);
	assert.equal(f.percent(), "125%");
	assert.equal(f.canvas().scrollLeft, 50, "the centre stays centred: (500 - 400) / 2");
	assert.equal(f.canvas().scrollTop, 50);
	for (let i = 0; i < 20; i++) f.button("Zoom in").click();
	assert.equal(viewer.zoom, 4);
	assert.equal(f.button("Zoom in").disabled, true);
	assert.equal(f.button("Zoom out").disabled, false);
	for (let i = 0; i < 20; i++) f.button("Zoom out").click();
	assert.equal(viewer.zoom, 0.25);
	assert.equal(f.button("Zoom out").disabled, true);
	assert.equal(f.canvas().scrollLeft, 0);
	f.button("Fit to window").click();
	assert.equal(viewer.zoom, 1);
});

test("resize refits only while Fit is active", t => {
	const f = setup(t, { width: 2000, height: 1000 });
	const viewer = f.open();
	f.canvas().clientWidth = 500;
	f.doc.resize.flush(); f.doc.frames.flush();
	assert.equal(viewer.zoom, 0.25);
	f.canvas().clientWidth = 1500;
	f.doc.resize.flush(); f.doc.frames.flush();
	assert.equal(viewer.zoom, 0.75);
	f.button("Zoom in").click();
	f.canvas().clientWidth = 600;
	f.doc.resize.flush(); f.doc.frames.flush();
	assert.equal(viewer.zoom, 1, "a manual zoom ends Fit");
});

test("Cmd/Ctrl + wheel zooms at the pointer; a plain wheel scrolls natively", t => {
	const f = setup(t, { width: 1000, height: 800, region: [1000, 800] });
	const viewer = f.open();
	const canvas = f.canvas();
	canvas.rect = { top: 0, bottom: 800, width: 1000 };
	assert.equal(canvas.fire("wheel", "", { deltaY: -100, clientX: 250, clientY: 200 }), false);
	assert.equal(viewer.zoom, 1);
	assert.equal(canvas.fire("wheel", "", { deltaY: -300, ctrlKey: true, clientX: 250, clientY: 200 }), true);
	const zoom = viewer.zoom;
	assert.ok(zoom > 2.7 && zoom < 2.72, String(zoom));
	// The figure point under the pointer, (250, 200) at 100%, stays under it.
	assert.ok(Math.abs(canvas.scrollLeft + 250 - 250 * zoom) < 1);
	assert.ok(Math.abs(canvas.scrollTop + 200 - 200 * zoom) < 1);
	canvas.fire("wheel", "", { deltaY: 3000, metaKey: true, clientX: 0, clientY: 0 });
	assert.equal(viewer.zoom, 0.25);
});

test("a two-finger pinch zooms around its midpoint and pans with it", t => {
	const f = setup(t, { width: 1000, height: 800, region: [1000, 800] });
	const viewer = f.open();
	const canvas = f.canvas();
	canvas.rect = { top: 0, bottom: 800, width: 1000 };
	const touch = (type: string, pointerId: number, clientX: number, clientY = 400) => canvas.fire(type, "", { pointerId, pointerType: "touch", clientX, clientY });
	touch("pointerdown", 1, 400); touch("pointerdown", 2, 600);
	touch("pointermove", 2, 800);
	// Distance 200 -> 400 around (500, 400), then the midpoint moves to (600, 400).
	assert.equal(viewer.zoom, 2);
	assert.equal(canvas.scrollLeft, 500 * 2 - 500 - 100);
	assert.equal(canvas.scrollTop, 400);
	touch("pointerup", 1, 400); touch("pointercancel", 2, 800);
	touch("pointermove", 2, 900);
	assert.equal(viewer.zoom, 2);
});

test("Copy appears only with a source, copies it exactly and announces success or failure", async t => {
	const f = setup(t);
	f.open();
	assert.equal(f.button("Copy source"), undefined);
	f.button("Close").click();
	const writes: string[] = [];
	let fail = false;
	Object.assign(f.doc.defaultView, { navigator: { clipboard: { writeText: async (text: string) => { if (fail) throw new Error("denied"); writes.push(text); } } } });
	const empty = f.open({ source: "" });
	f.button("Copy source").click();
	await new Promise(resolve => setImmediate(resolve));
	assert.deepEqual(writes, [""]);
	assert.equal(f.status(), "Copied source");
	empty.close();
	f.open({ source: "flow v0\n<b>&amp;" });
	f.button("Copy source").click();
	await new Promise(resolve => setImmediate(resolve));
	assert.deepEqual(writes, ["", "flow v0\n<b>&amp;"]);
	fail = true;
	f.button("Copy source").click();
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(f.status(), "Copy failed");
	f.button("Close").click();
	Object.assign(f.doc.defaultView, { navigator: {} });
	f.open({ source: "x" });
	f.button("Copy source").click();
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(f.status(), "Copy failed", "no clipboard never claims success");
});

test("host actions are plain-text buttons that receive the viewer and can close it", t => {
	const f = setup(t);
	const calls: Viewer[] = [];
	let closes = 0;
	const viewer = f.open({ onClose: () => closes++, actions: [{ label: "<i>Source</i>", onClick: v => { calls.push(v); v.close(); } }] });
	const action = f.button("<i>Source</i>");
	assert.equal(action.type, "button");
	assert.equal(action.parent?.classList.contains("abv-toolbar"), true);
	action.click();
	assert.deepEqual(calls, [viewer]);
	assert.equal(viewer.closed, true);
	assert.equal(closes, 1);
});

test("Tab and Shift+Tab stay inside the viewer", t => {
	const f = setup(t);
	f.open({ source: "", actions: [{ label: "Edit", onClick: () => {} }] });
	const close = f.button("Close");
	assert.equal(close.fire("keydown", "Tab", { shiftKey: true }), true);
	assert.equal(f.doc.activeElement, f.canvas());
	assert.equal(f.canvas().fire("keydown", "Tab"), true);
	assert.equal(f.doc.activeElement, close);
	f.button("Edit").focus();
	assert.equal(f.button("Edit").fire("keydown", "Tab"), false);
});

test("shadow-root hosts keep the dialog in their own scope and theme", t => {
	const f = setup(t, { shadow: true });
	f.opener.focus();
	const viewer = f.open();
	assert.equal(f.dialog().parent, f.scope);
	assert.equal(f.scope.activeElement, f.button("Close"));
	viewer.close();
	assert.equal(f.scope.activeElement, f.opener);
	assert.deepEqual(f.all(), f.original);
});

test("playback expansion returns the viewer, merges defaults with per-call options and shares the handle with openViewer", t => {
	const f = setup(t);
	const closes: string[] = [];
	const mount = mountPlayback(f.scope as unknown as HTMLElement, f.svg as unknown as SVGSVGElement, timelines, {
		expand: true, viewer: { source: "default", onClose: () => closes.push("default") },
	});
	t.after(() => mount.destroy());
	f.button("Expand").click();
	assert.ok(f.button("Copy source"));
	const viewer = f.all().find(el => el.tag === "dialog") && mount.expand();
	assert.ok(viewer);
	assert.equal(openViewer(f.svg as unknown as SVGSVGElement), viewer);
	assert.equal(mount.expand({ source: "ignored" }), viewer, "reopening keeps the open viewer");
	mount.player.next(); viewer.close();
	assert.deepEqual(closes, ["default"]);
	assert.deepEqual(mount.player.state, { scenario: 0, step: 0, status: "paused" });
	const overridden = mount.expand({ onClose: () => closes.push("call") });
	assert.ok(overridden);
	assert.ok(f.button("Copy source"), "unspecified options keep the mount defaults");
	assert.deepEqual(mount.player.state, { scenario: 0, step: 0, status: "paused" }, "opening does not reset or start playback");
	mount.destroy();
	assert.deepEqual(closes, ["default", "call"], "teardown closes and notifies once");
	assert.equal(mount.expand(), undefined);
	assert.equal(f.dialog(), undefined);
});

test("playback overlays zoom with the figure without touching the SVG's own style or layout", t => {
	const f = setup(t, { width: 2000, height: 1000 });
	const mount = mountPlayback(f.scope as unknown as HTMLElement, f.svg as unknown as SVGSVGElement, timelines);
	t.after(() => mount.destroy());
	const viewer = mount.expand();
	assert.equal(viewer?.zoom, 0.5);
	mount.player.next();
	f.button("Zoom in").click();
	assert.equal(f.svg.style.properties.size, 0);
	assert.equal(f.canvas(), f.all().find(el => el.classList.contains("abp-figure")));
	assert.equal(f.width(), 1500);
	assert.ok(f.svg.classList.contains("ab-in-progress"), "the player keeps painting the same SVG");
	viewer?.close();
	assert.equal(f.canvas(), undefined);
	assert.equal(f.all().find(el => el.classList.contains("abp-figure"))?.style.properties.size, 0);
});

test("reduced motion needs no special case: every zoom change applies immediately", t => {
	const f = setup(t);
	f.doc.motion.set(true);
	const viewer = f.open();
	f.button("Zoom in").click();
	assert.equal(viewer.zoom, 1.25);
	assert.equal(f.width(), 500);
});

test("the standalone viewer bundles no playback, and core bundles neither", async () => {
	const { build } = await import("esbuild");
	const inputs = async (entry: string) => Object.keys((await build({ entryPoints: [new URL(`../src/${entry}`, import.meta.url).pathname], bundle: true, format: "esm", write: false, metafile: true, logLevel: "silent" })).metafile.inputs).map(path => path.replace(/^.*src\//, "")).sort();
	assert.deepEqual(await inputs("viewer.ts"), ["view.ts", "viewer.ts"]);
	const core = await inputs("index.ts");
	for (const module of ["view.ts", "viewer.ts", "player.ts", "controls.ts"]) assert.ok(!core.includes(module), module);
});
