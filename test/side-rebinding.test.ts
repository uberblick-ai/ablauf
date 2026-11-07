import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Timeline } from "../src/play.ts";
import { mountPlayback } from "../src/playback.ts";
import { Doc, El } from "./test-dom.ts";

const data: Timeline[] = [
	{ name: "First", slug: "first", steps: [
		{ kind: "message", target: "7", actor: "Sender", caption: "Send", ms: 100, parts: ["a"] },
		{ kind: "message", target: "104", actor: "Receiver", caption: "Reply", ms: 100, parts: ["b"] },
	] },
	{ name: "Second", slug: "second", steps: [
		{ kind: "box", target: "b", actor: "Author", caption: "Start", ms: 100, parts: ["b"] },
	] },
];
const asSvg = (el: El) => el as unknown as SVGSVGElement;
function image(doc: Doc, width = 678, height = 744) {
	const svg = new El("svg", doc);
	svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
	for (const part of ["a", "b"]) {
		const group = new El("g", doc); group.setAttribute("data-ab-part", part); svg.append(group);
	}
	return svg;
}
function setup(t: TestContext, layout: "auto" | "side" | "below" = "side", shadow = false, doc = new Doc()) {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const container = new El(shadow ? "#shadow-root" : "main", doc);
	container.rect = { top: 0, bottom: 800, width: 998 };
	const before = new El("p", doc); const after = new El("p", doc);
	const svg = image(doc); container.append(before, svg, after);
	const mount = mountPlayback(container as unknown as HTMLElement, asSvg(svg), data, { layout, autoplay: true });
	t.after(() => mount.destroy());
	const cls = (name: string) => {
		const found = container.all().find(el => el.classList.contains(name)); assert.ok(found, name); return found;
	};
	const lists = () => container.all().filter(el => el.tag === "ol");
	const rows = () => lists().find(list => !list.hidden)?.all().filter(el => el.classList.contains("abp-row")) ?? [];
	const active = () => shadow ? container.activeElement : doc.activeElement;
	return { doc, container, before, after, svg, mount, player: mount.player, cls, lists, rows, active };
}

for (const shadow of [false, true]) for (const layout of ["side", "below"] as const) {
	test(`rebind preserves structure, controls, slug selection and focus (${layout}, shadow=${shadow})`, t => {
		const f = setup(t, layout, shadow);
		const root = f.cls("ab-playback"); const figure = f.cls("abp-figure"); const column = f.cls("abp-controls");
		const panel = f.cls("abp-panel"); const range = f.container.all().find(el => el.type === "range"); assert.ok(range);
		const tab = f.container.all().find(el => el.dataset.slug === "second"); assert.ok(tab);
		f.player.select("second"); f.player.play(); tab.focus();
		const replacement = image(f.doc); replacement.className = "ab ab-dark";
		const changed = { ...data[1], name: "Renamed", steps: [
			{ ...data[1].steps[0], kind: "message", target: "9", actor: "<actor>", caption: "<b>New</b>\ncaption" },
			{ ...data[0].steps[1] },
		] };
		let calls = 0;
		f.player.subscribe(() => {
			calls++;
			assert.equal(range.max, "1");
			assert.equal(f.cls("abp-caption").textContent, "<b>New</b>\ncaption");
			if (layout === "side") assert.deepEqual(f.rows().map(row => row.children.map(el => el.textContent)), [
				["09", "<actor>", "<b>New</b>\ncaption"], ["104", "Receiver", "Reply"],
			]);
		});
		f.mount.update(asSvg(replacement), [changed, data[0]]);
		assert.deepEqual(f.player.state, { scenario: 0, step: 0, status: "paused" });
		assert.equal(calls, 1); assert.equal(f.active(), tab);
		assert.equal(f.cls("ab-playback"), root); assert.equal(f.cls("abp-figure"), figure);
		assert.equal(f.cls("abp-controls"), column); assert.equal(f.cls("abp-panel"), panel);
		assert.equal(replacement.parent, figure); assert.equal(f.svg.parent, null);
		assert.ok(root.classList.contains(`abp-${layout}`)); assert.ok(root.classList.contains("ab-dark"));
		assert.ok(f.svg.all().every(el => !el.classList.contains("ab-current") && !el.classList.contains("ab-playing")));
		assert.equal(f.doc.resize.observers.size, 1); assert.equal(f.doc.viewport.observers.size, 1);
		assert.ok([...f.doc.viewport.observers][0].targets.has(figure));
		f.doc.viewport.show(true); t.mock.timers.tick(1000); assert.equal(f.player.state.status, "paused");
		if (layout === "side") {
			assert.deepEqual(f.lists().map(list => list.getAttribute("aria-label")), ["Renamed steps", "First steps"]);
			assert.equal(f.rows()[0].getAttribute("aria-current"), "step");
		} else assert.equal(f.lists().length, 0);
		range.focus(); f.mount.update(asSvg(replacement), [changed, data[0]]);
		assert.equal(f.active(), range); assert.equal(calls, 1, "same-tuple refresh is silent");
	});
}

for (const shadow of [false, true]) {
	test(`side rows retain focus and refresh actions after reorder; removed rows fall back to panel (shadow=${shadow})`, t => {
		const f = setup(t, "side", shadow);
		f.player.select("first"); const row = f.rows()[1]; row.focus();
		const staleClick = [...row.listeners.get("click") ?? []][0];
		f.mount.update(asSvg(f.svg), [data[1], { ...data[0], steps: data[0].steps.map(step => ({ ...step, caption: "Changed" })) }]);
		assert.equal(f.active(), row); assert.equal(f.rows()[1], row);
		const state = f.player.state; staleClick({} as Event); assert.equal(f.player.state, state);
		row.click(); assert.deepEqual(f.player.state, { scenario: 1, step: 1, status: "paused" });
		f.mount.update(asSvg(f.svg), [data[1], { ...data[0], steps: [data[0].steps[0]] }]);
		assert.equal(f.active(), f.cls("abp-panel"));
		assert.equal(row.listeners.get("click")?.size, 0); row.click(); assert.equal(f.player.state.step, 0);
		f.rows()[0].focus(); f.mount.update(asSvg(f.svg), [data[1]]);
		assert.equal(f.active(), f.cls("abp-panel")); assert.equal(f.lists().length, 1);
		const external = new El("button", f.doc); f.container.append(external); external.focus();
		f.mount.update(asSvg(f.svg), [{ ...data[1], steps: [] }]);
		assert.equal(f.active(), external); assert.equal(f.rows().length, 0); assert.equal(f.cls("abp-empty").hidden, false);
	});
}

test("auto uses replacement dimensions and current data with a resize frame pending across rebind", t => {
	const f = setup(t, "auto"); const root = f.cls("ab-playback");
	const observer = [...f.doc.resize.observers][0];
	f.doc.resize.flush(); assert.equal(f.doc.frames.callbacks.size, 1);
	const next = image(f.doc, 400, 800);
	f.container.rect = { top: 0, bottom: 800, width: 720 };
	f.mount.update(asSvg(next), [data[1]]);
	assert.ok(root.classList.contains("abp-side"));
	assert.equal(root.style.properties.get("--abp-figure-width"), "400px");
	assert.equal([...f.doc.resize.observers][0], observer);
	f.doc.frames.flush(); assert.equal(f.doc.frames.callbacks.size, 0);
	assert.deepEqual(f.rows().map(row => row.children[2].textContent), ["Start"]);
	const focused = f.rows()[0]; focused.focus();
	f.container.rect.width = 719; f.doc.resize.flush(); f.doc.frames.flush();
	assert.ok(root.classList.contains("abp-below")); assert.equal(f.active(), f.cls("abp-panel"));
	f.mount.update(asSvg(next), [{ ...data[1], name: "Latest", steps: data[0].steps }]);
	f.container.rect.width = 720; f.doc.resize.flush(); f.doc.frames.flush();
	assert.ok(root.classList.contains("abp-side")); assert.equal(f.rows()[0], focused);
	assert.deepEqual(f.rows().map(row => row.children[0].textContent), ["07", "104"]);
	assert.equal(f.lists()[0].getAttribute("aria-label"), "Latest steps");
	f.mount.update(asSvg(image(f.doc, 800, 400)), data);
	assert.ok(root.classList.contains("abp-below"), "a landscape replacement no longer qualifies for auto side");
});

for (const shadow of [false, true]) for (const entry of ["mount", "player"] as const) {
	test(`rebind teardown restores current SVG and removes all listeners, observers and frames (${entry}, shadow=${shadow})`, t => {
		const f = setup(t, "side", shadow); const all = new Set(f.container.all());
		const root = f.cls("ab-playback"); const figure = f.cls("abp-figure");
		const next = image(f.doc);
		// A host replaces the SVG already inside the mount's figure wrapper.
		figure.insertBefore(next, f.svg); f.svg.remove(); f.mount.update(asSvg(next), [data[1], data[0]]);
		for (const el of f.container.all()) all.add(el);
		f.mount.update(asSvg(next), [data[0]]);
		for (const el of f.container.all()) all.add(el);
		f.player.play(); f.doc.resize.flush();
		const observer = [...f.doc.resize.observers][0]; const callback = [...f.doc.frames.callbacks.values()][0]; assert.ok(callback);
		f[entry].destroy(); f.mount.destroy(); f.player.destroy();
		assert.deepEqual(f.container.children, [f.before, next, f.after]);
		assert.equal(root.parent, null); assert.equal(f.svg.parent, null);
		assert.equal(f.doc.frames.callbacks.size, 0); assert.equal(f.doc.resize.observers.size, 0);
		assert.equal(f.doc.viewport.observers.size, 0); assert.equal(f.doc.motion.listeners.size, 0);
		assert.equal(f.doc.listeners.get("visibilitychange")?.size, 0);
		assert.ok([...all].every(el => [...el.listeners.values()].every(listeners => listeners.size === 0)));
		const dom = f.container.all(); observer.callback(); callback(0); t.mock.timers.tick(1000);
		f.mount.update(asSvg(f.svg), data); assert.deepEqual(f.container.all(), dom);
		assert.equal(f.doc.frames.callbacks.size, 0);
	});
}

test("empty transitions cancel resize work; callbacks from removed controls cannot change a rebuilt mount", t => {
	const f = setup(t); const row = f.rows()[0]; const click = [...row.listeners.get("click") ?? []][0];
	const observer = [...f.doc.resize.observers][0]; f.doc.resize.flush();
	const frame = [...f.doc.frames.callbacks.values()][0]; assert.ok(frame);
	f.mount.update(asSvg(f.svg), []);
	assert.deepEqual(f.container.children, [f.before, f.svg, f.after]);
	assert.equal(f.doc.resize.observers.size, 0); assert.equal(f.doc.frames.callbacks.size, 0);
	f.mount.update(asSvg(f.svg), [data[1]]); const root = f.cls("ab-playback"); const dom = f.container.all();
	const state = f.player.state;
	observer.callback(); frame(0); click({} as Event);
	assert.equal(f.player.state, state); assert.deepEqual(f.container.all(), dom); assert.equal(f.doc.frames.callbacks.size, 0);
	assert.equal(f.doc.resize.observers.size, 1); assert.ok([...f.doc.resize.observers][0].targets.has(root));
	for (let i = 0; i < 3; i++) {
		f.mount.update(asSvg(f.svg), []); f.mount.update(asSvg(f.svg), data);
	}
	assert.equal(f.doc.resize.observers.size, 1); assert.equal(f.doc.viewport.observers.size, 1);
	assert.equal(f.doc.listeners.get("visibilitychange")?.size, 1);
	assert.equal(f.container.all().filter(el => el.classList.contains("ab-playback")).length, 1);
});

test("replacement in another parent returns there on teardown, without restoring the outgoing SVG", t => {
	const f = setup(t); const external = new El("figure", f.doc); const next = image(f.doc); const after = new El("p", f.doc);
	external.append(next, after); f.mount.update(asSvg(next), data);
	assert.equal(next.parent, f.cls("abp-figure")); assert.equal(f.svg.parent, null);
	f.mount.destroy(); assert.deepEqual(external.children, [next, after]);
	assert.deepEqual(f.container.children, [f.before, f.after]);
});

test("window resize fallback continues after rebind and is removed on empty and teardown", t => {
	const doc = new Doc(); const listeners = new Set<() => void>();
	Object.assign(doc.defaultView, {
		ResizeObserver: undefined,
		addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
		removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
	});
	const f = setup(t, "auto", false, doc);
	assert.equal(listeners.size, 1);
	const resize = [...listeners][0]; f.mount.update(asSvg(image(doc, 400, 800)), [data[1]]);
	f.container.rect = { top: 0, bottom: 800, width: 719 }; resize(); assert.ok(f.cls("ab-playback").classList.contains("abp-below"));
	f.container.rect.width = 720; resize(); assert.ok(f.cls("ab-playback").classList.contains("abp-side"));
	f.mount.update(asSvg(f.svg), []); assert.equal(listeners.size, 0);
	f.mount.update(asSvg(f.svg), data); const dom = f.container.all(); resize(); assert.deepEqual(f.container.all(), dom);
	assert.equal(listeners.size, 1); f.mount.destroy(); assert.equal(listeners.size, 0);
});
