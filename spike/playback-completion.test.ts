import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "./flow/index.ts";
import { createPlayer, mountPlayback, type PlayerState } from "./flow/playback.ts";
import { Doc, El } from "./test-dom.ts";

const sources = {
	flow: 'flow v0\nbox a\nbox b\nbox c\na --> b\nb --> c\nplay "First"\n step c 300ms\nplay "Selected"\n step a 100ms actor="Start" "Begin"\n step b 200ms actor="Finish" "Done"\n',
	sequence: 'sequence v0\nparticipant a "A"\nparticipant b "B"\na --> b : Request\nb --> a : Reply\na --> b : Later\nplay "First"\n step 3 300ms\nplay "Selected"\n step 1 100ms actor="Start" "Begin"\n step 2 200ms actor="Finish" "Done"\n',
};

function figure(source: string, scheme: "light" | "dark") {
	const result = render(source, { scheme });
	assert.deepEqual(result.diagnostics, []);
	const doc = new Doc();
	const container = new El("main", doc), svg = new El("svg", doc);
	svg.className = `ab ab-${scheme}`;
	for (const [, part] of result.svg.matchAll(/data-ab-part="([^"]+)"/g)) {
		const wrapper = new El("g", doc);
		wrapper.setAttribute("data-ab-part", part);
		svg.append(wrapper);
	}
	assert.ok(svg.children.length > 0);
	container.append(svg);
	return { result, doc, container, svg };
}

function fullFigure(svg: El) {
	assert.equal(svg.classList.contains("ab-in-progress"), false, "no fading at the full figure");
	assert.equal(svg.classList.contains("ab-playing"), false, "no running edges or transitions");
	assert.ok(svg.children.every(el => !el.classList.contains("ab-current") && !el.classList.contains("ab-played")), "no current glow or played highlights");
}

function endedControls(container: El) {
	const cls = (name: string) => {
		const el = container.all().find(el => el.classList.contains(name));
		assert.ok(el, name);
		return el;
	};
	for (const name of ["abp-counter", "abp-actor", "abp-caption", "abp-status"]) assert.equal(cls(name).textContent, "", name);
	assert.equal(cls("abp-toggle").textContent, "Replay");
	assert.equal(cls("abp-range").children[0].value, "-1");
	assert.equal(cls("abp-range").children[0].getAttribute("aria-valuetext"), "Full figure");
	assert.ok(container.all().every(el => !el.classList.contains("abp-current") && !el.classList.contains("abp-played") && !el.getAttribute("aria-current")));
}

for (const [kind, source] of Object.entries(sources)) for (const scheme of ["light", "dark"] as const) {
	for (const autoplay of [false, true]) test(`${kind}, ${scheme}: ${autoplay ? "opt-in autoplay" : "default"} mount shows the full idle figure before playback`, t => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const { result, doc, container, svg } = figure(source, scheme);
		const mount = autoplay
			? mountPlayback(container as unknown as HTMLElement, svg as unknown as SVGSVGElement, result.timelines, { autoplay: true })
			: mountPlayback(container as unknown as HTMLElement, svg as unknown as SVGSVGElement, result.timelines);
		t.after(() => mount.destroy());
		assert.deepEqual(mount.player.state, { scenario: 0, step: -1, status: "idle" });
		fullFigure(svg);
		t.mock.timers.tick(60000);
		fullFigure(svg);
		doc.viewport.show(true);
		if (autoplay) {
			assert.deepEqual(mount.player.state, { scenario: 0, step: 0, status: "playing" });
			assert.ok(svg.classList.contains("ab-in-progress"));
		} else {
			t.mock.timers.tick(60000);
			assert.deepEqual(mount.player.state, { scenario: 0, step: -1, status: "idle" });
			fullFigure(svg);
		}
	});

	for (const api of ["headless", "below", "side"] as const) test(`${kind}, ${scheme}, ${api}: completion restores the full figure and navigation starts from -1`, t => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const { result, container, svg } = figure(source, scheme);
		const changes: PlayerState[] = [];
		const mount = api === "headless" ? undefined : mountPlayback(container as unknown as HTMLElement, svg as unknown as SVGSVGElement, result.timelines, { layout: api });
		const player = mount?.player ?? createPlayer(svg as unknown as SVGSVGElement, result.timelines, { onChange: state => {
			assert.deepEqual(player.state, state);
			if (state.status === "ended") fullFigure(svg);
			changes.push(state);
		} });
		t.after(() => player.destroy());
		function action(name: string, headless: () => void) {
			if (!mount) return headless();
			const button = container.all().find(el => el.tag === "button" && (el.getAttribute("aria-label") ?? el.textContent) === name);
			assert.ok(button, name);
			button.click();
		}
		function ended() {
			assert.deepEqual(player.state, { scenario: 1, step: -1, status: "ended" });
			fullFigure(svg);
			if (!mount) {
				assert.deepEqual(changes.at(-1), player.state);
				return;
			}
			endedControls(container);
		}
		fullFigure(svg);
		player.select(1);
		action("Play", () => player.play());
		t.mock.timers.tick(100);
		assert.equal(player.state.step, 1);
		action("Pause", () => player.pause());
		assert.deepEqual(player.state, { scenario: 1, step: 1, status: "paused" });
		assert.ok(svg.classList.contains("ab-in-progress"), "pausing retains fading");
		assert.equal(svg.classList.contains("ab-playing"), false);
		assert.ok(svg.children.some(el => el.classList.contains("ab-current")), "pausing retains the current glow");
		assert.ok(svg.children.some(el => !el.className), "unplayed parts remain to fade");
		const paused = svg.children.map(el => el.className);
		t.mock.timers.tick(1000);
		assert.deepEqual(svg.children.map(el => el.className), paused);
		action("Play", () => player.play());
		t.mock.timers.tick(199);
		assert.deepEqual(player.state, { scenario: 1, step: 1, status: "playing" });
		t.mock.timers.tick(1);
		ended();
		t.mock.timers.tick(1000);
		ended();
		action("Replay", () => player.play());
		assert.deepEqual(player.state, { scenario: 1, step: 0, status: "playing" });
		t.mock.timers.tick(100); t.mock.timers.tick(200);
		ended();
		action("Next", () => player.next());
		assert.deepEqual(player.state, { scenario: 1, step: 0, status: "paused" });
		action("Play", () => player.play());
		t.mock.timers.tick(100); t.mock.timers.tick(200);
		ended();
		action("Previous", () => player.previous());
		assert.deepEqual(player.state, { scenario: 1, step: -1, status: "paused" });
		fullFigure(svg);
	});

	for (const layout of ["below", "side"] as const) for (const status of ["playing", "ended"] as const) test(`${kind}, ${scheme}, ${layout}: rebind from ${status} completes with a full replacement figure`, t => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const { result, container, svg } = figure(source, scheme);
		const mount = mountPlayback(container as unknown as HTMLElement, svg as unknown as SVGSVGElement, result.timelines, { layout, autoplay: true });
		t.after(() => mount.destroy());
		const player = mount.player;
		player.select("selected"); player.play();
		if (status === "ended") {
			t.mock.timers.tick(100); t.mock.timers.tick(200);
			fullFigure(svg); endedControls(container);
		}
		assert.equal(player.state.status, status);
		const replacement = figure(source, scheme);
		mount.update(replacement.svg as unknown as SVGSVGElement, [...replacement.result.timelines].reverse());
		assert.equal(mount.player, player);
		assert.deepEqual(player.state, { scenario: 0, step: -1, status: "idle" });
		fullFigure(svg);
		fullFigure(replacement.svg);
		replacement.doc.viewport.show(true); t.mock.timers.tick(1000);
		assert.deepEqual(player.state, { scenario: 0, step: -1, status: "idle" }, "rebinding revokes autoplay and the old timer");
		const changes: PlayerState[] = [];
		player.subscribe(state => {
			if (state.status === "ended") {
				fullFigure(replacement.svg);
				endedControls(container);
			}
			changes.push(state);
		});
		player.play(); t.mock.timers.tick(100); t.mock.timers.tick(199);
		assert.deepEqual(player.state, { scenario: 0, step: 1, status: "playing" });
		assert.ok(replacement.svg.children.some(el => el.classList.contains("ab-current")));
		t.mock.timers.tick(1);
		assert.deepEqual(player.state, { scenario: 0, step: -1, status: "ended" });
		assert.deepEqual(changes.at(-1), player.state);
		fullFigure(replacement.svg); endedControls(container);
		fullFigure(svg);
		t.mock.timers.tick(1000);
		assert.equal(changes.length, 3);
	});
}
