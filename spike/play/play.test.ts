import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { render } from "../flow/index.ts";
import { build, parsePlay } from "./play.ts";

const flow = readFileSync(new URL("../examples/loop.flow", import.meta.url), "utf8");

test("steps take the tempo unless they name a time", () => {
	const play = parsePlay('play v0\ntempo 2s\nstep start\nstep ready 3.5s "Ready"\n');
	assert.deepEqual(
		play.steps.map((s) => [s.node, s.ms, s.caption]),
		[["start", 2000, ""], ["ready", 3500, "Ready"]],
	);
});

test("the example plays without problems", () => {
	const play = parsePlay(readFileSync(new URL("loop.play", import.meta.url), "utf8"));
	assert.deepEqual(build(play, flow).problems, []);
});

test("unknown nodes and missing edges are reported", () => {
	const play = parsePlay("step start\nstep nowhere\nstep merged\n");
	const { problems } = build(play, flow);
	assert.equal(problems.filter((p) => p.includes('no node "nowhere"')).length, 1);
	assert.equal(problems.filter((p) => p.includes("no edge")).length, 2);
});

test("targets mark nodes and edges and change nothing without the option", () => {
	assert.equal(render(flow).svg.includes("data-node"), false);
	const svg = render(flow, { targets: true }).svg;
	assert.match(svg, /<g data-node="reviewer">/);
	assert.match(svg, /<path data-from="reviewer" data-to="needs-changes"/);
});
