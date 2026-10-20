import assert from "node:assert/strict";
import { test } from "node:test";
import { render } from "./flow/index.ts";

test("adjacent vertical labels clear straight, L and Z segment ends in either direction", () => {
	for (const shape of ["straight", "L", "Z"]) {
		for (const reverse of [false, true]) {
			for (const atEnd of [false, true]) {
				for (const tall of [false, true]) {
					const fromSide = reverse ? "top" : "bottom";
					const toSide = reverse ? "bottom" : "top";
					const sides = shape === "straight" ? "" : shape === "Z"
						? `from=${fromSide} to=${toSide}`
						: atEnd ? `from=${reverse ? "left" : "right"} to=${toSide}`
							: `from=${fromSide} to=${reverse ? "right" : "left"}`;
					const source = [
						"flow v0", "columns main side peer",
						"box a col=main", `box b col=${shape === "straight" ? "main" : "side"}`,
						...(tall ? ['box peer col=peer row=a "this subtitle wraps across several lines and makes an odd height"'] : []),
						`${reverse ? "b --> a" : "a --> b"} ${sides} ${atEnd ? "label=end" : ""}`,
					].join("\n");
					const bare = render(source).layout;
					const { layout, diagnostics } = render(`${source} : label`);
					assert.deepEqual(diagnostics, [], source);
					const route = layout.routes[0];
					assert.equal(route.points.length, shape === "straight" ? 2 : shape === "L" ? 3 : 4);
					const p = route.points[atEnd ? route.points.length - 1 : 0];
					const q = route.points[atEnd ? route.points.length - 2 : 1];
					assert.ok(route.label);
					assert.equal(p[0], q[0]);
					assert.ok(route.label.y - 9 - Math.min(p[1], q[1]) >= 12, source);
					assert.ok(Math.max(p[1], q[1]) - (route.label.y + 3) >= 12, source);
					assert.deepEqual(layout.nodes.map(p => p.x), bare.nodes.map(p => p.x));
				}
			}
		}
	}
});

test("the issue example has a longer arrow with a label", () => {
	const source = 'flow v0\ncolumns main person\npanel open col=main tone=muted\n  strong "A team member writes an issue"\npill needs-preparation tone=muted\nopen --> needs-preparation';
	const bare = render(source);
	const labeled = render(`${source} : someone sets it`);
	assert.deepEqual(labeled.diagnostics, []);
	assert.equal(bare.layout.nodes[1].y - (bare.layout.nodes[0].y + bare.layout.nodes[0].h), 30);
	assert.equal(labeled.layout.nodes[1].y - (labeled.layout.nodes[0].y + labeled.layout.nodes[0].h), 38);
});

test("short L segments grow with explicit slots and either selected label end", () => {
	for (const edge of [
		"a --> b from=bottom to=left.1",
		"b --> a from=top to=right.8",
		"a --> b from=right.8 to=top label=end",
		"b --> a from=left.1 to=bottom label=end",
	]) {
		const source = `flow v0\ncolumns main side\ntext a col=main\ntext b col=side\n${edge}`;
		const { layout, diagnostics } = render(`${source} : label`);
		assert.deepEqual(diagnostics, [], edge);
		const [a, b] = layout.nodes;
		assert.ok(b.y - a.y - a.h >= 30, edge);
		if (edge.includes(".8")) assert.ok(b.y - a.y - a.h > 30, edge);
		const r = layout.routes[0];
		const atEnd = edge.includes("label=end");
		const p = r.points[atEnd ? r.points.length - 1 : 0];
		const q = r.points[atEnd ? r.points.length - 2 : 1];
		assert.ok(r.label);
		assert.ok(r.label.y - 9 - Math.min(p[1], q[1]) >= 12, edge);
		assert.ok(Math.max(p[1], q[1]) - r.label.y - 3 >= 12, edge);
	}
});

test("automatic growth uses the exterior boundary of adjacent spanning ranges", () => {
	for (const edge of ["a --> b", "b --> a label=end"]) {
		const { layout, diagnostics } = render([
			"flow v0", "columns main side", "panel a col=main span=2",
			'  strong "Spanning rows"', "box middle col=side", "box b col=main",
			`${edge} : next`,
		].join("\n"));
		assert.deepEqual(diagnostics, []);
		const [a, middle, b] = layout.nodes;
		assert.equal(middle.y - a.y, 16 + 30);
		assert.equal(a.y + a.h, middle.y + middle.h);
		assert.equal(b.y - a.y - a.h, 38);
	}
});

test("node gap requests combine by maximum with automatic and section minimums", () => {
	for (const [requests, section, expected] of [
		["", false, 38], ["gap=0", false, 38], ["gap=60", false, 60],
		["gap=40", true, 52], ["gap=70", true, 70],
	] as const) {
		const { layout, diagnostics } = render([
			"flow v0", "columns gutter main side", 'section "One"',
			`box a col=main ${requests}`, "box peer col=side row=a gap=35",
			...(section ? ['section "Two"'] : []), "box b col=main", "box other col=side row=b", "box c col=main",
			"a --> b : one", "peer --> other label=end : two",
		].join("\n"));
		assert.deepEqual(diagnostics, []);
		const [a, peer, b, , c] = layout.nodes;
		assert.equal(peer.y, a.y);
		assert.equal(b.y - a.y - a.h, expected);
		assert.equal(c.y - b.y - b.h, 30);
		if (section) assert.equal(layout.bands[1].y, a.y + a.h + expected / 2);
	}
});

test("gap applies after a span and interior growth preserves its coverage and row alignment", () => {
	const { layout, diagnostics } = render([
		"flow v0", "columns main side", "box a col=main gap=65", "box b", "box c", "box d",
		"panel p col=side row=a span=2 gap=80", '  strong "Note"',
		"box peer col=side row=c", "c --> d : next",
	].join("\n"));
	assert.deepEqual(diagnostics, []);
	const [a, b, c, d, panel, peer] = layout.nodes;
	assert.equal(b.y - a.y - a.h, 65);
	assert.equal(panel.y, a.y);
	assert.equal(panel.y + panel.h, b.y + b.h);
	assert.equal(c.y - panel.y - panel.h, 80);
	assert.equal(peer.y, c.y);
	assert.equal(d.y - c.y - c.h, 38);
});

test("gap works without labels and invalid or inapplicable values name their source lines", () => {
	for (const value of ["-1", "1.5", "60px", "wide", "Infinity", "9007199254740992", ""]) {
		const { diagnostics, layout } = render(`flow v0\nbox a gap=${value}\nbox b`);
		assert.ok(diagnostics.some(d => d.line === 2 && /gap=/.test(d.message)), value);
		assert.equal(layout.nodes[1].y - layout.nodes[0].y - layout.nodes[0].h, 30);
	}
	const { layout, diagnostics } = render("flow v0\nbox a gap=90\nbox b gap=60\na --> b gap=70");
	assert.equal(layout.nodes[1].y - layout.nodes[0].y - layout.nodes[0].h, 90);
	assert.deepEqual(diagnostics.map(d => d.line), [4, 3]);
	assert.ok(!render("flow v0\nbox a gap=\nbox b").svg.includes("NaN"));
});

test("excluded routes keep their spacing and remaining overlap diagnostics", () => {
	for (const source of [
		"flow v0\ncolumns main side\nbox a col=main\nbox b col=side\na --> b : horizontal label",
		"flow v0\ncolumns main side\nbox a col=main\nbox b col=side\na --> b from=top to=top : loop label",
		"flow v0\nbox a\nbox middle\nbox b\na --> b : skipped row",
		"flow v0\ncolumns main side\nbox a col=main\nbox b col=side row=a\na --> b from=bottom to=top : overlapping rows",
	]) {
		const labeled = render(source);
		const bare = render(source.split(" : ")[0]);
		assert.deepEqual(labeled.layout.nodes.map(p => [p.y, p.h]), bare.layout.nodes.map(p => [p.y, p.h]));
		if (source.includes("skipped row")) {
			assert.ok(labeled.diagnostics.some(d => d.line === 5 && /label .* overlaps middle/.test(d.message)));
		}
	}
});

test("empty row= values are diagnosed while nodes still render on new rows", () => {
	for (const row of ["row=", 'row=""']) {
		const { diagnostics, layout, svg } = render(`flow v0\nbox a\nbox b ${row}`);
		assert.deepEqual(
			diagnostics.map((d) => [d.line, d.message]),
			[[3, "row= must name another node; starting a new row"]],
		);
		assert.equal(layout.nodes.length, 2);
		assert.ok(layout.nodes[1].y > layout.nodes[0].y);
		assert.match(svg, /^<svg /);
	}
});
