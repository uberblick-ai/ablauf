import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Timeline } from "./flow/play.ts";
import { mountPlayback } from "./flow/playback.ts";
import { Doc, El } from "./test-dom.ts";

const timelines: Timeline[] = [
	{ name: "Sequence", slug: "sequence", steps: [
		{ target: "7", kind: "message", actor: "Sender → Receiver", caption: "<b>First caption</b>", ms: 100, parts: [] },
		{ target: "104", kind: "message", actor: "Receiver", caption: "Second\ncaption", ms: 100, parts: [] },
	] },
	{ name: "Flow", slug: "flow", steps: [
		{ target: "9", kind: "box", actor: "Author", caption: "Start", ms: 100, parts: [] },
		{ target: "99", kind: "future-kind", actor: "Reviewer", caption: "Finish", ms: 100, parts: [] },
	] },
	{ name: "Empty", slug: "empty", steps: [] },
];

function setup(t: TestContext, options: { layout?: "below" | "side" | "auto"; width?: number; height?: number; available?: number; shadow?: boolean } = {}) {
	const doc = new Doc();
	const container = new El(options.shadow ? "#shadow-root" : "main", doc);
	container.rect = { top: 0, bottom: 800, width: options.available ?? 998 };
	const before = new El("p", doc);
	const after = new El("p", doc);
	const svg = new El("svg", doc);
	svg.setAttribute("viewBox", `0 0 ${options.width ?? 678} ${options.height ?? 744}`);
	container.append(before, svg, after);
	const original = [...container.children];
	const mount = mountPlayback(container as unknown as HTMLElement, svg as unknown as SVGSVGElement, timelines, options);
	t.after(() => mount.destroy());
	const cls = (name: string) => container.all().find(el => el.classList.contains(name)) as El;
	const lists = () => container.all().filter(el => el.tag === "ol");
	const rows = () => lists().find(list => !list.hidden)?.all().filter(el => el.classList.contains("abp-row")) ?? [];
	const current = () => rows().filter(row => row.getAttribute("aria-current") === "step");
	const played = () => rows().filter(row => row.classList.contains("abp-played"));
	const resize = (available: number) => { container.rect = { top: 0, bottom: 800, width: available }; doc.resize.flush(); doc.frames.flush(); };
	return { doc, container, svg, original, mount, player: mount.player, cls, lists, rows, current, played, resize };
}

test("explicit side and below override auto; omitted layout and auto share the inclusive 320px threshold", t => {
	for (const layout of [undefined, "auto"] as const) {
		for (const [width, height, available, side] of [
			[678, 744, 998, true], [678, 744, 997.99, false],
			[678, 744, 1200, true], [744, 678, 1400, false], [678, 678, 1400, false],
		] as const) {
			const f = setup(t, { layout, width, height, available });
			assert.equal(f.cls("ab-playback").classList.contains("abp-side"), side);
			assert.equal(f.lists().length, side ? timelines.length : 0);
		}
	}
	const forced = setup(t, { layout: "side", width: 744, height: 678, available: 760 });
	assert.ok(forced.cls("ab-playback").classList.contains("abp-side"));
	assert.equal(forced.lists().length, timelines.length);
	forced.resize(500);
	assert.ok(forced.cls("ab-playback").classList.contains("abp-side"));
	const below = setup(t, { layout: "below", available: 1400 });
	assert.ok(below.cls("ab-playback").classList.contains("abp-below"));
	assert.equal(below.lists().length, 0);
	below.resize(1600);
	assert.equal(below.lists().length, 0);
	assert.equal(below.cls("abp-panel").children[0], below.cls("abp-step"));
});

test("auto resizes both ways at natural width, retains navigation and synchronizes the returning list", t => {
	const f = setup(t);
	assert.equal(f.cls("ab-playback").style.properties.get("--abp-figure-width"), "678px");
	f.player.seek(1);
	const rows = f.rows();
	f.resize(997);
	assert.equal(f.lists().length, 0);
	assert.equal(f.cls("abp-caption").textContent, "Second\ncaption");
	f.player.select(1);
	f.resize(998);
	assert.deepEqual(f.rows().map(row => row.children[0].textContent), ["1", "2"]);
	assert.equal(f.current()[0], f.rows()[0]);
	f.player.select(0);
	assert.deepEqual(f.rows(), rows, "resizing reuses native buttons");
	assert.equal(f.current()[0], rows[0]);
	assert.equal(f.doc.resize.observers.size, 1);
});

test("resize delivery leaves DOM unchanged until the next frame and uses the latest width", t => {
	const f = setup(t);
	const root = f.cls("ab-playback");
	const original = f.container.all();
	f.container.rect = { top: 0, bottom: 800, width: 997 };
	f.doc.resize.flush();
	f.doc.resize.flush();
	assert.ok(root.classList.contains("abp-side"));
	assert.deepEqual(f.container.all(), original, "no layout mutations during observer delivery");
	assert.equal(f.doc.frames.callbacks.size, 1);
	f.doc.frames.flush();
	assert.ok(root.classList.contains("abp-below"));
	assert.equal(f.lists().length, 0);
	f.container.rect.width = 998;
	f.doc.resize.flush();
	f.container.rect.width = 997;
	f.doc.resize.flush();
	f.doc.frames.flush();
	assert.ok(root.classList.contains("abp-below"), "the final available width wins");
	f.resize(998);
	assert.ok(root.classList.contains("abp-side"));
});

test("both teardown entries cancel pending resize work and tolerate already queued callbacks", t => {
	for (const entry of ["mount", "player"] as const) {
		const f = setup(t);
		const observer = [...f.doc.resize.observers][0];
		f.container.rect = { top: 0, bottom: 800, width: 997 };
		f.doc.resize.flush();
		const callback = [...f.doc.frames.callbacks.values()][0];
		assert.ok(callback);
		f[entry].destroy();
		assert.equal(f.doc.frames.callbacks.size, 0);
		observer.callback();
		callback(0);
		f.doc.frames.flush();
		assert.equal(f.doc.frames.callbacks.size, 0);
		assert.deepEqual(f.container.children, f.original);
	}
});

test("nested, external and detached SVGs mount inside the supplied container and return to their original position", t => {
	for (const placement of ["nested", "external", "detached"] as const) for (const entry of ["mount", "player"] as const) {
		const doc = new Doc();
		const container = new El("main", doc);
		const parent = new El("figure", doc);
		const before = new El("p", doc);
		const after = new El("p", doc);
		const svg = new El("svg", doc);
		svg.setAttribute("viewBox", "0 0 678 744");
		svg.setAttribute("style", "width:85%;display:inline");
		const attributes = [...svg.attrs];
		if (placement !== "detached") parent.append(before, svg, after);
		else parent.append(before, after);
		const content = new El("p", doc);
		container.append(content);
		if (placement === "nested") container.append(parent);
		const containerChildren = [...container.children];
		const parentChildren = [...parent.children];
		const mount = mountPlayback(container as unknown as HTMLElement, svg as unknown as SVGSVGElement, timelines, { layout: "side" });
		t.after(() => mount.destroy());
		assert.ok(svg.parent?.classList.contains("abp-figure"));
		assert.ok(container.all().includes(svg));
		assert.ok(container.children.includes(content));
		const mounted = container.all();
		(entry === "mount" ? mount : mount.player).destroy();
		mount.destroy(); mount.player.destroy();
		assert.deepEqual(container.children, containerChildren);
		assert.deepEqual(parent.children, parentChildren);
		assert.equal(svg.parent, placement === "detached" ? null : parent);
		assert.deepEqual([...svg.attrs], attributes);
		assert.equal(doc.resize.observers.size, 0);
		assert.equal(doc.motion.listeners.size, 0);
		assert.ok(mounted.every(el => [...el.listeners.values()].every(listeners => listeners.size === 0)));
	}
});

test("side list has safe text and message numbers; play, seek, reset and scenario changes update every row", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const f = setup(t, { layout: "side" });
	assert.deepEqual(f.lists().map(list => list.getAttribute("aria-label")), ["Sequence steps", "Flow steps", "Empty steps"]);
	assert.deepEqual(f.rows().map(row => row.children.map(el => el.textContent)), [
		["07", "Sender → Receiver", "<b>First caption</b>"], ["104", "Receiver", "Second\ncaption"],
	]);
	assert.ok(f.rows().every(row => row.parent?.tag === "li" && row.children.every(el => el.children.length === 0)));
	assert.equal(f.current().length, 0);
	assert.equal(f.played().length, 0);
	f.player.play();
	assert.deepEqual(f.current(), [f.rows()[0]]);
	t.mock.timers.tick(100);
	assert.deepEqual(f.current(), [f.rows()[1]]);
	assert.deepEqual(f.played(), [f.rows()[0]]);
	t.mock.timers.tick(100);
	assert.deepEqual(f.player.state, { scenario: 0, step: -1, status: "ended" });
	assert.equal(f.current().length, 0);
	assert.equal(f.played().length, 0);
	f.player.seek(-1);
	assert.equal(f.current().length, 0);
	assert.equal(f.played().length, 0);
	f.player.seek(1);
	assert.deepEqual(f.current(), [f.rows()[1]]);
	f.player.select(1);
	assert.deepEqual(f.rows().map(row => row.children[0].textContent), ["1", "2"]);
	assert.deepEqual(f.current(), [f.rows()[0]]);
	assert.equal(f.played().length, 0);
	const inactive = f.lists()[0];
	assert.ok(inactive.hidden);
	assert.ok(inactive.all().every(el => !el.getAttribute("aria-current") && !el.classList.contains("abp-played")));
	f.player.select(2);
	assert.equal(f.rows().length, 0);
	assert.equal(f.current().length, 0);
	assert.equal(f.cls("abp-empty").hidden, false);
	assert.ok(f.lists().every(list => list.hidden || list.children.length === 0));
	f.player.select(0);
	assert.equal(f.cls("abp-empty").hidden, true);
	assert.deepEqual(f.current(), [f.rows()[0]]);
});

test("native row buttons are keyboard reachable and their activation seeks and pauses without playback moving focus", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const f = setup(t);
	const all = f.container.all();
	for (const key of ["Enter", " "]) {
		const row = f.rows()[1];
		assert.equal(row.tag, "button");
		assert.equal(row.type, "button");
		assert.equal(row.disabled, false);
		assert.equal(row.tabIndex, 0);
		row.focus();
		f.player.play();
		// Native buttons generate a click for Enter/Space. The harness has no
		// browser default actions; assert keydown is not intercepted, then click.
		assert.equal(row.fire("keydown", key), false);
		row.click();
		assert.deepEqual(f.player.state, { scenario: 0, step: 1, status: "paused" });
		f.player.seek(-1); f.player.play(); t.mock.timers.tick(100);
		assert.equal(f.doc.activeElement, row);
	}
	f.rows()[0].click();
	assert.deepEqual(f.player.state, { scenario: 0, step: 0, status: "paused" });
	assert.deepEqual(f.container.all(), all);
});

test("keeping a row visible changes only the sticky column scroll position", t => {
	const f = setup(t);
	const column = f.cls("abp-controls");
	column.rect = { top: 20, bottom: 220, width: 320 };
	f.rows()[0].rect = { top: 30, bottom: 90, width: 300 };
	f.rows()[1].rect = { top: 240, bottom: 300, width: 300 };
	f.player.seek(0);
	assert.equal(column.scrollTop, 0, "already visible");
	f.player.seek(1);
	assert.equal(column.scrollTop, 80);
	f.rows()[0].rect = { top: -20, bottom: 40, width: 300 };
	f.player.seek(0);
	assert.equal(column.scrollTop, 40);
	assert.equal(f.container.scrollTop, 0);
	assert.equal(f.doc.activeElement, null);
	f.resize(997);
	f.player.seek(1);
	assert.equal(column.scrollTop, 40, "below layout never scrolls the caption column");
	const css = f.container.all().find(el => el.tag === "style")?.textContent ?? "";
	assert.match(css, /\.ab-playback\.abp-side \.abp-controls\{[^}]*position:sticky;top:0;[^}]*max-height:100dvh;overflow-y:auto;overscroll-behavior-y:contain/);
	assert.match(css, /\.ab-playback\.abp-side \.abp-step\{display:none\}/);
	assert.match(css, /\.abp-row\[aria-current="step"\][^{]*\{background:color-mix/);
	assert.match(css, /\.abp-row\[aria-current="step"\] \.abp-remark\{font-weight:600\}/);
	assert.match(css, /\.ab-playback button:focus-visible/);
});

test("both teardown entries restore SVG order and remove even detached row listeners and resize observations", t => {
	for (const shadow of [false, true]) for (const entry of ["mount", "player"] as const) {
		const f = setup(t, { shadow });
		const old = f.container.all();
		const observer = [...f.doc.resize.observers][0];
		assert.ok(observer.targets.has(f.cls("ab-playback")));
		f.resize(997); // detached lists still own listeners until destroy
		f[entry].destroy(); f.mount.destroy(); f.player.destroy();
		assert.deepEqual(f.container.children, f.original);
		assert.equal(f.doc.resize.observers.size, 0);
		assert.equal(f.doc.motion.listeners.size, 0);
		assert.ok(old.every(el => [...el.listeners.values()].every(listeners => listeners.size === 0)));
		observer.callback(); // a queued resize after teardown must be inert
		assert.deepEqual(f.container.children, f.original);
	}
});
