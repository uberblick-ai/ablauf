import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mountPlayback } from "./flow/playback.ts";
import { render } from "./flow/index.ts";
import { Doc, El } from "./test-dom.ts";

const sources = {
	flow: 'flow v0\nbox a "Start"\nbox b "End"\na --> b\nplay "First"\n step a 100ms\n step b 100ms\nplay "Empty"\n',
	sequence: 'sequence v0\nparticipant a\nparticipant b\na --> b: Request\nb --> a: Reply\nplay "First"\n step 1 100ms\n step 2 100ms\nplay "Empty"\n',
};
function setup(t: TestContext, source: string, layout: "below" | "side" | "auto" = "auto", shadow = false, autoplay = false) {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	const doc = new Doc();
	const host = new El(shadow ? "#shadow-root" : "main", doc);
	host.rect = { width: 1200, top: 0, bottom: 800 };
	const data = render(source);
	assert.deepEqual(data.diagnostics, []);
	function image() {
		const svg = new El("svg", doc);
		svg.setAttribute("width", "678"); svg.setAttribute("height", "900");
		for (const part of new Set(data.timelines.flatMap(timeline => timeline.steps.flatMap(step => step.parts)))) {
			const el = new El("g", doc); el.setAttribute("data-ab-part", part); svg.append(el);
		}
		return svg;
	}
	const svg = image(); host.append(svg);
	const mount = mountPlayback(host as unknown as HTMLElement, svg as unknown as SVGSVGElement, data.timelines,
		{ layout, autoplay, expand: true, pauseWhenOffscreen: true });
	t.after(() => mount.destroy());
	const cls = (name: string) => { const el = host.all().find(el => el.classList.contains(name)); assert.ok(el, name); return el; };
	const button = (text: string) => { const el = host.all().find(el => el.tag === "button" && el.textContent === text && !el.parent?.hidden); assert.ok(el, text); return el; };
	const active = () => shadow ? host.activeElement : doc.activeElement;
	const idle = () => assert.deepEqual(mount.player.state, { scenario: mount.player.state.scenario, step: -1, status: "idle" });
	const closed = () => {
		assert.equal(mount.isOpen, false); idle();
		assert.equal(cls("abp-controls").hidden, true); assert.equal(cls("abp-entry").hidden, false);
		assert.equal(cls("ab-playback").classList.contains("abp-side"), false);
		assert.ok(svg.all().every(el => !/ab-(current|played|in-progress|playing)/.test(el.className)));
	};
	return { doc, host, svg, mount, player: mount.player, data, image, cls, button, active, idle, closed };
}

for (const [kind, source] of Object.entries(sources)) for (const layout of ["below", "side", "auto"] as const) for (const shadow of [false, true]) {
	test(`closed reader lifetime: ${kind}, ${layout}, shadow=${shadow}`, t => {
		const f = setup(t, source, layout, shadow);
		f.closed(); t.mock.timers.tick(1000); f.closed();
		const entry = f.cls("abp-entry").children[0];
		assert.equal(entry.type, "button"); assert.equal(entry.getAttribute("aria-label"), "Play diagram");
		for (const key of ["Enter", " "]) assert.equal(entry.fire("keydown", key), false); // Native button activation generates click.
		entry.click(); assert.equal(f.mount.isOpen, true); assert.equal(f.active(), f.cls("abp-panel"));
		assert.equal(f.player.state.status, "playing"); assert.equal(f.player.state.step, 0);
		assert.deepEqual(f.cls("abp-actions").children.slice(0, 4).map(el => el.getAttribute("aria-label") ?? el.textContent), ["Previous", "Pause", "Next", "Stop"]);
		f.player.pause(); assert.equal(f.mount.isOpen, true);
		f.player.play(); t.mock.timers.tick(100); t.mock.timers.tick(100); assert.equal(f.player.state.status, "ended"); assert.equal(f.mount.isOpen, true);
		f.cls("abp-panel").focus(); f.player.select("empty"); f.mount.close(); f.closed(); assert.equal(f.player.state.scenario, 1); assert.ok(f.active() === entry);
		entry.click(); assert.equal(f.mount.isOpen, true); f.idle();
		assert.equal(f.cls("abp-caption").textContent, "No playable steps"); assert.equal(f.button("Stop").disabled, false);
		f.button("Stop").focus(); f.button("Stop").click(); f.closed(); assert.equal(f.active(), entry);
		f.mount.open(); f.idle(); const snapshot = f.player.state; f.mount.open(); assert.equal(f.player.state, snapshot);
		const external = new El("button", f.doc); f.host.append(external); external.focus();
		f.mount.close(); f.mount.close(); assert.equal(f.active(), external); f.closed();
		f.mount.expand(); assert.equal(f.mount.isOpen, true); f.idle();
		const modalClose = f.button("Close"); modalClose.fire("keydown", "Tab", { shiftKey: true }); assert.equal(f.active(), f.button("Stop"));
		assert.equal(f.button("Stop").fire("keydown", "Tab"), true); assert.equal(f.active(), modalClose);
		modalClose.click(); assert.equal(f.mount.isOpen, true); assert.equal(f.active(), external);
		f.mount.close(); f.mount.expand(); f.mount.close(); f.closed(); assert.equal(f.active(), entry);
		assert.equal(f.host.all().some(el => el.tag === "dialog"), false);
		f.mount.expand(); external.focus(); f.mount.close(); assert.equal(f.active(), external);
		const css = f.host.all().find(el => el.tag === "style")?.textContent ?? "";
		assert.match(css, /\.ab-playback button\{[^}]*height:30px/);
		assert.match(css, /\.ab-playback button:focus-visible/);
		assert.match(css, /@media \(any-pointer:coarse\)\{\s*\.ab-playback button,[^{]*\{[^}]*min-width:44px;min-height:44px/);
	});
}

for (const [kind, source] of Object.entries(sources)) {
	test(`tuple changes open before subscribers; unchanged calls stay closed: ${kind}`, t => {
		const f = setup(t, source);
		f.player.subscribe(state => { if (state.status !== "idle") { assert.equal(f.mount.isOpen, true); assert.equal(f.cls("abp-controls").hidden, false); } });
		for (const action of [() => f.player.previous(), () => f.player.seek(-1), () => f.player.select("empty"), () => f.player.next(), () => f.player.select(0), () => f.player.play()]) {
			f.mount.close(); action(); assert.equal(f.mount.isOpen, true);
		}
		f.mount.close(); f.player.pause(); f.player.select("missing"); f.player.seek(NaN); f.closed();
		f.doc.motion.set(true); f.player.play(); f.closed();
		f.cls("abp-entry").children[0].click(); assert.equal(f.mount.isOpen, true); f.idle();
		f.mount.close(); f.doc.motion.set(false); f.doc.setHidden(true); f.player.play(); f.closed();
		f.doc.setHidden(false); f.svg.connected = false; f.player.play(); f.closed(); f.svg.connected = true;
		f.doc.viewport.show(false); f.player.play(); f.closed();
	});

	test(`autoplay eligibility, close suppression and idle rebinding: ${kind}`, t => {
		const f = setup(t, source, "side", false, true);
		f.doc.motion.set(true); f.doc.viewport.show(true); f.closed();
		f.doc.motion.set(false); f.doc.viewport.show(true, 0.49); f.closed();
		f.doc.setHidden(true); f.doc.viewport.show(true); f.closed();
		f.doc.setHidden(false); f.doc.viewport.show(true); assert.equal(f.mount.isOpen, true);
		f.doc.viewport.show(false); f.mount.close(); f.doc.viewport.show(true); f.closed();
		f.cls("abp-entry").children[0].click(); assert.equal(f.player.state.status, "playing");
		for (const open of [true, false]) {
			if (!open) f.mount.close();
			const player = f.player; const panel = f.cls("abp-panel");
			const replacement = f.image(); f.svg.replaceWith(replacement);
			f.mount.update(replacement as unknown as SVGSVGElement, [...f.data.timelines].reverse());
			assert.equal(f.mount.isOpen, open); f.idle(); assert.equal(f.player, player); assert.equal(f.cls("abp-panel"), panel);
			assert.equal(f.data.timelines[0].slug, [...f.data.timelines].reverse()[f.player.state.scenario].slug);
			f.doc.viewport.show(false); f.doc.viewport.show(true); t.mock.timers.tick(1000); f.idle(); assert.equal(f.mount.isOpen, open);
		}
		f.mount.update(f.svg as unknown as SVGSVGElement, []); assert.equal(f.mount.isOpen, false);
		assert.equal(f.host.all().some(el => el.classList.contains("ab-playback")), false);
		for (const action of [() => f.mount.open(), () => f.mount.expand(), () => f.player.next(), () => f.player.seek(-1), () => f.player.play()]) { action(); f.idle(); assert.equal(f.mount.isOpen, false); }
		f.mount.update(f.svg as unknown as SVGSVGElement, f.data.timelines); f.closed();
	});
	for (const entry of ["mount", "player"] as const) for (const open of [false, true]) test(`teardown ${kind}, ${entry}, open=${open}`, t => {
		const f = setup(t, source, "auto", false, true);
		if (open) { f.mount.expand(); f.player.play(); }
		const elements = f.host.all();
		f[entry].destroy(); const snapshot = f.player.state;
		f.mount.open(); f.mount.close(); f.mount.expand(); f.mount.update(f.svg as unknown as SVGSVGElement, f.data.timelines);
		f.player.previous(); f.doc.viewport.show(true); f.doc.resize.flush(); f.doc.frames.flush(); t.mock.timers.tick(1000);
		assert.equal(f.mount.isOpen, false); assert.equal(f.player.state, snapshot);
		assert.deepEqual(f.host.children, [f.svg]); assert.equal(f.doc.viewport.observers.size, 0); assert.equal(f.doc.resize.observers.size, 0);
		assert.ok(elements.every(el => [...el.listeners.values()].every(listeners => listeners.size === 0)));
	});
}
