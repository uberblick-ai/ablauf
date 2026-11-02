import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createPlayer, type PlayerState } from "./flow/playback.ts";
import type { Timeline, TimelineStep } from "./flow/play.ts";
import { render } from "./flow/index.ts";

class Part {
	classes = new Set(["original"]);
	readonly part: string;
	constructor(part: string) { this.part = part; }
	getAttribute(name: string) { assert.equal(name, "data-ab-part"); return this.part; }
	classList = {
		toggle: (name: string, force: boolean) => {
			if (force) this.classes.add(name);
			else this.classes.delete(name);
			return force;
		},
	};
}

class Motion {
	matches = false;
	reads = 0;
	listeners = new Set<(event: MediaQueryListEvent) => void>();
	matchMedia = (query: string) => {
		assert.equal(query, "(prefers-reduced-motion: reduce)");
		this.reads++;
		return this;
	};
	addEventListener(name: string, listener: (event: MediaQueryListEvent) => void) {
		assert.equal(name, "change"); this.listeners.add(listener);
	}
	removeEventListener(name: string, listener: (event: MediaQueryListEvent) => void) {
		assert.equal(name, "change"); this.listeners.delete(listener);
	}
	set(matches: boolean) {
		this.matches = matches;
		for (const listener of [...this.listeners]) listener({ matches } as MediaQueryListEvent);
	}
}

function svgFake(parts = ["start", "link", "link", "link", "finish", "other"], motion = new Motion()) {
	const wrappers = parts.map(part => new Part(part));
	const svg = {
		isConnected: true,
		classList: new Part("root").classList,
		ownerDocument: { addEventListener() {}, removeEventListener() {}, defaultView: { matchMedia: motion.matchMedia } },
		querySelectorAll(selector: string) {
			assert.equal(selector, "[data-ab-part]");
			return wrappers;
		},
	} as unknown as SVGSVGElement;
	const states = () => wrappers.map(wrapper => [...wrapper.classes].sort());
	return { svg, wrappers, motion, states };
}

function step(parts: string[], ms: number): TimelineStep {
	return { target: "deliberately-unrelated", kind: "future-kind", actor: "Actor", caption: "Caption", parts, ms };
}

const timelines: Timeline[] = [
	{ name: "First", slug: "first", steps: [step(["start"], 100), step(["link", "finish"], 200), step(["start"], 300)] },
	{ name: "Second", slug: "second", steps: [step(["other"], 150)] },
	{ name: "Empty", slug: "empty", steps: [] },
];

function setup(t: TestContext, data = timelines, loop = false) {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const fake = svgFake();
	const changes: PlayerState[] = [];
	const player = createPlayer(fake.svg, data, { loop, onChange: state => {
		assert.deepEqual(player.state, state);
		const current = new Set(data[state.scenario]?.steps[state.step]?.parts);
		for (const wrapper of fake.wrappers) assert.equal(wrapper.classes.has("ab-current"), current.has(wrapper.part));
		changes.push(state);
	} });
	t.after(() => player.destroy());
	return { ...fake, player, changes, tick: (ms: number) => t.mock.timers.tick(ms) };
}

test("creation is a full idle figure without timers, media reads or callbacks", t => {
	const { player, changes, states, tick, motion } = setup(t);
	assert.deepEqual(player.state, { scenario: 0, step: -1, status: "idle" });
	assert.ok(states().every(classes => classes.join() === "original"));
	assert.equal(motion.reads, 0);
	tick(60000);
	assert.deepEqual(changes, []);
	player.pause();
	assert.deepEqual(changes, []);
});

test("each step including the last gets its full dwell; ended replays immediately", t => {
	const { player, tick, changes, motion } = setup(t);
	player.play();
	assert.deepEqual(player.state, { scenario: 0, step: 0, status: "playing" });
	tick(99);
	player.play();
	assert.equal(changes.length, 1);
	tick(1);
	assert.equal(player.state.step, 1);
	tick(199);
	assert.equal(player.state.step, 1);
	tick(1);
	assert.deepEqual(player.state, { scenario: 0, step: 2, status: "playing" });
	tick(299);
	assert.equal(player.state.status, "playing");
	tick(1);
	assert.deepEqual(player.state, { scenario: 0, step: 2, status: "ended" });
	assert.equal(motion.listeners.size, 0);
	tick(60000);
	assert.equal(changes.length, 4);
	player.play();
	assert.equal(player.state.step, 0);
	assert.equal(player.state.status, "playing");
	assert.deepEqual(changes[0], { scenario: 0, step: 0, status: "playing" });
});

test("pause keeps the frame and resume restarts its full dwell", t => {
	const { player, tick, changes, states, motion } = setup(t);
	player.play();
	tick(100);
	tick(175);
	const frame = states();
	player.pause();
	assert.deepEqual(player.state, { scenario: 0, step: 1, status: "paused" });
	assert.deepEqual(states(), frame);
	assert.equal(motion.listeners.size, 0);
	const count = changes.length;
	player.pause();
	tick(60000);
	assert.equal(changes.length, count);
	player.play();
	tick(199);
	assert.equal(player.state.step, 1);
	tick(1);
	assert.equal(player.state.step, 2);
});

test("loop waits for the last dwell and clears earlier frames at the first step", t => {
	const { player, tick, wrappers } = setup(t, timelines, true);
	player.play();
	tick(100); tick(200); tick(299);
	assert.equal(player.state.step, 2);
	tick(1);
	assert.deepEqual(player.state, { scenario: 0, step: 0, status: "playing" });
	assert.deepEqual([...wrappers[1].classes], ["original"]);
	tick(100);
	assert.equal(player.state.step, 1);
});

test("one-step loops keep one timer without duplicate tuple callbacks", t => {
	const { player, tick, changes } = setup(t, [timelines[1]], true);
	player.play();
	tick(150); tick(150); tick(149);
	assert.equal(changes.length, 1);
	assert.equal(player.state.status, "playing");
	player.pause();
	tick(60000);
	assert.equal(changes.length, 2);
});

test("navigation clamps, clears at -1, cancels timers and notifies only on changes", t => {
	const { player, tick, changes, states } = setup(t);
	player.previous();
	assert.deepEqual(player.state, { scenario: 0, step: -1, status: "paused" });
	player.previous();
	assert.equal(changes.length, 1);
	player.next();
	assert.equal(player.state.step, 0);
	player.previous();
	assert.equal(player.state.step, -1);
	player.play();
	player.seek(999);
	assert.deepEqual(player.state, { scenario: 0, step: 2, status: "paused" });
	const count = changes.length;
	player.next();
	tick(60000);
	assert.equal(changes.length, count);
	player.seek(-999);
	assert.equal(player.state.step, -1);
	assert.ok(states().every(classes => classes.join() === "original"));
	player.play();
	player.next();
	assert.deepEqual(player.state, { scenario: 0, step: 1, status: "paused" });
	player.play();
	player.previous();
	assert.deepEqual(player.state, { scenario: 0, step: 0, status: "paused" });
});

test("next at ended stays on the last frame and pauses", t => {
	const { player, tick } = setup(t, [timelines[1]]);
	player.play(); tick(150); player.next();
	assert.deepEqual(player.state, { scenario: 0, step: 0, status: "paused" });
});

test("invalid indexed calls leave state, callback count and running timer alone", t => {
	const { player, tick, changes } = setup(t);
	player.play(); tick(99);
	for (const value of [NaN, Infinity, -Infinity, 0.5, -1.5]) {
		player.seek(value); player.select(value);
	}
	player.select(-1); player.select(3); player.select(999);
	assert.equal(changes.length, 1);
	tick(1);
	assert.deepEqual(player.state, { scenario: 0, step: 1, status: "playing" });
});

test("select pauses at the first frame and clears the previous scenario, including reselect", t => {
	const { player, tick, changes, wrappers } = setup(t);
	player.play(); tick(100);
	player.select(1);
	assert.deepEqual(player.state, { scenario: 1, step: 0, status: "paused" });
	assert.ok(wrappers.slice(0, -1).every(wrapper => wrapper.classes.size === 1));
	assert.ok(wrappers.at(-1)?.classes.has("ab-current"));
	const count = changes.length;
	player.select(1);
	assert.equal(changes.length, count);
	player.select(0); player.seek(2); player.play(); player.select(0);
	assert.deepEqual(player.state, { scenario: 0, step: 0, status: "paused" });
	tick(60000);
	assert.equal(player.state.step, 0);
});

test("empty timelines and empty scenarios never invent a step or select another scenario", t => {
	const { player, tick, changes, motion } = setup(t, []);
	player.play(); player.select(0);
	assert.deepEqual(changes, []);
	player.next(); player.previous(); player.seek(200);
	assert.deepEqual(player.state, { scenario: 0, step: -1, status: "paused" });
	player.play();
	assert.deepEqual(player.state, { scenario: 0, step: -1, status: "idle" });
	tick(60000);
	assert.equal(changes.length, 2);
	assert.equal(motion.listeners.size, 0);
	const other = createPlayer(svgFake().svg, timelines);
	other.select(2);
	assert.deepEqual(other.state, { scenario: 2, step: -1, status: "paused" });
	other.play();
	assert.deepEqual(other.state, { scenario: 2, step: -1, status: "idle" });
	other.next();
	assert.deepEqual(other.state, { scenario: 2, step: -1, status: "paused" });
	other.destroy();
});

test("all fragments use only parts, current wins repeats and backward navigation recomputes", t => {
	const { player, wrappers, states } = setup(t);
	player.seek(1);
	assert.ok(wrappers[0].classes.has("ab-played"));
	assert.ok(wrappers.slice(1, 5).every(wrapper => wrapper.classes.has("ab-current")));
	player.seek(2);
	assert.ok(wrappers[0].classes.has("ab-current"));
	assert.ok(!wrappers[0].classes.has("ab-played"));
	assert.ok(wrappers.slice(1, 5).every(wrapper => wrapper.classes.has("ab-played")));
	assert.deepEqual([...wrappers[5].classes], ["original"]);
	player.seek(0);
	assert.ok(wrappers.slice(1).every(wrapper => wrapper.classes.size === 1));
	player.seek(-1);
	assert.ok(states().every(classes => classes.join() === "original"));
});

test("parts from actual render output include every stroke, head and label", () => {
	const result = render('flow v0\nbox a\nbox b\na --> b : label\nplay\n step a\n step b\n', { idPrefix: "real" });
	assert.deepEqual(result.diagnostics, []);
	const parts = [...result.svg.matchAll(/data-ab-part="([^"]+)"/g)].map(match => match[1]);
	const { svg, wrappers } = svgFake(parts);
	const player = createPlayer(svg, result.timelines);
	player.seek(1);
	const edges = wrappers.filter(wrapper => wrapper.part === "edge-0");
	assert.equal(edges.length, 3);
	assert.ok(edges.every(wrapper => wrapper.classes.has("ab-current")));
	player.destroy();
});

test("reduced motion is read on every play, resets manual highlighting and retains scenario", t => {
	const { player, motion, changes, states, tick } = setup(t);
	player.select(1);
	motion.set(true);
	player.play();
	assert.deepEqual(player.state, { scenario: 1, step: -1, status: "idle" });
	assert.ok(states().every(classes => classes.join() === "original"));
	assert.equal(motion.reads, 1);
	player.play();
	assert.equal(motion.reads, 2);
	assert.equal(changes.length, 2);
	player.next();
	assert.deepEqual(player.state, { scenario: 1, step: 0, status: "paused" });
	player.select(0);
	assert.equal(player.state.step, 0);
	player.play(); tick(60000);
	assert.deepEqual(player.state, { scenario: 0, step: -1, status: "idle" });
});

test("enabling reduced motion during playback resets immediately; disabling never starts", t => {
	const { player, motion, states, tick, changes } = setup(t);
	player.play(); tick(100);
	assert.equal(motion.listeners.size, 1);
	player.play();
	assert.equal(motion.listeners.size, 1);
	assert.equal(motion.reads, 2);
	motion.set(true);
	assert.deepEqual(player.state, { scenario: 0, step: -1, status: "idle" });
	assert.equal(motion.listeners.size, 0);
	assert.ok(states().every(classes => classes.join() === "original"));
	const count = changes.length;
	motion.set(false); tick(60000);
	assert.equal(changes.length, count);
	player.play();
	assert.equal(player.state.status, "playing");
	// A preference change without an event must also be read by repeated play().
	motion.matches = true;
	player.play();
	assert.deepEqual(player.state, { scenario: 0, step: -1, status: "idle" });
});

test("missing window or matchMedia means no preference", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	for (const view of [null, {}]) {
		const fake = svgFake();
		Object.assign(fake.svg.ownerDocument, { defaultView: view });
		const player = createPlayer(fake.svg, [timelines[1]]);
		player.play();
		assert.equal(player.state.status, "playing");
		t.mock.timers.tick(150);
		assert.equal(player.state.status, "ended");
		player.destroy();
	}
});

test("destroy is silent, idempotent and prevents all future methods, timers and listeners", t => {
	const { player, motion, tick, states, changes } = setup(t);
	player.select(1); player.play();
	const lateListeners = [...motion.listeners];
	const count = changes.length;
	player.destroy();
	assert.deepEqual(player.state, { scenario: 1, step: -1, status: "idle" });
	assert.equal(motion.listeners.size, 0);
	assert.ok(states().every(classes => classes.join() === "original"));
	player.destroy(); player.play(); player.pause(); player.next(); player.previous(); player.seek(0); player.select(0);
	for (const listener of lateListeners) listener({ matches: true } as MediaQueryListEvent);
	motion.set(true); tick(60000);
	assert.equal(changes.length, count);
	assert.deepEqual(player.state, { scenario: 1, step: -1, status: "idle" });
});

test("callback snapshots remain independent and cannot corrupt player state", t => {
	const { player, changes } = setup(t);
	player.next();
	assert.throws(() => { changes[0].step = 100; }, TypeError);
	player.next();
	assert.deepEqual(changes[0], { scenario: 0, step: 0, status: "paused" });
	assert.deepEqual(changes[1], { scenario: 0, step: 1, status: "paused" });
});

test("callbacks may pause, select or destroy without leaving orphan timers", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	for (const action of ["pause", "select", "destroy"] as const) {
		const fake = svgFake();
		let calls = 0;
		const player = createPlayer(fake.svg, timelines, { onChange: state => {
			calls++;
			if (state.status === "playing") {
				if (action === "select") player.select(1);
				else player[action]();
			}
		} });
		player.play();
		const count = calls;
		t.mock.timers.tick(60000);
		assert.equal(calls, count);
		assert.equal(fake.motion.listeners.size, 0);
		player.destroy();
	}
});

test("players are independent and only query the supplied SVG, including a shadow host", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const first = svgFake();
	const second = svgFake();
	Object.assign(second.svg, { getRootNode: () => ({ host: {} }) });
	const one = createPlayer(first.svg, timelines);
	const two = createPlayer(second.svg, timelines);
	one.play(); two.select(1); two.play();
	t.mock.timers.tick(100);
	assert.equal(one.state.step, 1);
	assert.equal(two.state.step, 0);
	one.destroy();
	assert.ok(first.states().every(classes => classes.join() === "original"));
	assert.ok(second.wrappers[5].classes.has("ab-current"));
	t.mock.timers.tick(50);
	assert.equal(two.state.status, "ended");
	two.destroy();
});
