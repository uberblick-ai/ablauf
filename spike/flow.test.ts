import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { CHAR } from "./flow/grid.ts";
import { DARK, LIGHT, render } from "./flow/index.ts";

const example = (name: string) =>
	readFileSync(join(import.meta.dirname, "examples", `${name}.flow`), "utf8");

test("the loop renders with no diagnostics", () => {
	assert.deepEqual(render(example("loop")).diagnostics, []);
});

test("the same source gives the same bytes", () => {
	assert.equal(render(example("loop")).svg, render(example("loop")).svg);
});

test("the rendered loop matches the checked-in figure", () => {
	assert.equal(
		render(example("loop"), { idPrefix: "loop" }).svg,
		readFileSync(join(import.meta.dirname, "out", "loop.svg"), "utf8"),
	);
});

test("swapped slots are reported as a crossing on the right line", () => {
	const swapped = example("loop")
		.replace("to=bottom.2 : on-conflict", "to=bottom.1 : on-conflict")
		.replace(
			"to=bottom.1 : changes-requested",
			"to=bottom.2 : changes-requested",
		);
	const lines = swapped.split("\n");
	const integratorLine =
		lines.findIndex((l) => l.startsWith("integrator --> needs-changes")) + 1;
	const { diagnostics } = render(swapped);
	assert.deepEqual(
		diagnostics.map((d) => [d.line, d.message]),
		[
			[
				integratorLine,
				"edge integrator → needs-changes crosses ready-to-merge → needs-changes",
			],
		],
	);
});

test("an edge through a node is reported", () => {
	const { diagnostics } = render("flow v0\nbox a\nbox b\nbox c\na --> c\n");
	assert.ok(diagnostics.some((d) => d.message === "edge a → c runs through b"));
});

test("broken input never throws", () => {
	for (const source of [
		"",
		"nonsense",
		"flow v9\nbox a\na --> missing",
		"flow v0\n  pill orphan",
		"flow v0\nbox a row=a span=0",
	]) {
		const { svg } = render(source);
		assert.match(svg, /^<svg /);
	}
	const { diagnostics } = render("flow v0\nbox a\na --> missing\n");
	assert.deepEqual(
		diagnostics.map((d) => d.message),
		["unknown node `missing`; edge dropped"],
	);
});

test("every row a spanning panel covers meets it with a straight edge", () => {
	const source = [
		"flow v0",
		"columns main stop",
		"box a col=main",
		"box b",
		"box c",
		"box d",
		"panel p col=stop row=a span=4",
		'  strong "A person decides"',
		"a --> b",
		"b --> c",
		"c --> d",
		"a --> p : blocked",
		"b --> p : blocked",
		"c --> p : blocked",
		"d --> p : blocked, maintainer merge",
		"",
	].join("\n");
	const { diagnostics, layout } = render(source);
	assert.deepEqual(diagnostics, []);
	for (const r of layout.routes.filter((r) => r.edge.to === "p")) {
		assert.equal(r.points.length, 2, `${r.edge.from} → p should be straight`);
	}
});

test("automatic and pinned palettes keep every host override", () => {
	const automatic = render(example("loop")).svg;
	assert.match(automatic, /@media \(prefers-color-scheme:dark\)/);
	for (const scheme of ["light", "dark"] as const) {
		const colors = scheme === "light" ? LIGHT : DARK;
		const pinned = render(example("loop"), { scheme }).svg;
		assert.ok(!pinned.includes("prefers-color-scheme"));
		for (const [name, value] of Object.entries(colors)) {
			const declaration = `--${name}:var(--ab-${name},${value});`;
			assert.ok(automatic.includes(declaration), declaration);
			assert.ok(pinned.includes(declaration), declaration);
		}
	}
});

test("the documented host CSS supplies both complete palettes", () => {
	const doc = readFileSync(
		join(import.meta.dirname, "../docs/theming.md"),
		"utf8",
	);
	const css = doc.match(/```css\n([\s\S]*?)\n```/)?.[1];
	assert.ok(css, "a copyable host CSS example");
	const palettes = Object.fromEntries(
		[...css.matchAll(/:root\[data-theme="(light|dark)"\]\s*\{([^}]+)\}/g)]
			.map(([, scheme, body]) => [
				scheme,
				Object.fromEntries(
					[...body.matchAll(/--ab-([\w-]+):\s*(#[\da-f]+);/g)]
						.map(([, name, value]) => [name, value]),
				),
			]),
	);
	assert.deepEqual(palettes, { light: LIGHT, dark: DARK });
});

test("neutral works on every node kind, edges and matching legend samples", () => {
	const source = example("neutral");
	const { svg, diagnostics, layout } = render(source, { idPrefix: "neutral" });
	assert.deepEqual(diagnostics, []);
	assert.equal(svg, render(source, { idPrefix: "neutral" }).svg);
	assert.deepEqual(
		layout.nodes.filter((p) => p.node.tone === "neutral").map((p) => p.node.kind),
		["text", "box", "panel", "pill", "end"],
	);
	assert.ok(layout.routes.every((r) => r.tone === "neutral"));
	assert.equal(layout.legend?.keys.length, 6);
	assert.ok(layout.legend.keys.every((k) => k.item.tone === "neutral"));
	assert.ok(svg.includes(".ab .t-neutral{fill:var(--neutral)}"));
	assert.ok(svg.includes(".ab .e-neutral{stroke:var(--neutral)}"));
	assert.ok(svg.includes(".ab .k-neutral{fill:var(--neutral-bg);stroke:var(--neutral);stroke-width:1.5}"));
	// Each count covers both the diagram and its legend samples.
	assert.equal([...svg.matchAll(/<rect [^>]*class="k-neutral"/g)].length, 4);
	assert.equal([...svg.matchAll(/<rect [^>]*class="k-neutral panel"/g)].length, 2);
	assert.equal([...svg.matchAll(/<circle [^>]*class="t-neutral"/g)].length, 3);
	assert.equal([...svg.matchAll(/class="e e-neutral(?: dash)?" marker-end="url\(#neutral-neutral\)"/g)].length, 4);
	assert.match(svg, /<marker id="neutral-neutral"[^>]*><path [^>]*class="t-neutral"\/><\/marker>/);
	assert.ok(svg.includes('class="m s13 b t-neutral">neutral</text>'));
});

test("neutral palettes support host overrides and readable light and dark fills", () => {
	const luminance = (hex: string) => {
		const channels = [1, 3, 5].map((i) => {
			const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
			return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
		});
		return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
	};
	const contrast = (a: string, b: string) => {
		const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
		return (hi + 0.05) / (lo + 0.05);
	};
	const source = example("neutral");
	const automatic = render(source).svg;
	for (const [scheme, palette] of [["light", LIGHT], ["dark", DARK]] as const) {
		const { svg, diagnostics } = render(source, { scheme });
		assert.deepEqual(diagnostics, []);
		assert.ok(!svg.includes("prefers-color-scheme"));
		for (const key of ["neutral", "neutral-bg"] as const) {
			const variable = `--${key}:var(--ab-${key},${palette[key]});`;
			assert.ok(svg.includes(variable));
			assert.ok(automatic.includes(variable));
		}
		for (const foreground of ["ink", "muted", "neutral"] as const)
			assert.ok(contrast(palette[foreground], palette["neutral-bg"]) >= 4.5, `${scheme}: ${foreground} text on neutral fill`);
		for (const background of ["surface", "band"] as const)
			assert.ok(contrast(palette["neutral-bg"], palette[background]) >= 1.1, `${scheme}: neutral fill differs from ${background}`);
	}
});

test("existing defaults and surface-filled ink and muted shapes keep their styles", () => {
	const { svg, diagnostics, layout } = render(`flow v0
text caption
pill label
box step
end done
panel note
box ink tone=ink
box muted tone=muted
panel ink-panel tone=ink
panel muted-panel tone=muted
`);
	assert.deepEqual(diagnostics, []);
	assert.deepEqual(layout.nodes.map((p) => p.node.tone), ["muted", "muted", "agent", "done", "stop", "ink", "muted", "ink", "muted"]);
	for (const tone of ["ink", "muted"]) {
		assert.ok(svg.includes(`.ab .k-${tone}{fill:var(--surface);stroke:var(--line);stroke-width:1.5}`));
		assert.ok(svg.includes(`.ab .t-${tone}{fill:var(--muted)}.ab .e-${tone}{stroke:var(--muted)}`));
		assert.match(svg, new RegExp(`<rect [^>]*class="k-${tone}"`));
		assert.match(svg, new RegExp(`<rect [^>]*class="k-${tone} panel"`));
	}
});

test("row= chains reach the row's first node, and loops are reported", () => {
	const chain = render(
		"flow v0\ncolumns a b c d\nbox one col=a\nbox two col=b row=one\nbox three col=c row=two\nbox four col=d row=three\n",
	);
	assert.deepEqual(chain.diagnostics, []);
	assert.equal(new Set(chain.layout.nodes.map((p) => p.y)).size, 1);
	assert.ok(!chain.svg.includes("NaN"));
	const loop = render(
		"flow v0\ncolumns a b\nbox one col=a row=two\nbox two col=b row=one\n",
	);
	assert.ok(loop.diagnostics.some((d) => d.line === 3 && /row=two/.test(d.message)));
	assert.ok(!loop.svg.includes("NaN"));
});

test("safe and default prefixes retain the complete SVG bytes", () => {
	const source = example("loop");
	const figure = readFileSync(join(import.meta.dirname, "out", "loop.svg"), "utf8");
	const expected = (prefix: string) =>
		figure
			.replaceAll('<marker id="loop-', `<marker id="${prefix}-`)
			.replaceAll('marker-end="url(#loop-', `marker-end="url(#${prefix}-`);
	for (const idPrefix of [
		"",
		"ab",
		"doc-1",
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-",
	]) {
		assert.equal(render(source, { idPrefix }).svg, expected(idPrefix));
	}
	assert.equal(render(source).svg, expected("ab"));
	assert.equal(render(source, { idPrefix: undefined }).svg, expected("ab"));
});

test("marker prefix encoding is reversible, including Unicode and escape syntax", () => {
	const source = "flow v0\nbox a\nbox b\na --> b\n";
	const cases = [
		["doc.1", "doc.002e1"],
		["doc:1", "doc.003a1"],
		["doc-1", "doc-1"],
		["doc.002e1", "doc.002e002e1"],
		["doc-002e1", "doc-002e1"],
		[".003a", ".002e003a"],
		["é", ".00e9"],
		["e\u0301", "e.0301"],
		["图😀", ".56fe.d83d.de00"],
		["\ud800", ".d800"],
		["\udc00", ".dc00"],
		["\ufffd", ".fffd"],
		["\u0000\t\n", ".0000.0009.000a"],
	];
	const ids = new Set<string>();
	for (const [idPrefix, encoded] of cases) {
		const { svg } = render(source, { idPrefix });
		const id = /<marker id="([^"]+)"/.exec(svg)?.[1];
		assert.equal(id, `${encoded}-ink`);
		assert.ok(!ids.has(id));
		ids.add(id);
		assert.equal(
			encoded.replace(/\.([0-9a-f]{4})/g, (_, hex) =>
				String.fromCharCode(Number.parseInt(hex, 16)),
			),
			idPrefix,
		);
		assert.equal(svg, render(source, { idPrefix }).svg);
	}
});

test("route and legend references resolve within their own diagram on a page", () => {
	const source = [
		"flow v0",
		"box a",
		"box b",
		"a --> b",
		"legend",
		'  edge tone=ink "route"',
		'  edge tone=agent "legend only"',
		'  dashed tone=stop "dashed legend only"',
		"",
	].join("\n");
	const diagrams = [
		"doc.1",
		"doc:1",
		"doc-1",
		"doc.002e1",
		"图😀",
		"",
		'"><script> & url(#other)\\',
	].map((idPrefix) => {
		const { svg, diagnostics } = render(source, { idPrefix });
		assert.deepEqual(diagnostics, []);
		assert.ok(!svg.includes("<script>"));
		return svg;
	});
	const page = diagrams.join("\n");
	const ids = [...page.matchAll(/<marker id="([^"]+)"/g)].map((m) => m[1]);
	assert.equal(ids.length, diagrams.length * 3);
	assert.equal(new Set(ids).size, ids.length);
	for (const svg of diagrams) {
		const ownIds = [...svg.matchAll(/<marker id="([^"]+)"/g)].map((m) => m[1]);
		for (const id of ownIds) assert.match(id, /^[A-Za-z0-9_.-]+$/);
		const references = [...svg.matchAll(/marker-end="url\(#([^)]*)\)"/g)];
		assert.equal(references.length, 4);
		for (const [, id] of references) assert.ok(ownIds.includes(id));
		assert.deepEqual(new Set(references.map((m) => m[1])), new Set(ownIds));
	}
});

test("loops and labels stay inside the canvas", () => {
	const { layout } = render(
		"flow v0\ncolumns a\nbox one col=a\nbox two\nbox three\none --> three from=left to=left : a long label that reaches far\nthree --> one from=right to=right label=end : and back round the right side\n",
	);
	const xs = layout.routes.flatMap((r) => r.points.map((p) => p[0]));
	assert.ok(Math.min(...xs) >= 0);
	assert.ok(Math.max(...xs) <= layout.width);
	for (const r of layout.routes) {
		const l = r.label;
		assert.ok(l);
		const left = l.anchor === "start" ? l.x : l.x - l.w;
		assert.ok(left >= 0 && left + l.w <= layout.width, l.text);
	}
});

test("a legend draws under the diagram and names its keys", () => {
	const { svg, diagnostics, layout } = render(example("deploy"));
	assert.deepEqual(diagnostics, []);
	assert.equal(layout.legend?.keys.length, 4);
	const bottom = Math.max(...layout.nodes.map((p) => p.y + p.h));
	assert.ok(layout.legend.keys.every((k) => k.y > bottom));
	assert.match(svg, /Legend: event or state, automated job/);
	assert.ok(
		render("flow v0\nbox a col=main\nlegend\n  shape \"x\"\n").diagnostics.some(
			(d) => d.line === 4,
		),
	);
});

test("an edge that runs back through its own node is reported", () => {
	const { diagnostics } = render(
		"flow v0\ncolumns a\nbox one col=a\nbox two\none --> two from=top to=bottom\n",
	);
	assert.ok(diagnostics.some((d) => d.line === 5 && /through one/.test(d.message)));
});

test("an empty section is reported and takes no band", () => {
	const { diagnostics, layout, svg } = render(
		'flow v0\ncolumns a\nsection "Empty"\nsection "Actual"\nbox one col=a\nsection "Later"\nbox two\n',
	);
	assert.ok(diagnostics.some((d) => d.line === 3));
	assert.deepEqual(
		layout.bands.map((b) => b.label),
		["Actual", "Later"],
	);
	const later = layout.bands[1];
	const two = layout.nodes.find((p) => p.node.id === "two");
	assert.ok(two && two.y > later.y && later.y + later.h <= layout.height);
	assert.ok(!svg.includes("NaN"));
});

test("a section-only flow reports its empty section and draws no caption or band", () => {
	const { diagnostics, layout, svg } = render('flow v0\nsection "Empty"\n');
	assert.deepEqual(diagnostics, [
		{
			line: 2,
			severity: "warning",
			message: 'section "Empty" has no nodes and is not drawn',
		},
	]);
	assert.deepEqual(layout.bands, []);
	assert.doesNotMatch(svg, /class="(?:cap|band)"/);
});

test("a trailing empty section is reported and draws no caption or band", () => {
	const populated = 'flow v0\nsection "Actual"\nbox one\n';
	const { diagnostics, layout, svg } = render(`${populated}section "Empty"\n`);
	assert.ok(
		diagnostics.some(
			(d) =>
				d.line === 4 &&
				d.message === 'section "Empty" has no nodes and is not drawn',
		),
	);
	assert.deepEqual(layout.bands, render(populated).layout.bands);
	assert.equal([...svg.matchAll(/class="cap"/g)].length, 1);
	assert.doesNotMatch(svg, /class="cap">EMPTY<|class="band"/);
});

test("section captions fit the canvas after uppercase expansion and letter spacing", () => {
	const caption = "ß".repeat(30);
	const { layout, svg } = render(
		`flow v0\nsection "Start"\ntext one\nsection "${caption}"\ntext two\n`,
	);
	const captions = [
		...svg.matchAll(/<text x="(\d+)" y="(\d+)" class="cap">([^<]*)<\/text>/g),
	];
	assert.deepEqual(captions.map((c) => c[3]), ["START", "SS".repeat(30)]);
	assert.ok(layout.width > Math.max(...layout.nodes.map((p) => p.x + p.w)) + 16);
	for (const [, x, y, text] of captions) {
		const width = [...text].length * (CHAR.mono11 + 0.08 * 11);
		assert.ok(Number(x) >= 0 && Number(x) + width <= layout.width, text);
		assert.ok(Number(y) - 9 >= 0 && Number(y) + 3 <= layout.height, text);
	}
});

test("title= names text and end nodes too", () => {
	const { layout, diagnostics } = render(
		'flow v0\ncolumns a\nend done col=a title="All done"\ntext note title=Hello "and more"\n',
	);
	assert.equal(layout.nodes[0].node.label, "All done");
	assert.equal(layout.nodes[1].node.label, "Hello");
	assert.ok(diagnostics.some((d) => d.line === 4));
});

test("a span past the last row is reported once", () => {
	const { diagnostics } = render("flow v0\ncolumns a b\nbox one col=a\nbox two col=b row=one span=3\n");
	assert.equal(diagnostics.filter((d) => /span=3/.test(d.message)).length, 1);
});

test("box subtitles wrap and grow their row while edges follow the box", () => {
	const { layout, svg, diagnostics } = render(
		[
			"flow v0",
			"columns main side",
			'box issue-preparer col=main "grounds it in the code, challenges assumptions, aims for an MVP"',
			"box next",
			"pill peer col=side row=issue-preparer",
			"issue-preparer --> next",
			"issue-preparer --> peer",
		].join("\n"),
	);
	assert.deepEqual(diagnostics, []);
	const [box, next, peer] = layout.nodes;
	assert.equal(box.w, 235); // 34 subtitle characters at 6.1px, plus 28px padding.
	assert.equal(next.w, box.w);
	assert.equal(box.h, 61);
	assert.equal(next.y, box.y + box.h + 30);
	assert.equal(peer.y, Math.round(box.y + (box.h - peer.h) / 2));
	const cx = Math.round(box.x + box.w / 2);
	assert.deepEqual(layout.routes[0].points, [
		[cx, box.y + box.h],
		[cx, next.y],
	]);
	assert.deepEqual(layout.routes[1].points, [
		[box.x + box.w, Math.round(box.y + box.h / 2)],
		[peer.x, Math.round(peer.y + peer.h / 2)],
	]);
	assert.deepEqual(
		[
			...svg.matchAll(
				/<text x="(\d+)" y="(\d+)" text-anchor="middle" class="s11 muted">(.*?)<\/text>/g,
			),
		].map((m) => [Number(m[1]), Number(m[2]), m[3]]),
		[
			[cx, box.y + 36, "grounds it in the code, challenges"],
			[cx, box.y + 51, "assumptions, aims for an MVP"],
		],
	);
});

test("box wrapping keeps long words intact and matches panel text", () => {
	const word = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN";
	const { layout, svg, diagnostics } = render(
		[
			"flow v0",
			"columns main side",
			`box worker col=main "before ${word} after <&>"`,
			"panel note col=side row=worker span=2",
			`  muted "before ${word} after <&>"`,
			"box next col=main",
		].join("\n"),
	);
	assert.deepEqual(diagnostics, []);
	const [box, panel, next] = layout.nodes;
	assert.equal(box.w, 272); // The intact 40-character word sets the width.
	assert.equal(box.h, 76);
	assert.equal(panel.h, box.h + 30 + next.h);
	assert.deepEqual(
		[...svg.matchAll(/class="s11 muted">(.*?)<\/text>/g)].map((m) => m[1]),
		["before", word, "after &lt;&amp;&gt;", "before", word, "after &lt;&amp;&gt;"],
	);
	for (let i = 0; i < 3; i++) {
		assert.ok(svg.includes(
			`y="${box.y + 36 + i * 15}" text-anchor="middle" class="s11 muted">`,
		));
	}
});

test("short and absent subtitles keep box geometry and titles stay unwrapped", () => {
	for (const subtitle of ["", ' "short subtitle"']) {
		const { layout, svg, diagnostics } = render(
			`flow v0\nbox worker col=main${subtitle}\n`,
		);
		assert.deepEqual(diagnostics, []);
		assert.deepEqual(
			layout.nodes.map(({ x, y, w, h }) => [x, y, w, h]),
			[[16, 16, 180, 46]],
		);
		assert.ok(svg.includes(
			'<text x="106" y="35" text-anchor="middle" class="m s13 b t-agent">worker</text>',
		));
		assert.equal(
			svg.includes('<text x="106" y="52" text-anchor="middle" class="s11 muted">short subtitle</text>'),
			Boolean(subtitle),
		);
	}
	const title = "a long title that continues on a single line";
	const { layout, svg } = render(
		`flow v0\nbox worker col=main title="${title}" "short subtitle"\n`,
	);
	assert.equal(layout.nodes[0].w, Math.round(title.length * 7.8 + 32));
	assert.equal(layout.nodes[0].h, 46);
	assert.ok(svg.includes(`>${title}</text>`));
});

test("playground saves serialize requests and track only confirmed text", async (t) => {
	// The page only needs these DOM operations with a valid flow and no grid.
	class Element extends EventTarget {
		value = "";
		checked = false;
		disabled = false;
		textContent = "";
		className = "";
		innerHTML = "";
		hidden = false;
		style = { setProperty() {} };
		querySelector() { return null; }
		replaceChildren() {}
		click() { if (!this.disabled) this.dispatchEvent(new Event("click")); }
	}
	const elements = new Map<string, Element>();
	const element = (id: string) => {
		let el = elements.get(id);
		if (!el) {
			el = new Element();
			elements.set(id, el);
		}
		return el;
	};
	const page = new EventTarget();
	const location = { hash: "#examples/loop" };
	const globals = {
		document: {
			getElementById: element,
			querySelectorAll: () => [],
			documentElement: { dataset: {} },
		},
		window: page,
		location,
		confirm: () => true,
	};
	for (const [key, value] of Object.entries(globals)) {
		const original = Object.getOwnPropertyDescriptor(globalThis, key);
		Object.defineProperty(globalThis, key, { configurable: true, value });
		t.after(() => {
			if (original) Object.defineProperty(globalThis, key, original);
			else Reflect.deleteProperty(globalThis, key);
		});
	}
	const source = (label: string) => `flow v0\nbox a "${label}"\n`;
	const requests: { url: string; body: string; resolve: (response: Response) => void; reject: (error: Error) => void }[] = [];
	let inFlight = 0;
	let maxInFlight = 0;
	t.mock.method(globalThis, "fetch", async (url: string, options?: RequestInit) => {
		if (url === "/api/catalog") return Response.json([]);
		if (options?.method !== "PUT") return new Response(source("initial"));
		maxInFlight = Math.max(maxInFlight, ++inFlight);
		try {
			return await new Promise<Response>((resolve, reject) => {
				requests.push({ url, body: String(options.body), resolve, reject });
			});
		} finally {
			inFlight--;
		}
	});
	await import("./playground/app.ts");
	const editor = element("pg-editor");
	const save = element("pg-save");
	const edit = (label: string) => {
		editor.value = source(label);
		editor.dispatchEvent(new Event("input"));
	};
	const shortcut = (modifier: "ctrlKey" | "metaKey") => {
		const event = Object.assign(new Event("keydown", { cancelable: true }), { key: "s", [modifier]: true });
		editor.dispatchEvent(event);
		assert.equal(event.defaultPrevented, true);
	};
	const unsaved = () => {
		const event = new Event("beforeunload", { cancelable: true });
		page.dispatchEvent(event);
		return event.defaultPrevented;
	};
	const respond = async (index: number, status = 200) => {
		requests[index].resolve(new Response(status === 200 ? "saved" : "write failed", { status }));
		await setImmediate();
	};
	assert.equal(save.disabled, true);
	edit("first");
	save.click();
	assert.equal(requests[0].url, "/api/flow/examples/loop");
	assert.equal(requests[0].body, source("first"));
	assert.equal(save.disabled, false);
	edit("queued");
	shortcut("ctrlKey");
	save.click();
	shortcut("metaKey");
	assert.equal(requests.length, 1);
	// Save stays available even when edits temporarily match the old baseline.
	edit("initial");
	assert.equal(save.disabled, false);
	save.click();
	edit("latest before follow-up");
	await respond(0);
	assert.equal(requests.length, 2);
	assert.equal(requests[1].body, source("latest before follow-up"));
	assert.equal(save.disabled, false);
	assert.equal(unsaved(), true);
	edit("first");
	assert.equal(save.disabled, false);
	assert.equal(unsaved(), false);
	edit("later edit");
	await respond(1);
	assert.equal(requests.length, 2);
	assert.equal(save.disabled, false);
	assert.equal(unsaved(), true);
	edit("latest before follow-up");
	assert.equal(save.disabled, true);
	assert.equal(unsaved(), false);

	// Neither a failed request nor its failed follow-up advances the baseline.
	edit("failed first");
	save.click();
	edit("failed follow-up");
	save.click();
	await respond(2, 500);
	assert.equal(requests[3].body, source("failed follow-up"));
	assert.equal(unsaved(), true);
	edit("latest before follow-up");
	assert.equal(save.disabled, false);
	assert.equal(unsaved(), false);
	await respond(3, 500);
	assert.equal(save.disabled, true);
	assert.equal(element("pg-status").textContent, "Not saved: write failed");

	edit("network failure");
	save.click();
	requests[4].reject(new Error("offline"));
	await setImmediate();
	assert.equal(save.disabled, false);
	assert.equal(unsaved(), true);
	assert.equal(element("pg-status").textContent, "Not saved: offline");
	save.click();
	await respond(5);
	assert.equal(save.disabled, true);
	assert.equal(unsaved(), false);

	// Discarding a flow also discards its queued save and ignores its response.
	edit("discarded");
	save.click();
	save.click();
	location.hash = "#examples/deploy";
	page.dispatchEvent(new Event("hashchange"));
	await setImmediate();
	await respond(6);
	assert.equal(requests.length, 7);
	assert.equal(editor.value, source("initial"));
	assert.equal(save.disabled, true);
	assert.equal(unsaved(), false);
	assert.equal(maxInFlight, 1);
	assert.equal(inFlight, 0);
});
