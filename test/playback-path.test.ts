import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPalette, DARK, LIGHT, type PlaybackContrast, render } from "../src/index.ts";
import { createPlayer, mountPlayback } from "../src/playback.ts";
import { Doc, El } from "./test-dom.ts";

test("text opacity defaults preserve legacy callers, accepts CSS values, clamps and rejects unresolved inputs", () => {
	const at = (unreachedTextOpacity?: number | string) => checkPalette(LIGHT, { play: "#0a7a60", unreachedOpacity: 0.3, unreachedTextOpacity });
	assert.deepEqual(at(), checkPalette(LIGHT, { play: "#0a7a60", unreachedOpacity: 0.3 }));
	for (const value of [0.8, " .8 ", "80%", "+8e-1", "8e1% "]) assert.deepEqual(at(value), at());
	for (const value of [-0.1, "-10%", -Number.MAX_VALUE]) assert.deepEqual(at(value), at(0));
	for (const value of [1.1, "110%", Number.MAX_VALUE]) assert.deepEqual(at(value), at(1));
	for (const value of [null, true, {}, [], NaN, Infinity, -Infinity, "", " ", "NaN", "Infinity", "1e999", "1e999%", "0x1", "1.", "80 %", "10%%", "0.8px", "calc(4 / 5)", "var(--fade)", "0,8", "1 0", "--.8"]) {
		assert.throws(() => checkPalette(LIGHT, { play: "#000", unreachedOpacity: 0.3, unreachedTextOpacity: value } as PlaybackContrast), TypeError);
	}
	assert.deepEqual(checkPalette(LIGHT, undefined), checkPalette(LIGHT));
});

test("playback reports separate unrounded minima and preference witnesses, even at text opacity 1", () => {
	for (const [palette, play, minimum] of [[LIGHT, "#0a7a60", 3.150960249973735], [DARK, "#6ff0cf", 3.94079505451698]] as const) {
		for (const unreachedTextOpacity of [0, 0.8, 1]) {
			const result = checkPalette(palette, { play, unreachedOpacity: 0.3, unreachedTextOpacity });
			const full = result.pairs.filter(p => p.threshold === 4.5);
			const faded = result.pairs.filter(p => p.threshold === 3);
			const guards = full.filter(p => p.where.endsWith("(full-opacity contrast preference witness)"));
			assert.equal(full.length + faded.length, result.pairs.length);
			assert.equal(faded.length, 176);
			assert.equal(guards.length, faded.length);
			assert.ok(full.every(p => p.ratio >= p.threshold));
			assert.equal(result.minimum, Math.min(...full.map(p => p.ratio)));
			assert.equal(result.unreachedMinimum, Math.min(...faded.map(p => p.ratio)));
			if (unreachedTextOpacity === 0.8) assert.ok(Math.abs(result.unreachedMinimum - minimum) < 1e-12);
			if (unreachedTextOpacity === 0) {
				assert.ok(result.minimum >= 4.5);
				assert.equal(result.unreachedMinimum, 1);
				assert.ok(result.pairs.some(p => p.ratio < p.threshold), "minimum alone cannot decide a playback pass");
			}
			for (const [i, pair] of faded.entries()) {
				assert.equal(pair.inkOpacity, unreachedTextOpacity);
				assert.equal(guards[i].inkOpacity, 1);
				assert.equal(guards[i].where, `${pair.where} (full-opacity contrast preference witness)`);
				if (unreachedTextOpacity === 1) assert.equal(pair.ratio, guards[i].ratio);
			}
		}
	}
});

for (const kind of ["flow", "sequence"]) for (const scheme of ["light", "dark"] as const) for (const mounted of [false, true]) {
	test(`${kind}/${scheme}/${mounted ? "controls" : "direct"}: reduced-motion Replay resets; final manual steps retain the path`, t => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const source = kind === "flow" ? 'flow v0\nbox a\nbox b\nbox c\na --> b\nplay\n step a 100ms\n step b 200ms\n'
			: 'sequence v0\nparticipant a "A"\nparticipant b "B"\na --> b : First\nb --> a : Last\na --> b : Off path\nplay\n step 1 100ms\n step 2 200ms\n';
		const result = render(source, { scheme });
		assert.deepEqual(result.diagnostics, []);
		const doc = new Doc(), host = new El("main", doc), svg = new El("svg", doc);
		svg.className = `ab ab-${scheme}`;
		for (const [, part] of result.svg.matchAll(/data-ab-part="([^"]+)"/g)) {
			const el = new El("g", doc); el.setAttribute("data-ab-part", part); svg.append(el);
		}
		host.append(svg);
		const mount = mounted ? mountPlayback(host as unknown as HTMLElement, svg as unknown as SVGSVGElement, result.timelines) : undefined;
		const player = mount?.player ?? createPlayer(svg as unknown as SVGSVGElement, result.timelines);
		t.after(() => mount ? mount.destroy() : player.destroy());
		player.play(); t.mock.timers.tick(100); t.mock.timers.tick(200);
		assert.deepEqual(player.state, { scenario: 0, step: 1, status: "ended" });
		doc.motion.set(true);
		if (mounted) host.all().find(el => el.textContent === "Replay")?.click(); else player.play();
		assert.deepEqual(player.state, { scenario: 0, step: -1, status: "idle" });
		assert.ok(!svg.classList.contains("ab-in-progress"));
		player.next(); player.next(); player.next();
		assert.deepEqual(player.state, { scenario: 0, step: 1, status: "paused" });
		assert.ok(svg.classList.contains("ab-in-progress"));
		assert.ok(!svg.classList.contains("ab-playing"));
		t.mock.timers.tick(10000);
		assert.equal(player.state.step, 1);
		player.seek(0); assert.equal(player.state.step, 0);
		player.seek(-100); player.previous(); assert.equal(player.state.step, -1);
	});
}
