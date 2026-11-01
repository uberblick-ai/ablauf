import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mountPlayback } from "./flow/playback.ts";
import type { Timeline } from "./flow/play.ts";

// Deliberately small DOM fakes: no parsing, innerHTML or browser dependency.
class Motion {
	matches = false;
	listeners = new Set<(event: MediaQueryListEvent) => void>();
	matchMedia = () => this;
	addEventListener(_type: string, listener: (event: MediaQueryListEvent) => void) { this.listeners.add(listener); }
	removeEventListener(_type: string, listener: (event: MediaQueryListEvent) => void) { this.listeners.delete(listener); }
	set(matches: boolean) {
		this.matches = matches;
		for (const listener of [...this.listeners]) listener({ matches } as MediaQueryListEvent);
	}
}

class Doc {
	activeElement: El | null = null;
	motion = new Motion();
	defaultView = { matchMedia: this.motion.matchMedia };
	createElement(tag: string): El { return new El(tag, this); }
}

class El {
	tag: string;
	ownerDocument: Doc;
	children: El[] = [];
	parent: El | null = null;
	attrs = new Map<string, string>();
	listeners = new Map<string, Set<(event: Event) => void>>();
	className = "";
	id = "";
	type = "";
	disabled = false;
	tabIndex = 0;
	min = "";
	max = "";
	step = "";
	value = "";
	writes = 0;
	private text = "";
	constructor(tag: string, doc: Doc) { this.tag = tag; this.ownerDocument = doc; }
	set innerHTML(_value: string) { assert.fail("Source text must never be parsed as HTML"); }
	get textContent(): string { return this.text + this.children.map(el => el.textContent).join(""); }
	set textContent(text: string) {
		this.writes++;
		this.text = text;
		for (const child of this.children) child.parent = null;
		this.children = [];
	}
	classList = {
		contains: (name: string) => this.className.split(" ").includes(name),
		toggle: (name: string, force: boolean) => {
			const names = new Set(this.className.split(" ").filter(Boolean));
			if (force) names.add(name); else names.delete(name);
			this.className = [...names].join(" ");
			return force;
		},
	};
	append(...els: El[]) { for (const el of els) { el.remove(); el.parent = this; this.children.push(el); } }
	remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
	setAttribute(name: string, value: string) { this.attrs.set(name, value); }
	getAttribute(name: string) { return this.attrs.get(name) ?? null; }
	addEventListener(type: string, listener: (event: Event) => void) {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)?.add(listener);
	}
	removeEventListener(type: string, listener: (event: Event) => void) { this.listeners.get(type)?.delete(listener); }
	fire(type: string, key = "") {
		let prevented = false;
		const event = { type, key, preventDefault() { prevented = true; } } as unknown as Event;
		for (const listener of this.listeners.get(type) ?? []) listener(event);
		return prevented;
	}
	click() { if (!this.disabled) this.fire("click"); }
	focus() { this.ownerDocument.activeElement = this; }
	all(): El[] { return [this, ...this.children.flatMap(el => el.all())]; }
	querySelectorAll(selector: string) {
		assert.equal(selector, "[data-ab-part]");
		return this.all().filter(el => el.attrs.has("data-ab-part"));
	}
}

const timelines: Timeline[] = [
	{ name: '<b>First</b> & "safe"', slug: "first", steps: [
		{ target: "a", kind: "box", actor: "<img onerror=alert(1)>", caption: "<script>remark</script>", ms: 100, parts: ["a"] },
		{ target: "b", kind: "box", actor: "Second actor", caption: "Second remark", ms: 200, parts: ["b"] },
	] },
	{ name: "Second", slug: "second", steps: [
		{ target: "b", kind: "box", actor: "Other actor", caption: "", ms: 300, parts: ["b"] },
	] },
	{ name: "Empty", slug: "empty", steps: [] },
];

function setup(t: TestContext, data = timelines, options: { loop?: boolean; scheme?: string; shadow?: boolean; doc?: Doc } = {}) {
	const doc = options.doc ?? new Doc();
	const container = new El(options.shadow ? "#shadow-root" : "main", doc);
	const retained = new El("p", doc);
	retained.textContent = "Host content";
	const svg = new El("svg", doc);
	svg.className = `ab ab-${options.scheme ?? "auto"}`;
	for (const name of ["a", "b"]) {
		const part = new El("g", doc);
		part.setAttribute("data-ab-part", name);
		svg.append(part);
	}
	container.append(retained, svg);
	const mount = mountPlayback(container as unknown as HTMLElement, svg as unknown as SVGSVGElement, data, options);
	t.after(() => mount.destroy());
	const all = () => container.all();
	const role = (name: string) => all().filter(el => el.getAttribute("role") === name);
	const cls = (name: string) => all().find(el => el.classList.contains(name)) as El;
	const actions = () => cls("abp-actions").all().filter(el => el.tag === "button");
	return { mount, player: mount.player, doc, container, retained, svg, all, role, cls, actions,
		range: all().find(el => el.type === "range") as El };
}

test("mount starts idle; source-order tabs, labelled panel, native actions and range have safe text", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const f = setup(t);
	assert.deepEqual(f.player.state, { scenario: 0, step: -1, status: "idle" });
	assert.deepEqual(f.cls("ab-playback").children.map(el => el.className), ["abp-tabs", "abp-panel", "abp-status"]);
	assert.deepEqual(f.role("tab").map(el => el.textContent), timelines.map(timeline => timeline.name));
	assert.equal(f.role("tablist")[0].getAttribute("aria-label"), "Scenarios");
	assert.equal(f.role("tabpanel")[0].getAttribute("aria-labelledby"), f.role("tab")[0].id);
	assert.ok(f.role("tab").every(tab => tab.type === "button" && tab.getAttribute("aria-controls") === f.role("tabpanel")[0].id));
	assert.deepEqual(f.role("tab").map(tab => tab.tabIndex), [0, -1, -1]);
	assert.deepEqual(f.actions().map(button => button.textContent), ["Previous", "Play", "Next"]);
	assert.ok(f.actions().every(button => button.type === "button"));
	assert.equal(f.range.parent?.tag, "label");
	assert.ok(f.range.parent?.textContent.startsWith("Step"));
	assert.equal(f.range.min, "-1");
	assert.equal(f.range.max, "1");
	assert.equal(f.range.value, "-1");
	assert.equal(f.range.step, "1");
	assert.equal(f.range.getAttribute("aria-valuetext"), "Full figure");
	assert.equal(f.cls("abp-actor").textContent, "");
	assert.equal(f.cls("abp-caption").textContent, "");
	t.mock.timers.tick(60000);
	assert.equal(f.player.state.status, "idle");
	f.actions()[2].click();
	assert.equal(f.cls("abp-actor").textContent, timelines[0].steps[0].actor);
	assert.equal(f.cls("abp-caption").textContent, timelines[0].steps[0].caption);
	assert.equal(f.cls("abp-actor").children.length, 0);
	assert.equal(f.cls("abp-caption").children.length, 0);
	assert.equal(f.range.getAttribute("aria-valuetext"), "Step 1 of 2");
});

test("buttons, range and direct player calls synchronize without replacing or focusing controls", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const f = setup(t);
	const [previous, toggle, next] = f.actions();
	f.range.focus();
	const elements = f.all();
	toggle.click();
	assert.equal(toggle.textContent, "Pause");
	assert.equal(f.range.value, "0");
	toggle.click();
	assert.equal(f.player.state.status, "paused");
	assert.equal(toggle.textContent, "Play");
	toggle.click();
	t.mock.timers.tick(100);
	assert.equal(f.range.value, "1");
	assert.equal(f.cls("abp-caption").textContent, "Second remark");
	t.mock.timers.tick(200);
	assert.equal(toggle.textContent, "Replay");
	toggle.click();
	assert.equal(f.range.value, "0");
	assert.equal(toggle.textContent, "Pause");
	next.click();
	assert.equal(f.player.state.status, "paused");
	previous.click(); previous.click();
	assert.equal(f.range.value, "-1");
	assert.equal(f.cls("abp-caption").textContent, "");
	f.range.value = "1"; f.range.fire("input");
	assert.equal(f.player.state.step, 1);
	f.player.select(1);
	assert.equal(f.range.max, "0");
	assert.equal(f.range.value, "0");
	assert.equal(f.role("tab")[1].getAttribute("aria-selected"), "true");
	f.player.seek(-1); f.player.next(); f.player.play(); f.player.pause(); f.player.previous();
	assert.equal(f.range.value, "-1");
	assert.equal(toggle.textContent, "Play");
	assert.deepEqual(f.all(), elements);
	assert.equal(f.doc.activeElement, f.range);
});

test("tabs wrap, focus and immediately activate; clicks and Enter/Space reselect at step zero", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const f = setup(t);
	const tabs = f.role("tab");
	f.player.play();
	assert.ok(tabs[0].fire("keydown", "ArrowLeft"));
	assert.equal(f.doc.activeElement, tabs[2]);
	assert.deepEqual(f.player.state, { scenario: 2, step: -1, status: "paused" });
	assert.ok(tabs[2].fire("keydown", "ArrowRight"));
	assert.equal(f.doc.activeElement, tabs[0]);
	assert.deepEqual(f.player.state, { scenario: 0, step: 0, status: "paused" });
	assert.deepEqual(tabs.map(tab => tab.tabIndex), [0, -1, -1]);
	f.player.seek(1); f.player.play();
	assert.ok(tabs[0].fire("keydown", "Enter"));
	assert.equal(f.player.state.step, 0);
	f.player.seek(1);
	assert.ok(tabs[0].fire("keydown", " "));
	assert.equal(f.player.state.step, 0);
	tabs[1].click();
	assert.deepEqual(f.player.state, { scenario: 1, step: 0, status: "paused" });
	assert.equal(f.role("tabpanel")[0].getAttribute("aria-labelledby"), tabs[1].id);
	assert.equal(tabs[0].fire("keydown", "x"), false);
	assert.ok(tabs[1].fire("keydown", "End"));
	assert.equal(f.player.state.scenario, 2);
	assert.ok(tabs[2].fire("keydown", "Home"));
	assert.equal(f.player.state.scenario, 0);
	t.mock.timers.tick(60000);
	assert.equal(f.player.state.status, "paused");
});

test("one polite atomic status announces only scenario/step changes to playable steps", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const f = setup(t);
	const [status] = f.role("status");
	assert.equal(f.role("status").length, 1);
	assert.equal(status.getAttribute("aria-live"), "polite");
	assert.equal(status.getAttribute("aria-atomic"), "true");
	assert.equal(status.textContent, "");
	f.player.next();
	assert.equal(status.textContent, `${timelines[0].steps[0].actor}: ${timelines[0].steps[0].caption}`);
	let count = status.writes;
	f.player.play(); f.player.pause(); f.player.play();
	assert.equal(status.writes, count);
	t.mock.timers.tick(100);
	assert.equal(status.textContent, "Second actor: Second remark");
	count = status.writes;
	t.mock.timers.tick(200);
	assert.equal(status.writes, count);
	f.player.select(1);
	assert.equal(status.textContent, "Other actor");
	count = status.writes;
	f.player.select(1);
	assert.equal(status.writes, count);
	f.player.seek(-1);
	assert.equal(status.textContent, "");
});

test("timers, looping and reduced-motion resets update the same focused controls", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const f = setup(t, timelines, { loop: true });
	const toggle = f.actions()[1];
	toggle.focus();
	f.player.play();
	t.mock.timers.tick(100); t.mock.timers.tick(200);
	assert.equal(f.range.value, "0");
	assert.equal(toggle.textContent, "Pause");
	assert.equal(f.cls("abp-actor").textContent, timelines[0].steps[0].actor);
	f.doc.motion.set(true);
	assert.equal(toggle.textContent, "Play");
	assert.equal(f.range.value, "-1");
	assert.equal(f.cls("abp-actor").textContent, "");
	assert.equal(f.role("status")[0].textContent, "");
	assert.equal(f.doc.activeElement, toggle);
	f.player.next(); f.player.play();
	assert.equal(f.range.value, "-1");
	f.doc.motion.set(false); t.mock.timers.tick(60000);
	assert.equal(toggle.textContent, "Play");
	f.player.select(1); f.player.play();
	const writes = f.role("status")[0].writes;
	t.mock.timers.tick(300); t.mock.timers.tick(300);
	assert.equal(f.role("status")[0].writes, writes);
});

test("no timelines adds nothing; single and empty scenarios retain their own selection", t => {
	const none = setup(t, []);
	assert.deepEqual(none.container.children, [none.retained, none.svg]);
	none.mount.destroy();
	assert.deepEqual(none.container.children, [none.retained, none.svg]);
	const single = setup(t, [timelines[0]]);
	assert.equal(single.role("tablist").length, 0);
	assert.equal(single.role("tabpanel").length, 0);
	const empty = setup(t, [timelines[2], timelines[0]]);
	assert.equal(empty.cls("abp-caption").textContent, "No playable steps");
	assert.ok([...empty.actions(), empty.range].every(el => el.disabled));
	assert.equal(empty.range.min, "-1");
	assert.equal(empty.range.max, "-1");
	assert.equal(empty.range.value, "-1");
	empty.actions()[1].click(); empty.player.play();
	assert.equal(empty.player.state.scenario, 0);
	empty.role("tab")[1].click();
	assert.ok([...empty.actions(), empty.range].every(el => !el.disabled));
	empty.role("tab")[0].click();
	assert.equal(empty.player.state.scenario, 0);
	assert.equal(empty.cls("abp-caption").textContent, "No playable steps");
	assert.equal(empty.role("status")[0].textContent, "");
});

test("every CSS selector is scoped; all schemes have independent token defaults", t => {
	for (const scheme of ["auto", "light", "dark"]) {
		const f = setup(t, timelines, { scheme });
		assert.ok(f.cls("ab-playback").classList.contains(`ab-${scheme}`));
		const css = f.all().find(el => el.tag === "style")?.textContent ?? "";
		const selectors = [...css.matchAll(/([^{}]+)\{/g)].map(match => match[1].trim()).filter(selector => !selector.startsWith("@"));
		assert.ok(selectors.length > 10);
		for (const group of selectors) for (const selector of group.split(",")) assert.match(selector, /^\.ab-playback(?:[ .[:]|$)/);
		for (const [token, light, dark] of [["bg", "#ffffff", "#171c24"], ["ink", "#17202c", "#e5e9ef"], ["muted", "#5a6575", "#98a2b0"], ["line", "#d3d9e2", "#2c3440"], ["play", "#2869b8", "#88baff"]]) {
			assert.ok(css.includes(`var(--ab-${token},${light})`));
			assert.ok(css.includes(`var(--ab-${token},${dark})`));
		}
		assert.match(css, /prefers-color-scheme:dark/);
		assert.match(css, /:focus-visible/);
	}
});

test("document and shadow mounts are independent; both teardown entries remove only owned DOM and listeners", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	for (const entry of ["mount", "player"] as const) {
		const doc = new Doc();
		const one = setup(t, timelines, { doc });
		const two = setup(t, timelines, { doc, shadow: true });
		assert.notEqual(one.role("tabpanel")[0].id, two.role("tabpanel")[0].id);
		one.player.play(); two.player.select(1); two.player.play();
		assert.equal(doc.motion.listeners.size, 2);
		const oldControls = one.cls("ab-playback").all();
		one[entry].destroy(); one.mount.destroy(); one.player.destroy();
		assert.equal(doc.motion.listeners.size, 1);
		assert.deepEqual(one.container.children, [one.retained, one.svg]);
		assert.ok(oldControls.every(el => [...el.listeners.values()].every(listeners => listeners.size === 0)));
		assert.ok(one.svg.children.every(el => !el.classList.contains("ab-current")));
		for (const el of oldControls) { el.click(); el.fire("keydown", "ArrowRight"); el.fire("input"); }
		t.mock.timers.tick(300);
		assert.equal(one.player.state.status, "idle");
		assert.equal(two.player.state.status, "ended");
		assert.equal(two.actions()[1].textContent, "Replay");
		const remount = mountPlayback(one.container as unknown as ShadowRoot, one.svg as unknown as SVGSVGElement, timelines);
		assert.equal(one.all().filter(el => el.classList.contains("ab-playback")).length, 1);
		assert.equal(one.all().filter(el => el.tag === "style").length, 1);
		assert.equal(remount.player.state.status, "idle");
		remount.player.play(); remount.destroy();
		two.mount.destroy();
		assert.equal(doc.motion.listeners.size, 0);
		t.mock.timers.tick(60000);
		assert.equal(remount.player.state.status, "idle");
	}
});
