import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { render } from "./flow/index.ts";

const claim = readFileSync(new URL("./examples/claim-play.flow", import.meta.url), "utf8");
const schemes = [undefined, "light", "dark"] as const;
const rows = (svg: string) => [...svg.matchAll(/<g data-line="\d+" data-step="(\d+)"[^>]*>([\s\S]*?)<\/g>/g)];
const attr = (svg: string, name: string) => svg.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1] ?? "";

// Independently integrate the emitted geometry, including both quadratic
// corners, rather than repeating the renderer's closed-form length formula.
function pathLength(path: string): number {
	const tokens = path.match(/[MLHVQ]|-?\d+(?:\.\d+)?/g) ?? [];
	let x = 0, y = 0, length = 0;
	const number = () => Number(tokens.shift());
	const line = (nx: number, ny: number) => { length += Math.hypot(nx - x, ny - y); x = nx; y = ny; };
	while (tokens.length) {
		const command = tokens.shift();
		if (command === "M") { x = number(); y = number(); }
		else if (command === "L") line(number(), number());
		else if (command === "H") line(number(), y);
		else if (command === "V") line(x, number());
		else if (command === "Q") {
			const sx = x, sy = y, cx = number(), cy = number(), ex = number(), ey = number();
			for (let i = 1; i <= 10000; i++) {
				const t = i / 10000, u = 1 - t;
				line(u * u * sx + 2 * u * t * cx + t * t * ex, u * u * sy + 2 * u * t * cy + t * t * ey);
			}
		} else assert.fail(`Unexpected path command ${command}`);
	}
	return length;
}

test("every playable message has a real render-time length and matching packet path, without receiver bars", () => {
	// Include reverse requests, responses and self-responses, plus a narrow
	// last-lane loop whose horizontal segments run backward around its corners.
	const extra = `sequence v0\n${Array.from({ length: 20 }, (_, i) => `participant p${i} tone=${i === 19 ? "agent" : "system"}`).join("\n")}\np19 --> p0: Reverse request\np0 -.-> p19: Response\np19 --> p19: Self\np19 -.-> p19: Self response\nplay\n step 1\n`;
	for (const source of [claim, extra]) for (const scheme of schemes) {
		const result = render(source, { scheme });
		assert.deepEqual(result.diagnostics, []);
		const messages = rows(result.svg);
		assert.equal(messages.length, source === claim ? 15 : 4);
		assert.doesNotMatch(result.svg, /seq-activation/);
		const participantTones = new Map([...result.svg.matchAll(/<circle cx="([^"]+)" cy="20" r="3" class="t-([^"]+)"/g)].map(m => [Number(m[1]), m[2]]));
		for (const [wrapper, step, drawing] of messages) {
			const length = Number(wrapper.match(/--seq-length:([\d.]+)/)?.[1]);
			const paths = drawing.match(/<path[^>]+>/g) ?? [];
			assert.equal(paths.length, 2, step);
			const d = attr(paths[0], "d");
			assert.equal(attr(paths[1], "d"), d, step);
			assert.ok(Math.abs(length - pathLength(d)) < .000001, `${step}: ${length} for ${d}`);
			assert.ok(length > 0);
			assert.doesNotMatch(drawing, /pathLength=|offset-path|offset-distance|<animate/);
			const coords = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
			const from = coords[0];
			assert.equal(attr(paths[1], "class"), `seq-packet e-${participantTones.get(from)}`);
			assert.doesNotMatch(paths[1], /marker-end/);
			assert.doesNotMatch(drawing, /<rect\b/);
		}
	}
});

test("each message has a full-width background band enclosing all label lines and its arrow or loop", () => {
	const wrapped = `sequence v0\nparticipant a\nparticipant b\nb --> b: ${"A wrapped label ".repeat(30)}\na --> b: Next\nplay\n step 1\n`;
	for (const source of [claim, wrapped]) {
		const { svg, layout } = render(source);
		const bands = [...svg.matchAll(/<g data-ab-part="(message-\d+)">(<rect[^>]+seq-time-band[^>]+>)<\/g>/g)];
		const messages = rows(svg);
		assert.equal(bands.length, messages.length);
		assert.ok(svg.lastIndexOf('class="seq-time-band"') < svg.indexOf('data-step="1"'));
		for (const [i, [, , drawing]] of messages.entries()) {
			const [, id, band] = bands[i];
			assert.equal(id, `message-${i}`);
			assert.equal(attr(band, "x"), "0"); assert.equal(Number(attr(band, "width")), layout.width);
			const top = Number(attr(band, "y")), bottom = top + Number(attr(band, "height"));
			const labels = [...drawing.matchAll(/<text[^>]+class="[^"]*seq-label"/g)];
			assert.ok(labels.every(m => Number(attr(m[0], "y")) - 12 > top));
			const path = attr(drawing.match(/<path[^>]+>/)?.[0] ?? "", "d");
			const ys = [...path.matchAll(/,(-?\d+(?:\.\d+)?)|V(-?\d+(?:\.\d+)?)/g)].map(m => Number(m[1] ?? m[2]));
			assert.ok(Math.max(...ys) < bottom);
			assert.ok(bottom <= layout.height);
		}
		assert.deepEqual(layout, render(source.slice(0, source.indexOf("\nplay"))).layout);
	}
});

test("SVG state rules show the current band without receiver bars, animate only while playing, and reset motion", () => {
	for (const scheme of schemes) for (const idPrefix of ["one", "two", "1:<unsafe>."]) {
		const { svg } = render(claim, { scheme, idPrefix });
		const id = attr(svg, "data-ab-play");
		const root = `.ab[data-ab-play="${id}"]`;
		const css = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
		const current = `${root}.ab-in-progress [data-ab-part].ab-current`;
		const moving = `${root}.ab-playing [data-ab-part].ab-current`;
		const name = `ab-seq-${Array.from(id, c => c.charCodeAt(0).toString(16)).join("-")}`;
		assert.ok(css.includes(`${root} :is(.seq-packet,.seq-time-band){opacity:0;pointer-events:none}`));
		assert.ok(css.includes(`${root} .seq-time-band{fill:var(--play)}`));
		assert.ok(css.includes(`${current} .seq-time-band{opacity:.1}`));
		assert.doesNotMatch(css, /seq-activation|-arrive/);
		assert.ok(css.includes(`${moving} path.e{animation:${name}-draw .55s ease-out}`));
		assert.ok(css.includes(`${moving} .seq-packet{animation:${name}-travel .55s ease-out}`));
		assert.ok(css.includes(`${root}.ab-playing .seq-time-band{transition:opacity .35s ease}`));
		assert.match(css, /stroke-linecap:round;stroke-dasharray:\.01 calc\(var\(--seq-length\) \+ 8\)/);
		assert.ok(css.includes(`@keyframes ${name}-draw{from{stroke-dasharray:var(--seq-length) var(--seq-length);stroke-dashoffset:var(--seq-length)}to{stroke-dasharray:var(--seq-length) var(--seq-length);stroke-dashoffset:0}}`));
		assert.ok(css.includes(`@keyframes ${name}-travel{0%{stroke-dashoffset:0px;opacity:1}85%{opacity:1}100%{stroke-dashoffset:calc(var(--seq-length) * -1px);opacity:0}}`));
		assert.match(css, /\.ab \.dash\{stroke-dasharray:6 5\}/);
		assert.doesNotMatch(css, /forwards|infinite|offset-path|offset-distance/);
		const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion:reduce)"));
		assert.ok(reduced.includes(`${moving} :is(path.e,.seq-packet){animation:none}`));
		assert.match(reduced, /\.seq-time-band\{transition:none\}/);
		// No animation or transition rule can match a paused/manual frame.
		const rules = css.replace(/@keyframes [^{]+\{(?:[^{}]*\{[^{}]*\})+\}/g, "");
		for (const [, selector] of rules.matchAll(/([^{}]+)\{[^{}]*(?:animation|transition):[^{}]*\}/g)) assert.ok(selector.includes(".ab-playing"), selector);
		assert.equal(svg, render(claim, { scheme, idPrefix }).svg);
	}
});

test("all existing sequence examples without play sections retain baseline bytes in all three schemes", () => {
	const baseline = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/pre-sequence-playback.json.gz", import.meta.url))).toString()) as {
		fixtures: { file: string; outputs: string[] }[];
	};
	let count = 0;
	for (const { file, outputs } of baseline.fixtures) {
		const source = readFileSync(new URL(`./examples/${file}`, import.meta.url), "utf8");
		if (!source.startsWith("sequence")) continue;
		count++;
		for (const [i, scheme] of schemes.entries()) {
			const { svg } = render(source, { scheme, idPrefix: file.slice(0, -5) });
			assert.equal(svg, outputs[i], `${file}, ${scheme ?? "auto"}`);
			assert.doesNotMatch(svg, /seq-(?:packet|activation|time-band|length)|data-ab-play/);
		}
	}
	assert.ok(count > 0);
	// Even an empty play section gets overlays; presence, not step validity,
	// controls whether the renderer emits the playback contract.
	assert.match(render("sequence v0\nparticipant a\na --> a: Self\nplay\n").svg, /seq-packet/);
});
