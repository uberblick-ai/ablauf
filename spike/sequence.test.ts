import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { type FontsOptions, render, type RenderOptions, type TextStyle } from "./flow/index.ts";
import { TONES } from "./flow/parse.ts";

const example = (name: string) => readFileSync(join(import.meta.dirname, "examples", `${name}.flow`), "utf8");
const prelude = 'sequence v0\nparticipant A "First" tone=agent\nparticipant B "Second" tone=system\n';
const rows = (svg: string) => [...svg.matchAll(/<g data-line="(\d+)" data-step="(\d+)">([\s\S]*?)<\/g>/g)];
const texts = (svg: string) => [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"(?: text-anchor="([^"]+)")? class="([^"]+)">([^<]*)<\/text>/g)];

test("sequence dispatch, headers and indentation recover on the original source line", () => {
	const source = '# comment\n\n  sequence v0\n  participant A\n# comment\n  A-->A: Check\n';
	const result = render(source);
	assert.deepEqual(result.diagnostics, []);
	assert.equal(result.layout.width, 678);
	assert.deepEqual(result.layout.nodes, []);
	assert.deepEqual(result.layout.routes, []);
	assert.deepEqual(result.layout.bands, []);
	assert.equal(result.layout.legend, null);
	assert.equal(result.layout.diagnostics, result.diagnostics);
	assert.deepEqual(rows(result.svg).map((r) => Number(r[1])), [6]);
	for (const header of ["sequence", "sequence x", "sequence v0 extra"]) {
		const bad = render(`# comment\n\n${header}\nparticipant A\nA --> A: Still draws`);
		assert.deepEqual(bad.diagnostics.map((d) => [d.line, d.severity]), [[3, "error"]]);
		assert.match(bad.svg, />Line 3:/);
		assert.equal(rows(bad.svg).length, 1);
	}
	const future = render('sequence v12\nparticipant A\nA --> A: Future');
	assert.deepEqual(future.diagnostics.map((d) => [d.line, d.severity]), [[1, "warning"]]);
	assert.doesNotMatch(future.svg, />Line 1:/);
	for (const source of ["sequence-other v0", "participant A", "flow v0\nparticipant A"]) {
		const result = render(source);
		assert.doesNotMatch(result.svg, /seq-lane/);
	}
	const rejected = render('sequence v0\ninvalid source\nparticipant A\nA --> A: Still draws');
	assert.deepEqual(rejected.diagnostics.map((d) => d.line), [2, 2]);
	assert.equal(rows(rejected.svg).length, 1);
});

test("participants keep declaration order, flow titles and all supported tones", () => {
	const result = render(`sequence v0\n${TONES.map((tone, i) => `participant p${i} "T${i}\\path" tone=${tone}`).join("\n")}`);
	assert.deepEqual(result.diagnostics, []);
	const titles = texts(result.svg).filter((t) => t[4].includes("seq-title"));
	assert.equal(titles.length, TONES.length);
	assert.deepEqual(titles.map((t) => t[5]), TONES.map((_, i) => `T${i}\\path`));
	assert.deepEqual(titles.map((t) => t[4]), TONES.map((tone) => `m s12 b t-${tone} seq-title`));
	assert.ok(titles.every((t, i) => !i || Number(t[1]) > Number(titles[i - 1][1])));
	assert.match(result.svg, /\.ab \.t-ink\{fill:var\(--muted\)\}/);
	assert.match(result.svg, /\.ab \.t-muted\{fill:var\(--muted\)\}/);
	assert.match(render('sequence v0\nparticipant Default').svg, /class="m s12 b t-ink seq-title">Default/);
	const tokenIds = render('sequence v0\nparticipant <caller>\nparticipant service-api\n<caller>-->service-api: Safe token ids');
	assert.deepEqual(tokenIds.diagnostics, []);
	assert.match(tokenIds.svg, /&lt;caller&gt;/);
});

test("invalid participant fields, duplicates and late declarations stay visible without lanes", () => {
	for (const declaration of [
		'participant C tone=loud', 'participant C tone=agent tone=system',
		'participant C extra=yes', 'participant C extra=yes extra=no',
		'participant C "Title" unexpected', 'participant C "Title"tone=agent',
		'participant C"Title"',
		'participant C "Unclosed', 'participant C "Escaped \\" quote"',
		'participant C tone="agent"', 'participant C "Title" "Another"', 'participant',
	]) {
		const { svg, diagnostics } = render(`${prelude}${declaration}\nA --> B: Good`);
		assert.ok(diagnostics.length, declaration);
		assert.ok(diagnostics.every((d) => d.line === 4 && d.severity === "error"), declaration);
		assert.match(svg, />Line 4:/);
		assert.equal(texts(svg).filter((t) => t[4].includes("seq-title")).length, 2);
		assert.equal(rows(svg).length, 1);
	}
	const duplicate = render(`${prelude}participant A "Replacement" tone=stop\nA --> B: First wins`);
	assert.deepEqual(duplicate.diagnostics.map((d) => d.line), [4]);
	assert.match(duplicate.diagnostics[0].message, /duplicate participant/);
	assert.match(rows(duplicate.svg)[0][3], /class="e e-agent"/);
	assert.match(duplicate.svg, /Line 4: participant A &quot;Replacement&quot;/);
	const late = render(`${prelude}A --> B: First\nparticipant C "Late"\nC --> A: Unknown\nB --> A: Last`);
	assert.deepEqual(late.diagnostics.map((d) => d.line), [5, 6]);
	assert.match(late.diagnostics[0].message, /before the first message/);
	assert.match(late.diagnostics[1].message, /unknown message participant `C`/);
	assert.match(late.svg, />Line 5:/);
	assert.match(late.svg, />Line 6:/);
	assert.equal(texts(late.svg).filter((t) => t[4].includes("seq-title")).length, 2);
	assert.deepEqual(rows(late.svg).map((r) => Number(r[1])), [4, 7]);
});

test("bad arrows, missing colons and unknown endpoints diagnose without hiding the source", () => {
	for (const [message, diagnostic] of [
		['A ->> B: Mermaid request', /malformed message arrow/],
		['A -->> B: Mermaid response', /malformed message arrow/],
		['A->>B: Tight Mermaid request', /malformed message arrow/],
		['A-->>B: Tight Mermaid response', /malformed message arrow/],
		['A -> B: Wrong', /malformed message arrow/],
		['A -x B: Lost', /malformed message arrow/],
		['A -) B: Async', /malformed message arrow/],
		['A --> B --> A: Multiple arrows', /malformed message arrow/],
		['A --> B Missing', /colon/],
		['Missing --> B: Unknown', /unknown message participant/],
		['A --> Missing: Unknown', /unknown message participant/],
	] as const) {
		const { svg, diagnostics } = render(`${prelude}${message}\nB --> A: Still here`);
		assert.ok(diagnostics.some((d) => diagnostic.test(d.message)), message);
		assert.ok(diagnostics.every((d) => d.line === 4), message);
		assert.match(svg, />Line 4:/);
		assert.equal(rows(svg).length, 1);
	}
});

test("long malformed arrow input is rejected without backtracking through endpoints", () => {
	const { diagnostics } = render(`${prelude}!-->${"!-->!".repeat(5000)} invalid endpoint: Rejected`);
	assert.deepEqual(diagnostics.map((d) => [d.line, d.message]), [[4, "malformed message arrow; use --> (request) or -.-> (response)"]]);
});

test("requests and responses point in both directions with sender paints and distinct heads", () => {
	const result = render(`${prelude}A-->B: Forward request\nB --> A: Back request\nA-.->B: Forward response\nB -.-> A: Back response\nB --> B: Self request\nA -.-> A: Self response`);
	assert.deepEqual(result.diagnostics, []);
	const messages = rows(result.svg);
	assert.equal(messages.length, 6);
	assert.match(messages[0][3], /d="M186,[\d.]+ L514,[\d.]+" class="e e-agent" marker-end="url\(#ab-seq-agent\)"/);
	assert.match(messages[1][3], /d="M514,[\d.]+ L186,[\d.]+" class="e e-system"/);
	for (const i of [2, 3, 5]) {
		assert.match(messages[i][3], /class="e e-muted dash seq-response" marker-end="url\(#ab-seq-response\)"/);
		assert.doesNotMatch(messages[i][3], /<circle/);
	}
	assert.match(messages[2][3], /d="M186,[\d.]+ L514,[\d.]+"/);
	assert.match(messages[3][3], /d="M514,[\d.]+ L186,[\d.]+"/);
	for (const i of [0, 1, 4]) assert.match(messages[i][3], /<circle[^>]+ r="2.5"/);
	assert.match(messages[4][3], /d="M514,[\d.]+ H533 Q538,[\d.]+ 538,[\d.]+ V[\d.]+ Q538,[\d.]+ 533,[\d.]+ H514"/);
	assert.match(result.svg, /id="ab-seq-agent"[^>]+orient="auto-start-reverse"[^>]*><path d="M0,0 L10,5 L0,10 z" class="t-agent"/);
	assert.match(result.svg, /id="ab-seq-response"[^>]*><path d="M0,0 L10,5 L0,10" class="e e-muted seq-response"/);
	assert.match(result.svg, /\.ab \.seq-response\{stroke-width:1.2\}/);
	assert.ok(texts(result.svg).filter((t) => t[4].includes("seq-label")).every((t) => t[4] === "m s12 seq-label"));
	assert.doesNotMatch(result.svg.slice(result.svg.indexOf("</style>")), /knockout|<rect[^>]+class="k-/);
});

test("sequence SVG is deterministic, inert and uses the existing render options", () => {
	const source = 'sequence v0\nparticipant A "<script> & \\path"\nparticipant B\nA --> B: "quoted" \\path: <script> & https://example.com\nunknown <img>';
	const automatic = render(source);
	assert.equal(automatic.svg, render(source).svg);
	assert.match(automatic.svg, /@media \(prefers-color-scheme:dark\)/);
	assert.match(automatic.svg, /&quot;quoted&quot; \\path: &lt;script&gt;/);
	assert.doesNotMatch(automatic.svg, /<script|<img|href=|onload=/);
	const unsafeScheme = render(source, { scheme: '"><script>alert(1)</script>' } as unknown as RenderOptions);
	assert.equal(unsafeScheme.svg, automatic.svg);
	let schemeReads = 0;
	const changingScheme = { get scheme() { return ++schemeReads === 1 ? "light" : '"><script>alert(1)</script>'; } } as unknown as RenderOptions;
	assert.equal(render(source, changingScheme).svg, render(source, { scheme: "light" }).svg);
	assert.match(automatic.svg, /class="seq-lane" fill-opacity="0.15"/);
	assert.match(automatic.svg, /seq-life\{stroke:var\(--line\);stroke-width:1;stroke-opacity:.5\}/);
	for (const scheme of ["light", "dark"] as const) {
		const svg = render(source, { scheme, title: 'A "title" <here>', idPrefix: 'doc:1"' }).svg;
		assert.match(svg, new RegExp(`class="ab ab-${scheme}"`));
		assert.match(svg, /aria-label="A &quot;title&quot; &lt;here&gt;"/);
		assert.doesNotMatch(svg, /prefers-color-scheme/);
		assert.match(svg, /id="doc.003a1.0022-seq-ink"/);
		assert.match(svg, /marker-end="url\(#doc.003a1.0022-seq-ink\)"/);
	}
});

function assertBounds(source: string, fonts?: FontsOptions) {
	const { svg, layout, diagnostics } = render(source, { fonts });
	assert.deepEqual(diagnostics, []);
	for (const t of texts(svg)) {
		const size = t[4].includes("s11") ? 11 : 12;
		const width = layout.typography.width(t[5], "mono", size, t[4].includes(" b ") ? 600 : 400);
		const left = Number(t[1]) - (t[3] === "middle" ? width / 2 : 0);
		const right = left + width;
		assert.ok(left >= 0 && right <= 678, `${t[5]} at ${left}..${right}`);
		assert.ok(Number(t[2]) - size >= 0 && Number(t[2]) + 4 < layout.height);
	}
	const messages = rows(svg);
	for (const [i, r] of messages.entries()) {
		const ys = texts(r[3]).map((t) => Number(t[2]));
		if (i) assert.ok(Math.min(...ys) > Math.max(...texts(messages[i - 1][3]).map((t) => Number(t[2]))) + 12);
	}
	return { svg, layout };
}

test("bounded lanes wrap titles, long labels and unbroken tokens at the right edge", () => {
	const source = `sequence v0\nparticipant A "${"Long title ".repeat(10)}"\nparticipant B\nparticipant C\nA --> B: ${"Long label ".repeat(50)}\nB -.-> C: ${"x".repeat(250)}\nA --> A: ${"Self label ".repeat(30)}\nC --> C: ${"y".repeat(100)}`;
	const { svg } = assertBounds(source);
	const messages = rows(svg);
	assert.ok(texts(messages[0][3]).filter((t) => t[4].includes("seq-label")).length > 1);
	assert.ok(texts(messages[1][3]).filter((t) => t[4].includes("seq-label")).length > 1);
	const self = texts(messages[2][3]).filter((t) => t[4].includes("seq-label"));
	// The first lane's loop leaves most of the canvas, rather than a lane slot.
	assert.ok(self.some((t) => t[5].length * 7.2 > 300));
	assert.equal(rows(assertBounds(example("claim")).svg).length, 15);
});

test("custom mono faces and weight-aware metrics govern every sequence text role", () => {
	const calls: [string, TextStyle][] = [];
	const mono = { family: "Host Mono", measureText: (text: string, style: TextStyle) => {
		calls.push([text, style]);
		return [...text].length * (style.fontWeight === 600 ? 15 : style.fontSize === 11 ? 9 : 12);
	} };
	const source = `sequence v0\nparticipant A "A long participant title"\nparticipant B\nA --> B: ${"Wide words ".repeat(30)}\nB --> B: ${"z".repeat(80)}`;
	const ordinary = render(source);
	const custom = assertBounds(source, { mono });
	assert.match(custom.svg, /\.ab \.m\{font-family:"Host Mono"\}/);
	assert.ok(custom.layout.height > ordinary.layout.height);
	assert.ok(calls.some(([text, style]) => text.includes("participant") && style.fontSize === 12 && style.fontWeight === 600));
	assert.ok(calls.some(([text, style]) => text === "01" && style.fontSize === 11 && style.fontWeight === 400));
	assert.ok(calls.some(([text, style]) => text.startsWith("Wide") && style.fontSize === 12 && style.fontWeight === 400));
	const rejected = render(`${source}\nInvalid rejected source`, { fonts: { mono } });
	assert.ok(calls.some(([text, style]) => text.startsWith("Line 6:") && style.fontWeight === 400));
	assert.match(rejected.svg, /seq-rejected/);
	const text = { family: "Irrelevant Text", measureText: () => { throw new Error("text metrics must not be called"); } };
	assert.equal(render(source, { fonts: { text } }).svg, ordinary.svg);
	assert.equal(render(source, { fonts: { mono, text } }).svg, custom.svg);
	assert.equal(render(source, { fonts: {} }).svg, ordinary.svg);
});

test("claim preserves five titles, all 15 directed messages, the self-message and numbering", () => {
	const { svg, diagnostics } = render(example("claim"));
	assert.deepEqual(diagnostics, []);
	assert.deepEqual(texts(svg).filter((t) => t[4].includes("seq-title")).map((t) => t[5]), ["Creator", "Studio", "Backend", "RSS feed", "Owner's inbox"]);
	const expected = [
		[0, 1, false, "Sign in, no show yet"], [1, 0, true, "Claim existing, Add via RSS, Start from scratch"],
		[0, 1, false, "Claim existing show"], [1, 2, false, "POST claim for show"],
		[2, 3, false, "Fetch feed live"], [3, 2, true, "itunes owner email"],
		[2, 4, false, "Send 6-digit code"], [4, 0, true, "Email with the code"],
		[0, 1, false, "Enter code"], [1, 2, false, "POST verify code"],
		[2, 2, false, "Check code and expiry"], [2, 1, true, "Claim confirmed"],
		[1, 0, true, "The show is yours"], [2, 1, true, "Rejected, attempts left"],
		[1, 0, true, "Try again or resend the code"],
	] as const;
	const centres = texts(svg).filter((t) => t[4].includes("seq-title")).map((t) => Number(t[1]));
	const messages = rows(svg);
	assert.equal(messages.length, expected.length);
	for (const [i, [from, to, response, label]] of expected.entries()) {
		const row = messages[i][3];
		const labels = texts(row).filter((t) => t[4].includes("seq-label")).map((t) => t[5]).join(" ");
		assert.equal(labels, label);
		assert.match(row, new RegExp(`d="M${centres[from]},`));
		assert.match(row, new RegExp(from === to ? `H${centres[to]}"` : `L${centres[to]},`));
		assert.equal(row.includes("dash seq-response"), response);
		assert.equal(texts(row).find((t) => t[4].includes("seq-number"))?.[5], String(i + 1).padStart(2, "0"));
	}
	const many = render(`${prelude}${Array.from({ length: 101 }, (_, i) => `A --> B: Message ${i + 1}`).join("\n")}`);
	assert.deepEqual(many.diagnostics, []);
	assert.equal(texts(rows(many.svg)[99][3]).find((t) => t[4].includes("seq-number"))?.[5], "100");
});

// Frozen from main before sequence implementation, independent of regenerated
// figures. Any change to existing flow/fan-out bytes must be deliberate.
const existing: Record<string, string> = {
	"approval-narrow": "16ba87bbcfd02ca5cbcc4d535035c4ed5450258b789fbc635877e34f67a21258",
	"approval-wide": "110a2ad44f29001a3107d7a1a10d14d121952033397d40dcdec871daada2e08b",
	approvals: "52a1a54c974f3d794f9f192d121e631c1b2126b60093fd716b4547ac5e55569f",
	checkout: "6123da943494683c90c755d41c2c9d1ed2ff1736291ae828b8e12f8881c8361c",
	deploy: "521f32edd93647a497f3acf6f86e82b87c74b515b440df49c88c80146697055c",
	launcher: "4822465ab254e733f082a1c7f1332dc155c599cd21943f532b3aa72689d393de",
	"loop-insert": "e433f497819b322a1cc121621aee648195218846446d877328f51400456da238",
	loop: "2d8f0563694d7f8ab589261fead69d60c08b1b42b61584596fde72830b45fed7",
	neutral: "adb82c8e51e101e90db4a5684f7c03cf8ed3a37934e2758a85c7f4bafbc515f4",
	"panel-wrap": "8839a4838e5f11b51cf9565eedef8f035e8211c482d69056093e83224102bc99",
	"project-workflow": "dc47e284c9fbf88469385d0f45e1ce2675d9311e6399e9ba45e5d5982aea327f",
	"run-endings-ladder": "0c8252a5293da914f31cb729eeda68b04ca4175d37fc15e6a9787dc754f4a9a5",
	"run-endings": "e8fcca9ac33c8e5171125c98d7fa80322cc76cd3e3f1b296725dce7142460313",
	"system-steps": "db2f5aba1e067a7256a3f2767cfcbaae48f53cd7d50d5760bea99630ade8aa1c",
	"top-entries": "2d3d9863be0d4502ce0c619c225d0d0a8ffddbf7afcef8e0df9ac747eb0a31e0",
};
test("existing flow and fan-out example SVG bytes stay unchanged", () => {
	assert.equal(Object.keys(existing).length, 15);
	for (const [name, hash] of Object.entries(existing)) assert.equal(
		createHash("sha256").update(render(example(name), { idPrefix: name }).svg).digest("hex"), hash, name,
	);
});
