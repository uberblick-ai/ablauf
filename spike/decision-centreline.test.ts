import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "./flow/index.ts";

const questions = ["Supported hoster with an API?", "Code entered?"];

function assertDecisionTips(result: ReturnType<typeof render>, center: number) {
	const diamonds = [...result.svg.matchAll(/<path d="([^"]+)" class="k-neutral decision"\/>/g)];
	const decisions = result.layout.nodes.filter(p => p.node.kind === "decision");
	assert.equal(diamonds.length, decisions.length);
	for (const [i, p] of decisions.entries()) {
		const points = [...diamonds[i][1].matchAll(/[ML]([\d.]+),([\d.]+)/g)]
			.map(([, x, y]) => [Number(x), Number(y)]);
		assert.deepEqual(points[0], [center, p.y]);
		assert.deepEqual(points[2], [center, p.y + p.h]);
	}
}

test("same-column decision edges stay straight and leave inline-label clearance", () => {
	for (const [parity, question] of questions.entries()) {
		const result = render(`flow v0
columns main
text start col=main "Creator picks a podcast or enters its RSS feed"
decision q "${question}"
box email title="Email code" "6-digit code to the feed owner"

start --> q
q --> email label=inline : no
`);
		const { layout, svg, diagnostics } = result;
		assert.deepEqual(diagnostics, []);
		assert.equal(layout.nodes[1].w % 2, 1 - parity);
		const center = Math.round(layout.nodes[0].x + layout.nodes[0].w / 2);
		for (const route of layout.routes) {
			assert.equal(route.points.length, 2);
			assert.ok(route.points.every(([x]) => x === center));
			const [[x1, y1], [x2, y2]] = route.points;
			assert.ok(svg.includes(`<path d="M${x1},${y1} L${x2},${y2}" class="e e-ink"/>`));
		}
		assertDecisionTips(result, center);
		const route = layout.routes[1];
		const label = route.label;
		assert.ok(label?.inline);
		assert.equal(label.x, center);
		assert.deepEqual(label.lines, ["NO"]);
		assert.ok(label.y - label.h / 2 - route.points[0][1] >= 18);
		assert.ok(route.points[1][1] - (label.y + label.h / 2) >= 18);
		assert.match(svg, new RegExp(`<text x="${center}"[^>]+>NO</text>`));
	}
});

test("odd and even decisions share their column centre with every node kind", () => {
	for (const [parity, question] of questions.entries()) {
		for (const columnParity of [0, 1]) {
			for (const kind of ["text", "pill", "box", "end", "panel", "decision"]) {
				const peer = (id: string) => `${kind} ${id} "${questions[1 - parity]}"`;
				const result = render([
					"flow v0", "columns main",
					`text wide "${"x".repeat(60 + columnParity)}"`,
					peer("before"), `decision q "${question}"`, peer("after"),
					"wide --> before", "before --> q", "q --> after",
				].join("\n"));
				const { layout, diagnostics } = result;
				assert.deepEqual(diagnostics, [], `${kind}, ${question}, column parity ${columnParity}`);
				const [wide, , q] = layout.nodes;
				assert.equal(wide.w % 2, columnParity);
				assert.equal(q.w % 2, 1 - parity);
				const center = Math.round(wide.x + wide.w / 2);
				for (const p of layout.nodes) assert.equal(Math.round(p.x + p.w / 2), center);
				for (const route of layout.routes) {
					assert.equal(route.points.length, 2);
					assert.ok(route.points.every(([x]) => x === center));
				}
				assert.deepEqual(layout.routes[1].points[1], [center, q.y]);
				assert.deepEqual(layout.routes[2].points[0], [center, q.y + q.h]);
				assertDecisionTips(result, center);
			}
		}
	}
});

test("decision alignment preserves explicit slots and side branches", () => {
	for (const question of questions) {
		const { layout, diagnostics } = render(`flow v0
columns main side
text start col=main "Creator picks a podcast or enters its RSS feed"
decision q "${question}"
box next col=main
box branch col=side row=q
start --> q from=bottom.1 to=top.1
q --> next from=bottom.2 to=top.1
q --> branch
`);
		assert.deepEqual(diagnostics.map(d => [d.line, d.message]), [
			[8, "q is a decision; it has one port per side, so bottom.2 is drawn at the middle"],
		]);
		const [, q] = layout.nodes;
		const center = Math.round(q.x + q.w / 2);
		assert.deepEqual(layout.routes[0].points.at(-1), [center, q.y]);
		assert.deepEqual(layout.routes[1].points[0], [center, q.y + q.h]);
		assert.deepEqual(layout.routes[2].points[0], [q.x + q.w, q.y + q.h / 2]);
		assert.equal(layout.routes[2].points.length, 2);
	}
});
