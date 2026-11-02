import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createPlayer, mountPlayback, type PlayerState } from "./flow/playback.ts";
import type { Timeline } from "./flow/play.ts";
import { Doc, El } from "./test-dom.ts";

const data: Timeline[] = [
	{ name: "Alpha", slug: "alpha", steps: [
		{ target: "a", kind: "box", actor: "Actor A", caption: "Caption A", ms: 100, parts: ["a"] },
		{ target: "b", kind: "box", actor: "Actor B", caption: "Caption B", ms: 200, parts: ["b"] },
	] },
	{ name: "Beta", slug: "beta", steps: [
		{ target: "b", kind: "box", actor: "Beta actor", caption: "Beta caption", ms: 100, parts: ["b"] },
	] },
	{ name: "Empty", slug: "empty", steps: [] },
];
const asSvg = (el: El) => el as unknown as SVGSVGElement;
function svg(doc: Doc) {
	const el = new El("svg", doc);
	for (const name of ["a", "b"]) {
		const part = new El("g", doc); part.setAttribute("data-ab-part", name); el.append(part);
	}
	return el;
}
function setup(t: TestContext, options: { autoplay?: boolean; pauseWhenOffscreen?: boolean } = {}, timelines = data, doc = new Doc()) {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const host = new El("main", doc);
	const image = svg(doc); host.append(image);
	const mount = mountPlayback(host as unknown as HTMLElement, asSvg(image), timelines, options);
	t.after(() => mount.destroy());
	const cls = (name: string) => {
		const result = host.all().find(el => el.classList.contains(name));
		assert.ok(result, name); return result;
	};
	const tabs = () => host.all().filter(el => el.getAttribute("role") === "tab");
	return { host, image, doc, mount, player: mount.player, cls, tabs };
}

for (const shadow of [false, true]) {
	test(`standalone lifecycle checks preserve the frame and manual navigation (${shadow ? "shadow" : "document"})`, t => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const doc = new Doc(); const image = svg(doc);
		if (shadow) Object.assign(image, { getRootNode: () => ({ host: {} }) });
		const changes: PlayerState[] = [];
		const player = createPlayer(asSvg(image), data, { onChange: state => changes.push(state) });
		t.after(() => player.destroy());
		image.connected = false; player.play(); assert.equal(changes.length, 0);
		image.connected = true; doc.setHidden(true); player.play(); assert.equal(changes.length, 0);
		doc.setHidden(false); player.play();
		image.connected = false; t.mock.timers.tick(100);
		assert.deepEqual(player.state, { scenario: 0, step: 0, status: "paused" });
		image.connected = true; t.mock.timers.tick(1000); assert.equal(player.state.step, 0);
		player.play(); doc.setHidden(true);
		assert.deepEqual(player.state, { scenario: 0, step: 0, status: "paused" });
		t.mock.timers.tick(1000); assert.equal(player.state.step, 0);
		player.next(); assert.equal(player.state.step, 1);
		player.previous(); assert.equal(player.state.step, 0);
		player.seek(-1); player.select("beta");
		assert.deepEqual(player.state, { scenario: 1, step: 0, status: "paused" });
		doc.setHidden(false); t.mock.timers.tick(1000); assert.equal(player.state.status, "paused");
		player.play(); t.mock.timers.tick(100); assert.equal(player.state.status, "ended");
		player.destroy(); assert.equal(doc.listeners.get("visibilitychange")?.size, 0);
	});
}

test("timer checks visibility even without an event; removal and reinsertion between checks is undetected", t => {
	const f = setup(t);
	f.player.play(); f.image.connected = false; f.image.connected = true;
	t.mock.timers.tick(100); assert.equal(f.player.state.step, 1);
	f.doc.visibilityState = "hidden"; t.mock.timers.tick(200);
	assert.deepEqual(f.player.state, { scenario: 0, step: 1, status: "paused" });
	f.doc.visibilityState = "visible"; f.player.play();
	f.doc.hidden = true; t.mock.timers.tick(200); assert.equal(f.player.state.status, "paused");
});

test("hidden and disconnected tab activations do not select, reset or notify", t => {
	const f = setup(t, { autoplay: true });
	const states: PlayerState[] = []; f.player.subscribe(state => states.push(state));
	f.doc.setHidden(true); f.tabs()[1].click(); f.player.play();
	assert.equal(states.length, 0);
	f.doc.setHidden(false); f.image.connected = false;
	f.tabs()[1].fire("keydown", "Enter"); assert.equal(states.length, 0);
	f.image.connected = true; assert.equal(states.length, 0);
	f.doc.viewport.show(true); assert.equal(f.player.state.status, "playing");
	f.tabs()[1].click(); assert.equal(f.player.state.scenario, 1); assert.equal(f.player.state.status, "playing");
});

for (const mounted of [false, true]) {
	test(`optional viewport pausing never starts or resumes without autoplay (${mounted ? "mount" : "standalone"})`, t => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const doc = new Doc(); const image = svg(doc); const host = new El("main", doc); host.append(image);
		const player = mounted
			? mountPlayback(host as unknown as HTMLElement, asSvg(image), data, { pauseWhenOffscreen: true }).player
			: createPlayer(asSvg(image), data, { pauseWhenOffscreen: true });
		t.after(() => player.destroy());
		doc.viewport.show(true, 0.2); assert.equal(player.state.status, "idle");
		player.play(); doc.viewport.show(true, 0.1); assert.equal(player.state.status, "playing");
		doc.viewport.show(false); assert.deepEqual(player.state, { scenario: 0, step: 0, status: "paused" });
		player.play(); t.mock.timers.tick(1000); assert.equal(player.state.step, 0);
		player.select("beta"); assert.equal(player.state.scenario, 1);
		doc.viewport.show(true); assert.equal(player.state.status, "paused");
		player.play(); t.mock.timers.tick(100); assert.equal(player.state.status, "ended");
	});
}

for (const pauseWhenOffscreen of [false, true]) {
	test(`autoplay uses half visibility for entry and no intersection for exit (pauseWhenOffscreen=${pauseWhenOffscreen})`, t => {
		const f = setup(t, { autoplay: true, pauseWhenOffscreen });
		f.doc.viewport.show(true, 0.49); assert.equal(f.player.state.status, "idle");
		f.doc.viewport.show(true, 0.5); assert.equal(f.player.state.status, "playing");
		f.doc.viewport.show(true, 0.1); assert.equal(f.player.state.status, "playing");
		f.doc.viewport.show(false); assert.equal(f.player.state.status, "paused");
		f.doc.viewport.show(true, 0.49); assert.equal(f.player.state.status, "paused");
		f.doc.viewport.show(true, 0.5); assert.equal(f.player.state.status, "playing");
		f.doc.viewport.show(false); f.player.pause(); f.doc.viewport.show(true);
		assert.equal(f.player.state.status, "paused", "manual pause while already paused cancels resume");
		f.player.play(); f.doc.viewport.show(false); f.player.next(); f.doc.viewport.show(true);
		assert.equal(f.player.state.status, "paused", "navigation cancels resume");
		f.player.play(); f.doc.viewport.show(false); f.doc.motion.set(true); f.doc.viewport.show(true);
		assert.equal(f.player.state.status, "paused");
		f.doc.motion.set(false); assert.equal(f.player.state.status, "paused");
	});
}

test("lifecycle pauses revoke autoplay when they pause a playing player", t => {
	const f = setup(t, { autoplay: true });
	f.doc.viewport.show(true); f.doc.setHidden(true); f.doc.setHidden(false); f.doc.viewport.show(true);
	assert.equal(f.player.state.status, "paused");
	f.player.play(); f.image.connected = false; t.mock.timers.tick(100);
	f.image.connected = true; f.doc.viewport.show(true); assert.equal(f.player.state.status, "paused");
	f.player.play(); assert.equal(f.player.state.status, "playing");
});

for (const pauseWhenOffscreen of [false, true]) {
	for (const started of [false, true]) {
		test(`lifecycle checks preserve ${started ? "viewport resume" : "first-view autoplay"} intent (pauseWhenOffscreen=${pauseWhenOffscreen})`, t => {
			const f = setup(t, { autoplay: true, pauseWhenOffscreen });
			if (started) f.doc.viewport.show(true);
			f.doc.viewport.show(false);
			const snapshot = f.player.state;
			const states: PlayerState[] = []; f.player.subscribe(state => states.push(state));
			f.doc.setHidden(true);
			f.doc.viewport.show(false);
			f.doc.setHidden(false);
			f.image.connected = false; f.doc.viewport.show(false); f.image.connected = true;
			f.doc.viewport.show(true, 0.49);
			assert.equal(f.player.state, snapshot); assert.equal(states.length, 0);
			f.doc.viewport.show(true, 0.5);
			assert.equal(f.player.state.status, "playing"); assert.equal(states.length, 1);
			t.mock.timers.tick(100); assert.equal(f.player.state.step, 1);
		});
	}
}

for (const action of ["api", "button", "space", "tab click", "tab key"]) {
	test(`autoplay alone permits explicit off-screen playback via ${action}`, t => {
		const f = setup(t, { autoplay: true });
		f.doc.viewport.show(false);
		if (action === "api") f.player.play();
		else if (action === "button") f.cls("abp-toggle").click();
		else if (action === "space") f.cls("abp-panel").fire("keydown", " ");
		else if (action === "tab click") f.tabs()[1].click();
		else f.tabs()[1].fire("keydown", "Enter");
		const tab = action.startsWith("tab");
		assert.deepEqual(f.player.state, { scenario: tab ? 1 : 0, step: 0, status: "playing" });
		t.mock.timers.tick(100);
		assert.equal(f.player.state.status, tab ? "ended" : "playing");
		assert.equal(f.player.state.step, tab ? 0 : 1);
	});
}

for (const autoplay of [false, true]) {
	test(`off-screen scenario activation selects but cannot play with viewport pausing (autoplay=${autoplay})`, t => {
		const f = setup(t, { autoplay, pauseWhenOffscreen: true });
		f.doc.viewport.show(false);
		f.tabs()[1].click();
		assert.deepEqual(f.player.state, { scenario: 1, step: 0, status: "paused" });
		f.tabs()[0].fire("keydown", "Enter");
		assert.deepEqual(f.player.state, { scenario: 0, step: 0, status: "paused" });
		f.cls("abp-toggle").click(); f.cls("abp-panel").fire("keydown", " "); f.player.play();
		t.mock.timers.tick(1000);
		assert.deepEqual(f.player.state, { scenario: 0, step: 0, status: "paused" });
		f.doc.viewport.show(true); assert.equal(f.player.state.status, "paused");
		f.tabs()[1].click(); assert.equal(f.player.state.status, "playing");
	});
}

test("without IntersectionObserver both APIs retain lifecycle guards", t => {
	const doc = new Doc(); Object.assign(doc.defaultView, { IntersectionObserver: undefined });
	const f = setup(t, { autoplay: true, pauseWhenOffscreen: true }, data, doc);
	assert.equal(doc.viewport.observers.size, 0); assert.equal(f.player.state.status, "idle");
	const direct = createPlayer(asSvg(svg(doc)), data, { pauseWhenOffscreen: true });
	t.after(() => direct.destroy());
	f.player.play(); direct.play(); doc.setHidden(true);
	assert.equal(f.player.state.status, "paused"); assert.equal(direct.state.status, "paused");
});

test("slug selection is exact, reselects from the start and ignores invalid selections", t => {
	const f = setup(t); const states: PlayerState[] = []; f.player.subscribe(state => states.push(state));
	f.player.select("beta"); assert.equal(f.player.state.scenario, 1);
	f.player.select("alpha"); f.player.seek(1); f.player.select("alpha"); assert.equal(f.player.state.step, 0);
	const snapshot = f.player.state; const count = states.length;
	for (const value of ["Alpha", "unknown", "0", -1, 0.5, NaN, Infinity, 3]) f.player.select(value);
	assert.equal(f.player.state, snapshot); assert.equal(states.length, count);
	f.player.select("empty"); assert.equal(f.player.state.step, -1);
});

test("subscriptions coexist with onChange, unsubscribe independently and keep stable snapshots", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const image = svg(new Doc()); const changes: PlayerState[] = []; const extra: PlayerState[] = [];
	const player = createPlayer(asSvg(image), data, { onChange: state => changes.push(state) });
	const listener = (state: PlayerState) => { assert.ok(Object.isFrozen(state)); extra.push(state); };
	const off = player.subscribe(listener); const off2 = player.subscribe(listener);
	assert.equal(extra.length, 0);
	player.select("alpha"); player.select("alpha"); assert.equal(extra.length, 2); assert.equal(changes.length, 1);
	off(); off(); player.play(); assert.equal(extra.length, 3); assert.equal(changes.length, 2);
	const snapshot = extra[0]; t.mock.timers.tick(100); assert.equal(snapshot.step, 0);
	off2(); const count = extra.length; player.pause(); assert.equal(extra.length, count);
	player.destroy(); const changeCount = changes.length;
	const inert = player.subscribe(() => assert.fail("destroyed")); inert(); inert(); player.play(); player.select(0);
	assert.equal(changes.length, changeCount);
});

test("rebind retains player, panel and actions; slug tabs survive reorder with focus", t => {
	const f = setup(t, { autoplay: true });
	const player = f.player; const panel = f.cls("abp-panel"); const actions = f.cls("abp-actions").all();
	const beta = f.tabs()[1]; beta.focus(); player.select("beta"); player.play();
	const replacement = svg(f.doc); replacement.className = "ab ab-dark"; f.host.append(replacement);
	const observed: PlayerState[] = [];
	player.subscribe(state => {
		observed.push(state);
		assert.equal(f.cls("abp-actor").textContent, "New actor");
		assert.equal(f.cls("abp-caption").textContent, "New caption");
	});
	const changed = { ...data[1], name: "Renamed beta", steps: [{ ...data[1].steps[0], actor: "New actor", caption: "New caption", parts: ["a"] }] };
	f.mount.update(asSvg(replacement), [changed, data[0], data[2]]);
	assert.equal(f.mount.player, player); assert.equal(f.cls("abp-panel"), panel);
	assert.deepEqual(f.cls("abp-actions").all().filter(el => el.tag === "button" || el.type === "range"), actions.filter(el => el.tag === "button" || el.type === "range"));
	assert.equal(f.tabs()[0], beta); assert.equal(f.doc.activeElement, beta); assert.equal(beta.textContent, "Renamed beta");
	assert.deepEqual(player.state, { scenario: 0, step: 0, status: "paused" });
	assert.equal(f.cls("abp-status").textContent, "New actor: New caption");
	assert.ok(f.cls("ab-playback").classList.contains("ab-dark"));
	assert.ok(f.image.all().every(el => !el.classList.contains("ab-current") && !el.classList.contains("ab-played") && !el.classList.contains("ab-playing")));
	f.doc.viewport.show(true); t.mock.timers.tick(1000); assert.equal(player.state.status, "paused");
	assert.equal(observed.length, 1);
});

test("same-tuple rebind refreshes all controls silently and retains action focus", t => {
	const f = setup(t); f.player.select(0);
	const range = f.host.all().find(el => el.type === "range"); assert.ok(range); range.focus();
	const snapshot = f.player.state;
	let calls = 0; f.player.subscribe(() => calls++);
	const replacement = svg(f.doc); replacement.className = "ab ab-light";
	const changed = { ...data[0], steps: [{ ...data[0].steps[0], actor: "Changed", caption: "Changed caption" }] };
	f.mount.update(asSvg(replacement), [changed]);
	assert.equal(f.player.state, snapshot); assert.equal(calls, 0);
	assert.equal(f.doc.activeElement, range); assert.equal(f.cls("abp-panel").tabIndex, 0);
	assert.equal(f.tabs().length, 0); assert.equal(range.max, "0"); assert.equal(range.value, "0");
	assert.equal(f.cls("abp-counter").textContent, "1/1");
	assert.equal(f.cls("abp-actor").textContent, "Changed"); assert.equal(f.cls("abp-caption").textContent, "Changed caption");
	assert.equal(f.cls("abp-status").textContent, "Changed: Changed caption");
	assert.equal(f.host.all().filter(el => el.classList.contains("abp-segment")).length, 1);
	assert.ok(f.cls("ab-playback").classList.contains("ab-light"));
});

test("removed tabs and single-scenario tabs focus the panel; unrelated focus stays put", t => {
	const f = setup(t); const panel = f.cls("abp-panel");
	f.tabs()[1].focus(); f.mount.update(asSvg(f.image), [data[0], data[2]]);
	assert.equal(f.doc.activeElement, panel);
	f.tabs()[1].focus(); f.mount.update(asSvg(f.image), [data[2]]); assert.equal(f.doc.activeElement, panel);
	const external = new El("button", f.doc); external.focus();
	f.mount.update(asSvg(f.image), data); assert.equal(f.doc.activeElement, external);
});

test("empty bindings remove owned DOM and can be populated without duplicate resources", t => {
	const f = setup(t, { autoplay: true }, []); const retained = new El("p", f.doc); f.host.append(retained);
	assert.deepEqual(f.host.children, [f.image, retained]);
	f.mount.update(asSvg(f.image), data); f.player.select("beta");
	const panel = f.cls("abp-panel"); panel.focus();
	const old = f.host.all().filter(el => el !== f.image && el !== retained && el !== f.host);
	f.mount.update(asSvg(f.image), []);
	assert.deepEqual(f.player.state, { scenario: 0, step: -1, status: "paused" });
	assert.deepEqual(f.host.children, [f.image, retained]); assert.notEqual(f.doc.activeElement, retained);
	assert.ok(old.every(el => [...el.listeners.values()].every(listeners => listeners.size === 0)));
	for (let i = 0; i < 4; i++) f.mount.update(asSvg(f.image), [data[2], data[0]]);
	assert.deepEqual(f.player.state, { scenario: 0, step: -1, status: "paused" });
	assert.equal(f.host.all().filter(el => el.tag === "style").length, 1);
	assert.equal(f.host.all().filter(el => el.classList.contains("ab-playback")).length, 1);
	assert.equal(f.doc.viewport.observers.size, 1); assert.equal(f.doc.listeners.get("visibilitychange")?.size, 1);
});

for (const entry of ["player", "mount"] as const) {
	test(`old callbacks and both teardown paths are inert after rebinding (${entry})`, t => {
		const f = setup(t, { autoplay: true, pauseWhenOffscreen: true });
		const oldObserver = [...f.doc.viewport.observers][0];
		const oldVisibility = [...f.doc.listeners.get("visibilitychange") ?? []][0];
		f.player.play();
		const nextDoc = new Doc(); const nextImage = svg(nextDoc); f.host.append(nextImage);
		f.mount.update(asSvg(nextImage), [data[1]]);
		assert.equal(f.doc.viewport.observers.size, 0); assert.equal(f.doc.listeners.get("visibilitychange")?.size, 0);
		f.player.play();
		oldObserver.callback([{ target: f.image, isIntersecting: false, intersectionRatio: 0 }]);
		f.doc.hidden = true; oldVisibility(); assert.equal(f.player.state.status, "playing");
		t.mock.timers.tick(100); assert.equal(f.player.state.status, "ended");
		assert.ok(nextImage.children[1].classList.contains("ab-current"));
		const controls = f.cls("ab-playback").all();
		const currentObserver = [...nextDoc.viewport.observers][0];
		let calls = 0; f.player.subscribe(() => calls++);
		f[entry].destroy(); const snapshot = f.player.state; const dom = f.host.all();
		f.mount.update(asSvg(f.image), data); f.player.play(); f.player.select("alpha");
		f.player.subscribe(() => assert.fail("destroyed"))();
		currentObserver.callback([{ target: nextImage, isIntersecting: true, intersectionRatio: 1 }]);
		nextDoc.setHidden(true); for (const el of controls) { el.click(); el.fire("keydown", " "); }
		t.mock.timers.tick(10000);
		assert.equal(f.player.state, snapshot); assert.equal(calls, 0); assert.deepEqual(f.host.all(), dom);
		assert.equal(nextDoc.viewport.observers.size, 0); assert.equal(nextDoc.listeners.get("visibilitychange")?.size, 0);
		assert.ok(controls.every(el => [...el.listeners.values()].every(listeners => listeners.size === 0)));
	});
}

test("panel-only shortcuts preserve native descendant behavior and editable/modifier isolation", t => {
	const f = setup(t); const panel = f.cls("abp-panel");
	assert.equal(panel.tabIndex, 0); panel.focus();
	assert.ok(panel.fire("keydown", " ")); assert.equal(f.player.state.status, "playing");
	assert.ok(panel.fire("keydown", " ")); assert.equal(f.player.state.status, "paused");
	assert.ok(panel.fire("keydown", "ArrowRight")); assert.equal(f.player.state.step, 1);
	assert.ok(panel.fire("keydown", "ArrowLeft")); assert.equal(f.player.state.step, 0);
	for (const key of ["altKey", "ctrlKey", "metaKey", "shiftKey"]) assert.equal(panel.fire("keydown", " ", { [key]: true }), false);
	for (const control of f.cls("abp-actions").all().filter(el => el.tag === "button" || el.type === "range")) {
		assert.equal(control.fire("keydown", " "), false); assert.equal(control.fire("keydown", "ArrowRight"), false);
	}
	const edit = new El("div", f.doc); edit.contentEditable = "true"; panel.append(edit);
	assert.equal(edit.fire("keydown", " "), false);
	f.host.contentEditable = "true"; assert.equal(panel.fire("keydown", "ArrowRight"), false);
	assert.equal(f.player.state.step, 0); f.host.contentEditable = "false";
	assert.ok(f.tabs()[0].fire("keydown", "ArrowRight")); assert.equal(f.player.state.scenario, 1);
	assert.equal(f.player.state.step, 0, "bubbling tab keys are not handled twice");
	f.player.play(); t.mock.timers.tick(100); assert.equal(f.player.state.status, "ended");
	assert.ok(panel.fire("keydown", " ")); assert.equal(f.player.state.status, "playing");
});

test("single panel shortcuts and independent shadow/document focus stay local", t => {
	const f = setup(t, {}, [data[0]]);
	const shadow = new El("#shadow-root", f.doc); const image = svg(f.doc); shadow.append(image);
	const other = mountPlayback(shadow as unknown as ShadowRoot, asSvg(image), data);
	t.after(() => other.destroy());
	const otherPanel = shadow.all().find(el => el.classList.contains("abp-panel")); assert.ok(otherPanel);
	assert.ok(f.cls("abp-panel").fire("keydown", " ")); assert.equal(other.player.state.status, "idle");
	assert.ok(otherPanel.fire("keydown", "ArrowRight")); assert.equal(other.player.state.status, "paused");
	assert.equal(f.player.state.status, "playing"); assert.equal(new El("button", f.doc).fire("keydown", " "), false);
});

test("shadow-root rebinding finds focused tabs through the local activeElement", t => {
	const f = setup(t); f.host.tag = "#shadow-root";
	const tab = f.tabs()[1]; tab.focus();
	assert.equal(f.doc.activeElement, f.host); assert.equal(f.host.activeElement, tab);
	f.mount.update(asSvg(f.image), [data[1], data[0], data[2]]);
	assert.equal(f.host.activeElement, tab); assert.equal(f.tabs()[0], tab);
	f.mount.update(asSvg(f.image), [data[0]]);
	assert.equal(f.host.activeElement, f.cls("abp-panel"));
});

test("queued timers and reduced-motion callbacks cannot affect a replacement binding", t => {
	const f = setup(t);
	const timeout = t.mock.method(globalThis, "setTimeout");
	f.player.play();
	const oldTimer = timeout.mock.calls[0].arguments[0];
	const oldMotion = [...f.doc.motion.listeners][0];
	const next = svg(f.doc); f.host.append(next); f.mount.update(asSvg(next), data);
	f.player.play(); const snapshot = f.player.state;
	oldTimer(); oldMotion({ matches: true } as MediaQueryListEvent);
	assert.equal(f.player.state, snapshot);
	t.mock.timers.tick(100); assert.equal(f.player.state.step, 1);
	const currentTimer = timeout.mock.calls.at(-1)?.arguments[0]; assert.ok(currentTimer);
	const currentMotion = [...f.doc.motion.listeners][0];
	f.player.destroy(); const destroyed = f.player.state;
	currentTimer(); currentMotion({ matches: true } as MediaQueryListEvent);
	assert.equal(f.player.state, destroyed);
});

test("listeners can unsubscribe or navigate during notification without duplicate or unstable snapshots", t => {
	const f = setup(t); const one: PlayerState[] = []; const two: PlayerState[] = [];
	const off = f.player.subscribe(state => {
		one.push(state);
		if (state.status === "playing") { off(); f.player.pause(); }
	});
	f.player.subscribe(state => two.push(state));
	f.player.play();
	assert.deepEqual(one.map(state => state.status), ["playing"]);
	assert.deepEqual(two.map(state => state.status), ["playing", "paused"]);
	assert.ok(two.every(state => Object.isFrozen(state)));
	t.mock.timers.tick(1000); assert.equal(f.player.state.step, 0);
});
