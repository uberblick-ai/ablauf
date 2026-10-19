import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { render } from "./flow/index.ts";
import { toSvg } from "./flow/svg.ts";

const example = (name: string) =>
	readFileSync(join(import.meta.dirname, "examples", `${name}.flow`), "utf8");

// An intentionally diagnostic-bearing loop, kept out of the example set.
const crossingLoop = () => example("loop")
	.replace(/^ready-to-merge -\.-> needs-changes.*\n/m, "")
	.replace(/^integrator --> needs-changes.*\n/m, "")
	.replace("reviewer --> needs-changes tone=rework : changes-requested", "reviewer -.-> needs-changes tone=agent")
	.replace(/^needs-changes --> implementer.*$/m, "integrator --> implementer tone=rework from=left to=left label=end : revise the same PR");

test("a local knockout puts the later edge above an interior crossing", () => {
	const branch = "reviewer -.-> needs-changes tone=agent";
	const back = "integrator --> implementer tone=rework from=left to=left label=end : revise the same PR";
	const source = crossingLoop();
	const swapped = source.replace(`${branch}\n${back}`, `${back}\n${branch}`);
	assert.notEqual(swapped, source);
	for (const [text, upper, lower] of [[source, "rework", "agent"], [swapped, "agent", "rework"]]) {
		for (const scheme of ["light", "dark"] as const) {
			const { svg, layout, diagnostics } = render(text, { scheme });
			const line = text.split("\n").findIndex((l) => l.startsWith(upper === "rework" ? back : branch)) + 1;
			assert.deepEqual(diagnostics, [{
				line, severity: "warning",
				message: upper === "rework"
					? "edge integrator → implementer crosses reviewer → needs-changes"
					: "edge reviewer → needs-changes crosses integrator → implementer",
			}]);
			const gaps = [...svg.matchAll(/<path d="([^"]+)" class="knockout knockout-band"\/>/g)];
			assert.equal(gaps.length, 1);
			assert.ok(svg.indexOf(`class="e e-${lower}`) < gaps[0].index);
			assert.ok(gaps[0].index < svg.indexOf(`class="e e-${upper}`));
			assert.match(svg, /class="e e-agent dash"/);
			assert.match(svg, /stroke-width:5\.6/);
			assert.match(svg, /--bg:var\(--ab-bg,/);
			assert.match(svg, /--band:var\(--ab-band,/);
			// Markers and all text/nodes follow the last gap; no additional IDs.
			assert.ok(gaps[0].index < svg.indexOf('class="arrow"'));
			assert.ok(gaps[0].index < svg.indexOf("<text"));
			assert.ok(gaps[0].index < svg.indexOf('class="k-'));
			assert.equal([...svg.matchAll(/\bid="/g)].length, [...svg.matchAll(/<marker /g)].length);
			assert.equal(svg, render(text, { scheme }).svg);
			assert.deepEqual(layout.nodes, render(source).layout.nodes);
			for (const route of layout.routes) {
				assert.deepEqual(route.points, render(source).layout.routes.find((r) => r.edge.from === route.edge.from && r.edge.to === route.edge.to)?.points);
			}
		}
	}
});

test("knockouts cover every crossing, stop at bends and match band boundaries", () => {
	const layout = render("flow v0\nbox a\nbox b\na --> b\nb --> a\n").layout;
	layout.routes[0].points = [[50, 10], [50, 90]];
	layout.routes[1].points = [[10, 30], [90, 30], [90, 70], [10, 70]];
	let svg = toSvg(layout);
	assert.deepEqual([...svg.matchAll(/<path d="([^"]+)" class="knockout"/g)].map((m) => m[1]), ["M44,30 L56,30", "M44,70 L56,70"]);
	// A crossing close to a bend must not extend the knockout past the bend.
	layout.routes[1].points = [[49, 30], [52, 30]];
	svg = toSvg(layout);
	assert.match(svg, /d="M49,30 L52,30" class="knockout"/);
	// Vertical under-strokes split where the band fill ends.
	layout.routes.reverse();
	layout.bands = [{ label: "Band", y: 10, h: 30, shaded: true }];
	svg = toSvg(layout);
	assert.match(svg, /d="M50,24 L50,32" class="knockout knockout-band"/);
	assert.match(svg, /d="M50,32 L50,36" class="knockout"/);
});

test("shared endpoints, segment endpoints and collinear overlaps gain no knockouts", () => {
	const layout = render("flow v0\nbox a\nbox b\na --> b\nb --> a\n").layout;
	layout.routes[0].points = [[10, 30], [90, 30]];
	for (const points of [
		[[90, 30], [90, 90]],
		[[50, 30], [50, 90]],
		[[50, 30], [100, 30]],
	] as [number, number][][]) {
		layout.routes[1].points = points;
		assert.doesNotMatch(toSvg(layout), /class="knockout/);
	}
	assert.doesNotMatch(render(example("loop")).svg, /class="knockout/);
});
