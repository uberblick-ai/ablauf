// Build a standalone prototype page for sequence playback.
// Usage: node build.ts <ablauf repo> <out.html>
import { readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const repo = process.argv[2];
const out = process.argv[3];
const { render } = await import(`${repo}/spike/flow/index.ts`);
const source = readFileSync(`${repo}/spike/examples/claim.flow`, "utf8");
const result = render(source, { idPrefix: "ab" });
if (result.diagnostics.length) console.error(result.diagnostics);
let svg: string = result.svg;

// Participants: centre x and title from the header groups.
const participants: { x: number; title: string; tone: string }[] = [];
for (const m of svg.matchAll(/<circle cx="([\d.]+)" cy="20" r="3" class="t-(\w+)"\/>\n<text[^>]*>([^<]*)<\/text>/g))
	participants.push({ x: Number(m[1]), tone: m[2], title: m[3].replace(/&#39;|&apos;/g, "'") });
const who = (x: number) => participants.findIndex(p => Math.abs(p.x - x) < 0.5);

// Header groups become parts p-0..p-n.
let pi = 0;
svg = svg.replace(/<g data-line="(\d+)">\n<circle cx="[\d.]+" cy="20"/g, m => m.replace("<g ", `<g data-ab-part="p-${pi++}" `));

// Messages: part m-N, plus an activation bar on the receiver and a packet.
interface Msg { n: number; from: number; to: number; y: number; label: string; tone: string; d: string }
const messages: Msg[] = [];
svg = svg.replace(/<g data-line="(\d+)" data-step="(\d+)">\n<text[^>]*>([^<]*)<\/text>\n(<text[^>]*>[^<]*<\/text>)\n<path d="([^"]+)" class="e e-(\w+)[^"]*"[^>]*\/>/g,
	(all, line, n, label, _num, d, tone) => {
		const pts = [...d.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(p => [Number(p[1]), Number(p[2])]);
		const self = d.includes("Q");
		const x1 = pts[0][0], y = pts[0][1];
		const x2 = self ? x1 : pts[pts.length - 1][0];
		const msg = { n: Number(n), from: who(x1), to: who(x2), y, label, tone, d };
		messages.push(msg);
		const toneOf = tone === "muted" ? participants[msg.from].tone : tone;
		const ay = self ? Number([...d.matchAll(/,([\d.]+)/g)].pop()![1]) : y;
		const extra =
			`<rect class="seq-act t-${participants[msg.to].tone}" x="${x2 - 3}" y="${ay - 9}" width="6" height="18" rx="3"/>` +
			`<circle class="seq-packet t-${toneOf}" r="4" cx="0" cy="0" style="offset-path:path('${d}')"/>`;
		return all.replace("<g ", `<g data-ab-part="m-${n}" `) + "\n" + extra;
	});

// Annotations become parts a-LINE; they light with a neighbouring message.
const annotations: { line: number; type: string }[] = [];
svg = svg.replace(/<g data-line="(\d+)" data-annotation="(\w+)">/g, (all, line, type) => {
	annotations.push({ line: Number(line), type });
	return `<g data-ab-part="a-${line}" data-line="${line}" data-annotation="${type}">`;
});
const msgLine = new Map<number, number>();
for (const m of svg.matchAll(/data-ab-part="m-(\d+)" data-line="(\d+)"/g)) msgLine.set(Number(m[1]), Number(m[2]));
// Note -> previous message; section/open/else -> next message.
const attach = new Map<number, string[]>();
for (const a of annotations) {
	const lines = [...msgLine.entries()];
	const target = a.type === "note"
		? lines.filter(([, l]) => l < a.line).pop()?.[0]
		: lines.find(([, l]) => l > a.line)?.[0];
	if (target) attach.set(target, [...(attach.get(target) ?? []), `a-${a.line}`]);
}

svg = svg.replace('class="ab ab-auto"', 'class="ab ab-auto v-cursor" data-ab-play="ab"');
// One moving row band for the cursor variant, behind the headers and messages.
svg = svg.replace('<g data-ab-part="p-0"', '<rect class="seq-now" x="20" y="0" width="650" height="30" rx="7"/>\n<g data-ab-part="p-0"');

const scenarios = [
	{ name: "Claim the show", steps: [
		[1, "Open the studio with no show yet"],
		[2, "Offer the three ways to add a show"],
		[3, "Choose the existing show"],
		[4, "Ask the backend to start a claim"],
		[5, "Read the feed as it is now"],
		[6, "The feed names the owner's email"],
		[7, "Mail a 6-digit code to that address"],
		[8, "The owner reads the code"],
		[9, "Type the code into the studio"],
		[10, "Send it on for checking"],
		[11, "Compare code and expiry"],
		[12, "The code matches"],
		[13, "The show now belongs to the creator"],
	] },
	{ name: "Wrong code", steps: [
		[9, "Type a code that no longer works"],
		[10, "Send it on for checking"],
		[11, "Compare code and expiry"],
		[14, "Reject it and count the attempt"],
		[15, "Offer another try or a new code"],
	] },
];
const timelines = scenarios.map(s => ({
	name: s.name,
	slug: s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
	steps: s.steps.map(([n, caption]) => {
		const m = messages.find(x => x.n === n)!;
		const parts = [`m-${n}`, `p-${m.from}`, `p-${m.to}`, ...(attach.get(n as number) ?? [])];
		const actor = m.from === m.to ? participants[m.from].title : `${participants[m.from].title} → ${participants[m.to].title}`;
		return { target: String(n), kind: "message", actor, caption, ms: 1700, parts };
	}),
}));

// Real player and controls, types stripped, imports and exports removed.
const strip = (file: string) => stripTypeScriptTypes(readFileSync(`${repo}/spike/flow/${file}`, "utf8"))
	.replace(/^import[^\n]*\n/gm, "").replace(/^export /gm, "");
const runtime = strip("player.ts") + "\n" + strip("controls.ts");

const html = readFileSync(new URL("./page.html", import.meta.url), "utf8")
	.replace("<!--SVG-->", svg)
	.replace("/*TIMELINES*/", JSON.stringify(timelines))
	.replace("/*RUNTIME*/", runtime);
writeFileSync(out, html);
console.log(`wrote ${out}: ${messages.length} messages, ${timelines.map(t => t.steps.length).join("+")} steps`);
