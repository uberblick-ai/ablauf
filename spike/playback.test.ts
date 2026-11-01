import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
import { render, LIGHT, DARK } from "./flow/index.ts";
import { splitPlay } from "./flow/play.ts";

const flow = `flow v0
columns main
text start "Start here" col=main
pill ready
box work title="The worker"
decision check "Approved?"
end done "Finished"
panel human
  text "A person decides"
start --> ready
ready --> work
work --> check
check --> done : yes
done --> human
`;

test("all pre-playback examples keep their captured main SVG bytes in every scheme", () => {
	const baseline = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/pre-playback.json.gz", import.meta.url))).toString()) as {
		sha: string; fixtures: { file: string; outputs: string[] }[];
	};
	assert.equal(baseline.sha, "a7189341e0db26658e82a3b610be8716228bb00a");
	assert.equal(baseline.fixtures.length, 16);
	for (const { file, outputs } of baseline.fixtures) {
		const source = readFileSync(new URL(`./examples/${file}`, import.meta.url), "utf8");
		for (const [i, scheme] of ([undefined, "light", "dark"] as const).entries()) {
			const result = render(source, { scheme, idPrefix: file.slice(0, -5) });
			assert.equal(result.svg, outputs[i], `${file} ${scheme ?? "auto"}`);
			assert.deepEqual(result.timelines, []);
		}
	}
});

test("shared grammar uses JSON strings, quoted targets and original source lines", () => {
	const parsed = splitPlay('flow v0\ncolumns a\n\nplay "A \\"quoted\\" name"\n  tempo 1.8s\n  step "two words" 800ms actor="A\\nB" "C\\tD"\n  step a.b "A \\"caption\\""\n');
	assert.deepEqual(parsed.diagnostics, []);
	assert.equal(parsed.source, "flow v0\ncolumns a\n");
	assert.deepEqual(parsed.scenarios, [{ name: 'A "quoted" name', line: 4, steps: [
		{ target: "two words", ms: 800, actor: "A\nB", caption: "C\tD", line: 6 },
		{ target: "a.b", ms: 1800, actor: undefined, caption: 'A "caption"', line: 7 },
	] }]);
});

test("durations accept the bounds and recover invalid and absurd values to tempo", () => {
	const invalid = ["0s", "99ms", "60001ms", "61s", "-2s", "NaNs", "Infinitys", "2m", "1e3ms", `${"9".repeat(400)}s`];
	const source = `flow v0\nplay\n tempo 1.8s\n step a 100ms\n step a 60s\n${invalid.map(value => ` step a ${value}`).join("\n")}\nplay\n tempo 0s\n step a\n`;
	const { scenarios, diagnostics } = splitPlay(source);
	assert.deepEqual(scenarios[0].steps.map(s => s.ms), [100, 60000, ...invalid.map(() => 1800)]);
	assert.equal(scenarios[1].steps[0].ms, 1600);
	assert.deepEqual(diagnostics.map(d => d.line), [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17]);
	assert.ok(diagnostics.every(d => d.message.includes("duration")));
});

test("unreadable play lines diagnose and recover at the next line and section", () => {
	const { scenarios, diagnostics } = splitPlay(`flow v0
play bad
 tempo 800ms
 tempo 2s
 step a actor="bad\\q"
 step "a"junk
 nonsense
 step a "caption" trailing
 step
 step a
 tempo 4s
play "Good"
 step b
`);
	assert.deepEqual(diagnostics.map(d => d.line), [2, 4, 5, 6, 7, 8, 9, 11]);
	assert.deepEqual(scenarios.map(s => [s.name, s.steps.map(step => step.ms)]), [["Scenario 1", [800]], ["Good", [1600]]]);
});

test("timelines expose every node kind, default titles, captions, actors and part identities", () => {
	const { timelines, diagnostics } = render(`${flow}play "Clean merge"
 tempo 1.8s
 step start actor="Maintainer" "Begin"
 step ready
 step work 800ms
 step check
 step done
 step human
`);
	assert.deepEqual(diagnostics, []);
	assert.deepEqual(timelines, [{ name: "Clean merge", slug: "clean-merge", steps: [
		{ target: "start", kind: "text", actor: "Maintainer", caption: "Begin", ms: 1800, parts: ["node-0"] },
		{ target: "ready", kind: "pill", actor: "ready", caption: "", ms: 1800, parts: ["node-1", "edge-0"] },
		{ target: "work", kind: "box", actor: "The worker", caption: "", ms: 800, parts: ["node-2", "edge-1"] },
		{ target: "check", kind: "decision", actor: "Approved?", caption: "", ms: 1800, parts: ["node-3", "edge-2"] },
		{ target: "done", kind: "end", actor: "Finished", caption: "", ms: 1800, parts: ["node-4", "edge-3"] },
		{ target: "human", kind: "panel", actor: "human", caption: "", ms: 1800, parts: ["node-5", "edge-4"] },
	] }]);
});

test("slug collisions include explicit suffixes and each scenario resolves independently", () => {
	const sections = ['"A B"', '"A B-2"', '"A B"', '"A B"', '', '"!!!"', '"???"'];
	const result = render(flow + sections.map(name => `play ${name}\n step done\n`).join(""));
	assert.deepEqual(result.diagnostics, []);
	assert.deepEqual(result.timelines.map(t => t.slug), ["a-b", "a-b-2", "a-b-3", "a-b-4", "scenario-5", "scenario", "scenario-2"]);
	assert.ok(result.timelines.every(t => t.steps[0].parts.length === 1));
});

test("skipped targets and missing edges preserve the last successful predecessor", () => {
	const result = render(`${flow}play
 step unknown
 step start
 step done
 step missing
 step ready
 step ready
 step work
`);
	assert.deepEqual(result.diagnostics.map(d => d.line), [16, 18, 19]);
	assert.deepEqual(result.timelines[0].steps.map(s => [s.target, s.parts]), [
		["start", ["node-0"]], ["ready", ["node-1", "edge-0"]], ["ready", ["node-1"]], ["work", ["node-2", "edge-1"]],
	]);
});

test("dotted and quoted targets resolve; ambiguous endpoint pairs and parallel edges have distinct parts", () => {
	const source = `flow v0
columns main
box a>b col=main
box c
box a
box b>c
box a.b
a>b --> c
a>b -.-> c
a --> b>c
b>c --> a.b
play
 step "a>b"
 step c
play
 step a
 step b>c
 step "a.b"
`;
	const { timelines, svg } = render(source);
	assert.deepEqual(timelines[0].steps[1].parts, ["node-1", "edge-0", "edge-1"]);
	assert.deepEqual(timelines[1].steps[1].parts, ["node-3", "edge-2"]);
	assert.deepEqual(timelines[1].steps[2].parts, ["node-4", "edge-3"]);
	for (let i = 0; i < 4; i++) assert.equal(svg.match(new RegExp(`data-ab-part="edge-${i}"`, "g"))?.length, 2);
});

test("sequence and fan-out retain static figures and diagnose every unsupported section", () => {
	for (const source of ['sequence v0\nparticipant A\nparticipant B\nA --> B: Hello\n', 'fan-out v0\nstep "Choose"\noutcome "Done" reason="Yes" destination="End"\n']) {
		const result = render(`${source}play "First"\n step 1\nplay\n step "Done"\n`);
		assert.deepEqual(result.timelines, []);
		assert.equal(result.svg, render(source).svg);
		assert.deepEqual(result.diagnostics.map(d => d.line), [source.split("\n").length, source.split("\n").length + 2]);
		assert.ok(result.diagnostics.every(d => d.message.includes("playback is not supported")));
	}
});

test("diagram strings and a node named play keep the existing grammar", () => {
	const source = 'flow v0\ncolumns main\nbox play col=main title="A\\nB"\nbox b\nplay --> b\n';
	assert.deepEqual(splitPlay(source).scenarios, []);
	assert.deepEqual(render(source).diagnostics, []);
	assert.equal(render(`${source}play\n step play\n step b\n`).timelines[0].steps[0].actor, "A\\nB");
});

test("playable SVG preserves drawing order and all labels, with scoped state colours and heads", () => {
	const staticSvg = render(flow).svg;
	for (const scheme of [undefined, "light", "dark"] as const) {
		const svg = render(`${flow}play\n step start\n`, { scheme, idPrefix: 'host:<unsafe>' }).svg;
		assert.equal(svg, render(`${flow}play\n step start\n`, { scheme, idPrefix: 'host:<unsafe>' }).svg);
		assert.match(svg, /--play:var\(--ab-play,#[0-9a-f]+\)/);
		assert.match(svg, /--play-done:var\(--ab-play-done,#[0-9a-f]+\)/);
		assert.match(svg, /\.ab \[data-ab-part\]\.ab-current/);
		assert.match(svg, /\.ab \[data-ab-part\]\.ab-played/);
		assert.match(svg, /marker-end:url\(#host\.003a\.003cunsafe\.003e-play-current\)/);
		assert.match(svg, /class="play-head-played"/);
		assert.equal(svg.match(/data-ab-part="edge-3"/g)?.length, 3, "stroke, head and label share a part");
		for (let i = 0; i < 6; i++) assert.match(svg, new RegExp(`data-ab-part="node-${i}"`));
		const shapes = (value: string) => value.replace(/<defs>[\s\S]*?<\/defs>/, "").match(/<(?:path|rect|circle|line|text)\b[^>]*>/g)?.map(tag => tag.replace(/marker-end="[^"]*"/, 'marker-end="HEAD"'));
		assert.deepEqual(shapes(svg), shapes(staticSvg));
		const playbackStyle = svg.match(/--play:.*?<\/style>/s)?.[0] ?? "";
		assert.doesNotMatch(playbackStyle, /opacity|animation/);
	}
	assert.doesNotMatch(staticSvg, /data-ab-part|ab-current|ab-played|--ab-play/);
	assert.equal(Object.keys(LIGHT).length, 18);
	assert.equal(Object.keys(DARK).length, 18);
});

test("play strings stay inert and malformed sections still render", () => {
	const source = `${flow}play "<script>alert(1)</script>"\n step start actor="<img onerror=bad>" "https://bad.example"\nplay "broken\n step ready\n`;
	const result = render(source);
	assert.match(result.svg, /^<svg/);
	assert.doesNotMatch(result.svg, /<script|onerror|https:\/\/bad/);
	assert.equal(result.timelines[0].name, "<script>alert(1)</script>");
	assert.equal(result.timelines[0].steps[0].actor, "<img onerror=bad>");
	assert.equal(result.diagnostics[0].line, 17);
});
