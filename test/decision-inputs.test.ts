import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "../src/index.ts";
import { type Point, type Route, segments } from "../src/grid.ts";
import { createPlayer } from "../src/playback.ts";
import { toSvg } from "../src/svg.ts";
import { Doc, El } from "./test-dom.ts";

const source = `flow v0
columns left middle right
box first col=left "First input"
box second col=right row=first "Second input"
decision check col=middle "Allowed?"
end done col=middle "Continue"

first --> check from=bottom to=top
second --> check from=bottom to=top
check --> done`;

const play = `

play "First input"
  tempo 100ms
  step first
  step check
  step done
play "Second input"
  tempo 100ms
  step second
  step check
  step done`;

const crossingSource = `flow v0
columns outerleft left middle right outerright
box first col=left gap=100 "First input"
box second col=right row=first "Second input"
decision check col=middle "Allowed?"
box crossleft col=outerleft row=first span=2 "Cross left"
box crossright col=outerright row=first span=2 "Cross right"

first --> check from=bottom to=top
crossleft --> crossright from=right to=left tone=stop
second --> check from=bottom to=top`;

const path = (points: Point[]) => points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
const stroke = (r: Route) => `<path d="${path(r.points)}" class="e e-${r.tone}${r.edge.dashed ? " dash" : ""}"/>`;
const head = (r: Route) => `<path d="${path(r.points.slice(-2))}" class="arrow" marker-end="url(#inputs-${r.tone})"/>`;

function headsAt(svg: string, end: Point) {
	return [...svg.matchAll(/<path d="([^"]+)" class="arrow"[^>]*\/>/g)]
		.filter(([, d]) => d.endsWith(`L${end[0]},${end[1]}`));
}

// Read painted SVG segments, then sample every interval delimited by authored
// vertices. This checks both the unequal tail's extension and common suffix.
function assertStrokedOnce(svg: string, routes: Route[]) {
	const painted = [...svg.matchAll(/<path d="([^"]+)" class="e e-[^"]+"\/>/g)]
		.flatMap(([, d]) => {
			const points: Point[] = [...d.matchAll(/[ML]([\d.]+),([\d.]+)/g)]
				.map(([, x, y]) => [Number(x), Number(y)]);
			return segments({ ...routes[0], points });
		});
	const authored = routes.flatMap(segments);
	for (const [a, b] of authored) {
		const k = a[0] === b[0] ? 1 : 0;
		const lo = Math.min(a[k], b[k]);
		const hi = Math.max(a[k], b[k]);
		const cuts = [...new Set([lo, hi, ...authored.flatMap(s => s.flatMap(p =>
			p[1 - k] === a[1 - k] && p[k] > lo && p[k] < hi ? [p[k]] : []))])].sort((x, y) => x - y);
		for (let i = 1; i < cuts.length; i++) {
			const mid = (cuts[i - 1] + cuts[i]) / 2;
			const count = painted.filter(([p, q]) => p[1 - k] === a[1 - k] && q[1 - k] === a[1 - k] &&
				Math.min(p[k], q[k]) < mid && Math.max(p[k], q[k]) > mid).length;
			assert.equal(count, 1, `paint count on ${path([a, b])} at ${mid}`);
		}
	}
}

test("exact decision-input reproduction retains both branches, one tail and one head", () => {
	const result = render(source, { idPrefix: "inputs" });
	assert.deepEqual(result.diagnostics, []);
	assert.deepEqual(result.layout.routes.map(r => r.points), [
		[[106, 62], [106, 77], [337, 77], [337, 92]],
		[[568, 62], [568, 77], [337, 77], [337, 92]],
		[[337, 166], [337, 196]],
	]);
	assert.ok(result.svg.includes('<path d="M106,62 L106,77 L337,77 L337,92" class="e e-ink"/>'));
	assert.ok(result.svg.includes('<path d="M568,62 L568,77 L337,77" class="e e-ink"/>'));
	assertStrokedOnce(result.svg, result.layout.routes);
	assert.equal(headsAt(result.svg, [337, 92]).length, 1);
	assert.ok(result.svg.includes(head(result.layout.routes[0])));
	assert.equal(result.svg, render(source, { idPrefix: "inputs" }).svg);
});

test("unequal final segments share only their common suffix in either source order and style", () => {
	for (const node of ["first", "second"]) {
		for (const dashed of [false, true]) {
			const text = source.replace(`box ${node}`, `text ${node}`)
				.replaceAll("--> check", `${dashed ? "-.->" : "-->"} check tone=done`);
			const { svg, diagnostics, layout } = render(text, { idPrefix: "inputs" });
			assert.deepEqual(diagnostics, []);
			const [a, b] = layout.routes;
			assert.notEqual(a.points.at(-2)?.[1], b.points.at(-2)?.[1]);
			assertStrokedOnce(svg, layout.routes);
			assert.equal(headsAt(svg, a.points.at(-1) as Point).length, 1);
			assert.ok(svg.includes(head(a)));
			assert.equal([...svg.matchAll(/class="e e-done dash"/g)].length, dashed ? 2 : 0);
			assert.equal([...svg.matchAll(/class="e e-done"/g)].length, dashed ? 0 : 2);
		}
	}
});

test("matching dashed inputs with equal final segments also paint the tail once", () => {
	const { svg, diagnostics, layout } = render(source.replaceAll("--> check", "-.-> check"), { idPrefix: "inputs" });
	assert.deepEqual(diagnostics, []);
	assertStrokedOnce(svg, layout.routes);
	assert.equal(headsAt(svg, layout.routes[0].points.at(-1) as Point).length, 1);
	assert.equal([...svg.matchAll(/class="e e-ink dash"/g)].length, 2);
});

test("shared static tails emit crossing knockouts only for the strokes that paint them", () => {
	const edges = crossingSource.split("\n").slice(-3);
	for (const order of [[0, 1, 2], [1, 0, 2], [0, 2, 1]]) {
		for (const scheme of ["light", "dark"] as const) {
			for (const dashed of [false, true]) {
				const text = [...crossingSource.split("\n").slice(0, -3), ...order.map(i => edges[i])].join("\n")
					.replaceAll("--> check", dashed ? "-.-> check" : "--> check");
				const { svg, diagnostics, layout } = render(text, { scheme, idPrefix: "inputs" });
				assert.deepEqual(diagnostics, order[0] === 1 ? [
					{ line: 10, severity: "warning", message: "edge first → check crosses crossleft → crossright" },
					{ line: 11, severity: "warning", message: "edge second → check crosses crossleft → crossright" },
				] : order[1] === 1 ? [
					{ line: 10, severity: "warning", message: "edge crossleft → crossright crosses first → check" },
					{ line: 11, severity: "warning", message: "edge second → check crosses crossleft → crossright" },
				] : [
					{ line: 11, severity: "warning", message: "edge crossleft → crossright crosses first → check" },
					{ line: 11, severity: "warning", message: "edge crossleft → crossright crosses second → check" },
				]);
				const incoming = layout.routes.filter(r => r.edge.to === "check");
				assert.deepEqual(incoming.map(r => r.points), [
					[[342, 62], [342, 112], [563, 112], [563, 162]],
					[[784, 62], [784, 112], [563, 112], [563, 162]],
				]);
				assertStrokedOnce(svg, layout.routes);
				assert.equal(headsAt(svg, [563, 162]).length, 1);
				const gaps = [...svg.matchAll(/<path d="([^"]+)" class="knockout"\/>/g)];
				assert.deepEqual(gaps.map(m => m[1]), [order[0] === 1 ? "M563,120 L563,132" : "M557,126 L569,126"]);
				// Every knockout is followed by the visible stroke that fills it.
				const upper = order[0] === 1 ? incoming[0] : layout.routes.find(r => r.tone === "stop") as Route;
				assert.ok(gaps[0].index < svg.indexOf(stroke(upper)));
				assert.equal(svg, render(text, { scheme, idPrefix: "inputs" }).svg);
			}
		}
	}
});

test("interleaved playable inputs retain both full strokes and their crossing knockouts", () => {
	for (const scheme of ["light", "dark"] as const) {
		const text = `${crossingSource}\n\nplay "First"\n  step first\n  step check\nplay "Second"\n  step second\n  step check`;
		const { svg, layout, diagnostics } = render(text, { scheme, idPrefix: "inputs" });
		assert.deepEqual(diagnostics.map(d => d.line), [10, 11]);
		assert.deepEqual([...svg.matchAll(/<path d="([^"]+)" class="knockout"\/>/g)].map(m => m[1]), [
			"M557,126 L569,126", "M563,120 L563,132",
		]);
		for (const i of [0, 2]) {
			assert.ok(svg.includes(`<g data-ab-part="edge-${i}">${stroke(layout.routes[i])}</g>`));
			assert.ok(svg.includes(`<g data-ab-part="edge-${i}">${head(layout.routes[i])}</g>`));
		}
		assert.equal(headsAt(svg, [563, 162]).length, 2);
	}
});

test("a later input still owns knockouts on its unshared tail extension", () => {
	const { layout } = render(crossingSource);
	layout.routes[0].points = [[463, 112], [563, 112], [563, 162]];
	layout.routes[1].points = [[553, 100], [573, 100]];
	layout.routes[2].points = [[663, 90], [563, 90], [563, 162]];
	const authored = structuredClone(layout.routes.map(r => r.points));
	for (const scheme of ["light", "dark"] as const) {
		const svg = toSvg(layout, { scheme, idPrefix: "inputs" });
		const gap = '<path d="M563,94 L563,106" class="knockout"/>';
		assert.equal([...svg.matchAll(/class="knockout"/g)].length, 1);
		assert.ok(svg.indexOf(gap) > svg.indexOf(stroke(layout.routes[1])));
		assert.ok(svg.indexOf(gap) < svg.indexOf('<path d="M663,90 L563,90 L563,112" class="e e-ink"/>'));
		assertStrokedOnce(svg, layout.routes);
		assert.equal(headsAt(svg, [563, 162]).length, 1);
		assert.deepEqual(layout.routes.map(r => r.points), authored);
	}
});

test("a fully covered straight input emits no empty stroke", () => {
	const text = 'flow v0\nbox first\ndecision check\nfirst --> check\nfirst --> check';
	const { svg, layout } = render(text, { idPrefix: "inputs" });
	assertStrokedOnce(svg, layout.routes);
	assert.equal([...svg.matchAll(/class="e e-ink"/g)].length, 1);
	assert.equal(headsAt(svg, layout.routes[0].points.at(-1) as Point).length, 1);
});

test("three inputs stroke the union of unequal terminal segments once", () => {
	const text = source.replace('end done', 'text third col=middle row=first "Third"\nend done')
		.replace("check --> done", "third --> check\ncheck --> done");
	const { svg, diagnostics, layout } = render(text, { idPrefix: "inputs" });
	assert.deepEqual(diagnostics, []);
	assertStrokedOnce(svg, layout.routes);
	assert.equal(headsAt(svg, layout.routes[0].points.at(-1) as Point).length, 1);
});

test("earlier overlap on the same converging pair keeps its line-numbered diagnostic", () => {
	const text = source.replace("second col=right", "second col=middle")
		.replace("check col=middle", "check col=right").replace("done col=middle", "done col=right");
	for (const suffix of ["", play]) {
		const { diagnostics } = render(text + suffix);
		assert.deepEqual(diagnostics, [{ line: 9, severity: "warning", message: "edge second → check overlaps first → check" }]);
	}
});

test("other targets, decision sides and mismatched styles keep complete separate edges and diagnostics", () => {
	for (const text of [
		source.replace("decision check", "box check").replaceAll("to=top", "to=top.1"),
		source.replaceAll("to=top", "to=bottom"),
		source.replaceAll("from=bottom to=top", "from=left to=left"),
		source.replace("second --> check", "second --> check tone=done"),
		source.replace("second --> check", "second -.-> check"),
	]) {
		const { svg, diagnostics, layout } = render(text, { idPrefix: "inputs" });
		assert.ok(diagnostics.some(d => d.line === 9 && d.message === "edge second → check overlaps first → check"), text);
		for (const r of layout.routes.slice(0, 2)) {
			assert.ok(svg.includes(stroke(r)));
			assert.ok(svg.includes(head(r)));
		}
		assert.equal(headsAt(svg, layout.routes[0].points.at(-1) as Point).length, 2);
	}
});

test("labels retain their authored placement and SVG when tails share", () => {
	const text = source.replace("to=top", "to=top : first branch").replace("second --> check from=bottom to=top", "second --> check from=bottom to=top : second branch");
	const { svg, diagnostics, layout } = render(text);
	assert.deepEqual(diagnostics, []);
	for (const r of layout.routes.slice(0, 2)) {
		assert.ok(r.label);
		assert.ok(svg.includes(`<text x="${r.label.x}" y="${r.label.y}"`));
		assert.ok(svg.includes(r.label.text));
	}
});

test("playable inputs keep their entire strokes and heads in independent current/unplayed parts", t => {
	t.mock.timers.enable({ apis: ["setTimeout"] });
	for (const dashed of [false, true]) {
		const text = source.replaceAll("--> check", dashed ? "-.-> check" : "--> check") + play;
		const { svg, diagnostics, layout, timelines } = render(text, { idPrefix: "inputs" });
		assert.deepEqual(diagnostics, []);
		const doc = new Doc();
		const element = new El("svg", doc);
		for (const [, part, content] of svg.matchAll(/<g data-ab-part="([^"]+)">([\s\S]*?)<\/g>/g)) {
			const wrapper = new El("g", doc);
			wrapper.setAttribute("data-ab-part", part);
			wrapper.textContent = content;
			element.append(wrapper);
		}
		for (const i of [0, 1]) {
			const contents = element.children.filter(el => el.getAttribute("data-ab-part") === `edge-${i}`).map(el => el.textContent);
			assert.deepEqual(contents, [stroke(layout.routes[i]), head(layout.routes[i])]);
		}
		assert.equal(headsAt(svg, layout.routes[0].points.at(-1) as Point).length, 2);
		const player = createPlayer(element as unknown as SVGSVGElement, timelines);
		t.after(() => player.destroy());
		for (const i of [0, 1]) {
			player.select(i);
			player.play();
			t.mock.timers.tick(100);
			assert.equal(player.state.step, 1);
			assert.ok(element.classList.contains("ab-playing"));
			assert.ok(element.classList.contains("ab-in-progress"));
			for (const j of [0, 1]) {
				const parts = element.children.filter(el => el.getAttribute("data-ab-part") === `edge-${j}`);
				assert.equal(parts.length, 2);
				for (const part of parts) {
					assert.equal(part.classList.contains("ab-current"), i === j);
					assert.equal(part.classList.contains("ab-played"), false);
				}
			}
			player.pause();
		}
		player.destroy();
		assert.equal(doc.motion.listeners.size, 0);
		assert.ok(element.children.every(el => !el.classList.contains("ab-current")));
	}
});
