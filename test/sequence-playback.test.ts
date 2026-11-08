import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { render } from "../src/index.ts";
import { createPlayer, mountPlayback } from "../src/playback.ts";
import { Doc, El } from "./test-dom.ts";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const claim = read("../examples/claim.flow");
const claimPlay = read("../examples/claim-play.flow");
const schemes = [undefined, "light", "dark"] as const;

const annotated = `sequence v0
participant a "Sender" tone=agent
participant b "Receiver" tone=system
participant c "Unused" tone=muted
note over a: Orphan before headings
section "Start"
alt Outer
a --> b: Request
note over a: First note

# Comments and blank lines do not interrupt notes.
note over b: Second note
else Other
loop Retry
b --> b: Self
end
end
note over b: Note across invisible ends
section "Finish"
group Empty
end
a -.-> b: Response after end
section "Broken"
note over a: This note breaks the section run
alt Blocked
note over b: This note breaks the opening run
a --> a: Self after note
end
section "Unattached tail"
`;
const plays = `play "Röute"
 tempo 100ms
 step 01 "Begin"
 step 3 actor="Narrator" "Skip the other branch"
 step 4
play "Röute"
 step 2
play "Empty"
`;

test("pre-sequence examples retain SVG bytes apart from the separately tested flow playback styles", () => {
	const baseline = JSON.parse(gunzipSync(readFileSync(new URL("./golden/pre-sequence-playback.json.gz", import.meta.url))).toString()) as {
		sha: string; fixtures: { file: string; outputs: string[] }[];
	};
	assert.equal(baseline.sha, "3751cb9c22ae8c9682b645c2b396427fee2d692a");
	assert.equal(baseline.fixtures.length, 19);
	// These examples were added after this immutable 19-example capture;
	// their feature tests cover the new output separately.
	const later = ["claim-play.flow", "fanout-shared.flow", "run-endings-multi-step.flow"];
	assert.deepEqual(baseline.fixtures.map(f => f.file), readdirSync(new URL("../examples", import.meta.url)).filter(f => f.endsWith(".flow") && !later.includes(f)).sort());
	for (const { file, outputs } of baseline.fixtures) {
		for (const [i, scheme] of schemes.entries()) {
			const actual = render(read(`../examples/${file}`), { scheme, idPrefix: file.slice(0, -5) }).svg;
			// #96 intentionally changes flow fade/effect CSS. Its full emitted
			// cascade is checked by playback-fade/effects/theming.test.ts; keep
			// this older sequence baseline checking all other drawing bytes.
			const drawing = (svg: string) => /data-ab-play=/.test(svg) && /^flow v0/m.test(read(`../examples/${file}`))
				? svg.replace(/<style>[\s\S]*?<\/style>/, "") : svg;
			assert.equal(drawing(actual), drawing(outputs[i]), `${file}, ${scheme ?? "auto"}`);
		}
	}
});

test("sequence targets normalize padded message numbers, titles supply actors, and self-messages name one actor", () => {
	for (const scheme of schemes) {
		const result = render(`${claim}play "A name"
 tempo 1.8s
 step 9
 step 09 800ms actor="Custom" "Caption"
 step 11
play "A name"
 step 14
 step 15
play
 step 1
`, { scheme });
		assert.deepEqual(result.diagnostics, []);
		assert.deepEqual(result.timelines.map(t => [t.name, t.slug]), [["A name", "a-name"], ["A name", "a-name-2"], ["Scenario 3", "scenario-3"]]);
		assert.deepEqual(result.timelines[0].steps, [
			{ target: "9", kind: "message", actor: "Creator → Studio", caption: "", ms: 1800, parts: ["message-8", "participant-0", "participant-1", "annotation-2"] },
			{ target: "9", kind: "message", actor: "Custom", caption: "Caption", ms: 800, parts: ["message-8", "participant-0", "participant-1", "annotation-2"] },
			{ target: "11", kind: "message", actor: "Backend", caption: "", ms: 1800, parts: ["message-10", "participant-2"] },
		]);
		assert.deepEqual(result.timelines[1].steps.map(s => s.target), ["14", "15"]);
		assert.deepEqual(result.timelines[1].steps[0].parts, ["message-13", "participant-2", "participant-1", "annotation-4"]);
	}
});

test("invalid targets diagnose their original lines and skip only that step", () => {
	const invalid = ["Creator", "0", "00", "16", "-1", "+1", "1.0", "1e0", "0x1", "Infinity", "9".repeat(400), '"two words"', '""', "١"];
	const source = `${claim}\n# Still original line numbers\nplay\n${invalid.map(target => ` step ${target}\n step 01`).join("\n")}\nplay\n step 2\n`;
	const result = render(source);
	const first = source.split("\n").indexOf("play") + 2;
	assert.deepEqual(result.diagnostics.map(d => [d.line, d.severity]), invalid.map((_, i) => [first + i * 2, "error"]));
	assert.ok(result.diagnostics.every(d => d.message.includes("expected a drawn message number; step skipped")));
	assert.deepEqual(result.timelines.map(t => t.steps.map(s => s.target)), [invalid.map(() => "1"), ["2"]]);
	assert.match(result.svg, /data-step="15"/);
	const empty = render("sequence v0\nparticipant a\nplay\n step 1\n");
	assert.deepEqual(empty.timelines[0].steps, []);
	assert.equal(empty.diagnostics[0].line, 4);
});

test("shared parser recovery and JSON strings work unchanged for sequence sections", () => {
	const result = render(`${claim}play "A \\"name\\""
 tempo 800ms
 step 1 99ms actor="A\\nB" "C\\tD"
 step 2 actor="bad\\q"
 step 3
`);
	assert.deepEqual(result.diagnostics.map(d => d.line), [claim.split("\n").length + 2, claim.split("\n").length + 3]);
	assert.deepEqual(result.timelines[0].steps.map(s => [s.target, s.actor, s.caption, s.ms]), [["1", "A\nB", "C\tD", 800], ["3", "Creator → Studio", "", 800]]);
});

test("all accepted headers, messages and annotations are indexed parts with exact adjacency", () => {
	const { svg, diagnostics, timelines } = render(annotated + plays);
	assert.deepEqual(diagnostics, []);
	assert.deepEqual(timelines.map(t => t.slug), ["route", "route-2", "empty"]);
	assert.deepEqual(timelines[0].steps.map(s => s.parts), [
		["message-0", "participant-0", "participant-1", "annotation-1", "annotation-2", "annotation-3", "annotation-4"],
		["message-2", "participant-0", "participant-1", "annotation-8", "annotation-9"],
		["message-3", "participant-0"],
	]);
	assert.deepEqual(timelines[1].steps[0].parts, ["message-1", "participant-1", "annotation-5", "annotation-6", "annotation-7"]);
	assert.equal(timelines[1].steps[0].actor, "Receiver");
	const parts = [...svg.matchAll(/<g[^>]*data-ab-part="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g)];
	assert.equal(parts.length, 26);
	assert.equal(new Set(parts.map(m => m[1])).size, 22);
	const lit = new Set(timelines.flatMap(t => t.steps.flatMap(s => s.parts)));
	assert.deepEqual(parts.map(m => m[1]).filter(p => !lit.has(p)), ["participant-2", "annotation-0", "annotation-10", "annotation-11", "annotation-12", "annotation-13", "annotation-14"]);
	for (const [, id, drawing] of parts) {
		assert.doesNotMatch(drawing, /seq-life|seq-lane|seq-group"|seq-divider|seq-rule|seq-rejected/);
		if (drawing.includes('class="seq-time-band"')) continue;
		if (id.startsWith("message-")) {
			assert.match(drawing, /seq-label/); assert.match(drawing, /seq-number/);
			assert.match(drawing, /<path[^>]*marker-end="url\(#/);
			assert.equal(drawing.includes("<circle"), id !== "message-2");
		}
		if (id.startsWith("participant-")) {
			assert.match(drawing, /<circle/); assert.match(drawing, /seq-title/);
		}
	}
	const rejected = render(`${annotated}a --> missing: Rejected\n${plays}`);
	assert.equal(rejected.diagnostics.length, 1);
	assert.equal(rejected.diagnostics[0].line, annotated.split("\n").length);
	assert.deepEqual(rejected.timelines, timelines);
	assert.match(rejected.svg, /<g data-line="30">\n<text[^>]*seq-rejected/);
	assert.equal([...rejected.svg.matchAll(/data-ab-part="/g)].length, parts.length);
	const interruptedSource = render(annotated.replace("alt Outer", "a --> missing: Rejected between accepted labels\nalt Outer") + plays);
	assert.deepEqual(interruptedSource.timelines, timelines, "rejected source does not become an accepted row or break label adjacency");
	assert.equal(interruptedSource.diagnostics[0].line, 7);
});

test("nested loop and alt labels attach together across invisible ends and multiple notes attach backward", () => {
	const result = render(`sequence v0
participant a
loop Retry
alt Check
a --> a: First
end
note over a: One
end
# Not a row
note over a: Two
play
 step 1
`);
	assert.deepEqual(result.diagnostics, []);
	assert.deepEqual(result.timelines[0].steps[0].parts, ["message-0", "participant-0", "annotation-0", "annotation-1", "annotation-2", "annotation-3"]);
});

test("sequence play metadata remains inert and every timeline part belongs to a drawn wrapper", () => {
	const result = render(`${annotated}play "<script>bad</script>"\n step 1 actor="<img onerror=bad>" "https://bad.example"\nplay "broken\n step 3\n`);
	assert.equal(result.diagnostics.length, 1);
	assert.equal(result.timelines[0].name, "<script>bad</script>");
	assert.equal(result.timelines[0].steps[0].actor, "<img onerror=bad>");
	assert.doesNotMatch(result.svg, /<script|onerror|https:\/\/bad/);
	const parts = new Set([...result.svg.matchAll(/data-ab-part="([^"]+)"/g)].map(m => m[1]));
	assert.ok(result.timelines.every(t => t.steps.every(s => s.parts.every(p => parts.has(p)))));
});

test("playback styles keep native tones and completed dash patterns, and scope effects to the figure", () => {
	const tones = ["ink", "muted", "neutral", "agent", "system", "done", "rework", "stop"];
	const diagram = `sequence v0\n${tones.map(t => `participant ${t} tone=${t}`).join("\n")}\n${tones.map(t => `${t} --> ${t}: Request\n${t} -.-> ${t}: Response`).join("\n")}\n`;
	for (const scheme of schemes) for (const idPrefix of ["first", "second", "1:<unsafe>."]) {
		const plain = render(diagram, { scheme, idPrefix }).svg;
		const { svg } = render(`${diagram}play\n step 1\n`, { scheme, idPrefix });
		const id = svg.match(/data-ab-play="([^"]+)"/)?.[1];
		const root = `.ab[data-ab-play="${id}"]`;
		const css = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
		const effects = css.split("\n").at(-1) ?? "";
		assert.equal(svg, render(`${diagram}play\n step 1\n`, { scheme, idPrefix }).svg);
		assert.ok(css.includes(`${root}.ab-in-progress [data-ab-part]:not(.ab-current):not(.ab-played):not(:has(.gap)){opacity:.3}`));
		assert.ok(effects.includes(`${root} [data-ab-part]{color:var(--play)}`));
		for (const tone of tones.slice(2)) assert.ok(effects.includes(`${root} [data-ab-part]:has(circle.t-${tone}){color:var(--${tone})}`));
		assert.doesNotMatch(effects, /color:var\(--(?:ink|muted)\)|\.e-system\{color|infinite/);
		const filters = [...effects.matchAll(/([^{}]+)\{([^{}]*filter:[^{}]*)\}/g)];
		assert.equal(filters.length, 2);
		assert.equal(filters[0][1], `${root} [data-ab-part].ab-current .e`);
		assert.match(filters[0][2], /stroke-width:2\.2/);
		assert.ok(filters[1][1].includes('[data-ab-part^="participant-"].ab-current circle'));
		assert.match(filters[1][2], /transform:scale\(1\.7\)/);
		for (const [, , body] of filters) assert.match(body, /drop-shadow\(0 0 var\(--ab-play-glow,6px\) color-mix\(in srgb,currentColor 55%,transparent\)\)/);
		assert.ok(effects.includes(`${root} [data-ab-part].ab-current .seq-number{fill:var(--play);font-weight:600}`));
		const rules = effects.replace(/@keyframes [^{]+\{(?:[^{}]*\{[^{}]*\})+\}/g, "");
		for (const [, selector, body] of rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
			for (const item of selector.split(/,(?=\.ab\[)/)) assert.ok(item.startsWith(root), item);
			if (/transition:/.test(body)) {
				assert.ok(selector.includes(".ab-playing"));
				assert.match(body, /^transition:(?:opacity \.35s ease|transform \.3s ease|none)$/);
			}
		}
		assert.match(effects, /@media \(prefers-reduced-motion:reduce\).*transition:none/);
		const shapes = (value: string) => value.match(/<(?:path|rect|circle|line|text)\b[^>]*>/g)?.filter(shape => !/seq-(?:packet|time-band)/.test(shape));
		assert.deepEqual(shapes(svg), shapes(plain));
		assert.doesNotMatch(plain, /data-ab-part|data-ab-play|--ab-play/);
		assert.match(css, /\.ab \.dash\{stroke-dasharray:6 5\}/);
		assert.match(svg, /class="e e-muted dash seq-response"/);
		assert.match(svg, /--play:var\(--ab-play,#(?:0a7a60|6ff0cf)\)/);
		assert.doesNotMatch(svg.match(/<svg[^>]+>/)?.[0] ?? "", /ab-current|ab-playing|ab-in-progress/);
	}
});

for (const scheme of schemes) for (const mode of ["headless", "mounted", "controls"] as const) {
	test(`${scheme ?? "auto"}, ${mode}: existing player and controls update every sequence part through playback and navigation`, t => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const result = render(annotated + plays, { scheme });
		const doc = new Doc();
		const container = new El("main", doc), svg = new El("svg", doc);
		svg.className = `ab ab-${scheme ?? "auto"}`;
		for (const [, part] of result.svg.matchAll(/data-ab-part="([^"]+)"/g)) {
			const wrapper = new El("g", doc);
			wrapper.setAttribute("data-ab-part", part); svg.append(wrapper);
		}
		container.append(svg);
		const mount = mode === "headless" ? undefined : mountPlayback(container as unknown as HTMLElement, svg as unknown as SVGSVGElement, result.timelines);
		const player = mount?.player ?? createPlayer(svg as unknown as SVGSVGElement, result.timelines);
		t.after(() => mount ? mount.destroy() : player.destroy());
		function frame(step: number, scenario = 0) {
			assert.equal(player.state.step, step); assert.equal(player.state.scenario, scenario);
			assert.equal(svg.classList.contains("ab-in-progress"), step >= 0);
			assert.equal(svg.classList.contains("ab-playing"), player.state.status === "playing");
			const steps = result.timelines[scenario].steps;
			const current = new Set(steps[step]?.parts);
			const played = new Set(steps.slice(0, Math.max(0, step)).flatMap(s => s.parts));
			for (const el of svg.children) {
				const part = el.getAttribute("data-ab-part") ?? "";
				assert.equal(el.classList.contains("ab-current"), current.has(part), part);
				assert.equal(el.classList.contains("ab-played"), !current.has(part) && played.has(part), part);
			}
		}
		function click(name: string) {
			const button = container.all().find(el => el.tag === "button" && (el.getAttribute("aria-label") ?? el.textContent) === name);
			assert.ok(button, name); button.click();
		}
		frame(-1);
		if (mode === "controls") click("Play"); else player.play();
		frame(0);
		if (mode === "controls") {
			assert.ok(container.all().some(el => el.textContent === "Sender → Receiver"));
			assert.ok(container.all().some(el => el.textContent === "Begin"));
		}
		t.mock.timers.tick(100); frame(1);
		if (mode === "controls") click("Pause"); else player.pause();
		frame(1); assert.equal(player.state.status, "paused");
		t.mock.timers.tick(1000); frame(1);
		if (mode === "controls") click("Next"); else player.next();
		frame(2);
		if (mode === "controls") click("Previous"); else player.previous();
		frame(1);
		player.seek(2); player.play(); t.mock.timers.tick(99); frame(2);
		t.mock.timers.tick(1); frame(2);
		assert.equal(player.state.status, "ended");
		if (mode === "controls") click("Replay"); else player.play();
		frame(0);
		player.select(1); frame(0, 1); assert.equal(player.state.status, "paused");
		player.select(2); frame(-1, 2); player.play(); frame(-1, 2);
		player.select(0); player.seek(-1); frame(-1);
		player.play(); doc.motion.set(true); frame(-1);
		player.next(); frame(0); assert.equal(player.state.status, "paused");
		doc.motion.set(false); t.mock.timers.tick(1000); frame(0);
		player.destroy(); frame(-1);
		assert.ok(svg.children.every(el => !el.className));
	});
}

test("claim-play appends the prototype scenarios without changing the reference figure", () => {
	assert.equal(claimPlay.slice(0, claim.length), claim);
	const result = render(claimPlay);
	assert.deepEqual(result.diagnostics, []);
	assert.deepEqual(result.timelines.map(t => [t.name, t.steps.map(s => s.target)]), [
		["Claim the show", Array.from({ length: 13 }, (_, i) => String(i + 1))], ["Wrong code", ["9", "10", "11", "14", "15"]],
	]);
	// Captions from the maintainer-approved prototype at 48fd773.
	assert.deepEqual(result.timelines[0].steps.map(s => s.caption), [
		"Open the studio with no show yet", "Offer the three ways to add a show", "Choose the existing show",
		"Ask the backend to start a claim", "Read the feed as it is now", "The feed names the owner's email",
		"Mail a 6-digit code to that address", "The owner reads the code", "Type the code into the studio",
		"Send it on for checking", "Compare code and expiry", "The code matches", "The show now belongs to the creator",
	]);
	assert.deepEqual(result.timelines[1].steps.map(s => s.caption), ["Type a code that no longer works", "Send it on for checking", "Compare code and expiry", "Reject it and count the attempt", "Offer another try or a new code"]);
});

test("the primer's complete sequence playback example renders with skipped branches", () => {
	const example = read("../docs/PRIMER.md").split("### Sequence playback")[1].match(/```text\n([\s\S]*?)\n```/)?.[1];
	assert.ok(example);
	const result = render(example);
	assert.deepEqual(result.diagnostics, []);
	assert.deepEqual(result.timelines.map(t => t.steps.map(s => s.target)), [["1", "2", "3"], ["1", "2", "4"]]);
});
