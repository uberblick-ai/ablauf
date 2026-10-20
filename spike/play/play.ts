// A playback spike: a .play script names flow nodes in order, with a time for
// each, and build() wraps the rendered flow in a page that lights them one by
// one. The flow itself is untouched; the renderer only marks its nodes and
// edges (the `targets` option) so the player can find them.
//
//   node spike/play/play.ts spike/play/loop.play   writes loop.html beside it

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { render } from "../flow/index.ts";
import { esc } from "../flow/svg.ts";

export interface Step {
	node: string;
	ms: number;
	caption: string;
	line: number;
}

export interface Play {
	flow: string;
	tempo: number;
	steps: Step[];
	problems: string[];
}

const STEP = /^step\s+([A-Za-z0-9_-]+)(?:\s+(\d+(?:\.\d+)?)s)?(?:\s+"((?:[^"\\]|\\.)*)")?$/;

export function parsePlay(source: string): Play {
	const play: Play = { flow: "", tempo: 1500, steps: [], problems: [] };
	const lines = source.split("\n");
	lines.forEach((raw, i) => {
		const line = raw.trim();
		const n = i + 1;
		if (!line || line.startsWith("#") || line === "play v0") return;
		const flow = line.match(/^flow\s+(\S+)$/);
		const tempo = line.match(/^tempo\s+(\d+(?:\.\d+)?)s$/);
		const step = line.match(STEP);
		if (flow) play.flow = flow[1];
		else if (tempo) play.tempo = Number(tempo[1]) * 1000;
		else if (step)
			play.steps.push({
				node: step[1],
				ms: step[2] ? Number(step[2]) * 1000 : 0, // 0 takes the tempo
				caption: (step[3] ?? "").replace(/\\(.)/g, "$1"),
				line: n,
			});
		else play.problems.push(`line ${n}: cannot read "${line}"`);
	});
	for (const s of play.steps) if (!s.ms) s.ms = play.tempo;
	return play;
}

// Checks the steps against the flow: every node must exist, and a step that
// follows another without an edge between them is allowed but reported.
export function check(play: Play, nodes: string[], edges: [string, string][]): string[] {
	const out = [...play.problems];
	const known = new Set(nodes);
	play.steps.forEach((s, i) => {
		if (!known.has(s.node)) out.push(`line ${s.line}: no node "${s.node}" in the flow`);
		const prev = play.steps[i - 1];
		if (prev && !edges.some(([a, b]) => a === prev.node && b === s.node))
			out.push(`line ${s.line}: no edge ${prev.node} --> ${s.node}; nothing lights between them`);
	});
	return out;
}

export function build(play: Play, flowSource: string, title = "Playback"): { html: string; problems: string[] } {
	const { svg, layout } = render(flowSource, { targets: true, idPrefix: "play" });
	const problems = check(
		play,
		layout.nodes.map((p) => p.node.id),
		layout.routes.map((r) => [r.edge.from, r.edge.to]),
	);
	const steps = play.steps.map(({ node, ms, caption }) => ({ node, ms, caption }));
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<div class="bar">
<button type="button" id="play" aria-label="Pause">❚❚</button>
<button type="button" id="restart">Restart</button>
<div id="segs"></div>
</div>
<p id="caption" aria-live="polite"></p>
<div class="stage">${svg}</div>
<ol id="log"></ol>
</main>
<script>const STEPS = ${JSON.stringify(steps).replace(/</g, "\\u003c")};
${PLAYER}</script>
</body>
</html>
`;
	return { html, problems };
}

const CSS = `
:root{color-scheme:light dark;--hl:#2f6fde;--page:#f6f7f9;--fg:#17202c;--mute:#5a6575;--rail:#d3d9e2}
@media (prefers-color-scheme:dark){:root{--hl:#6ea0ff;--page:#11151b;--fg:#e5e9ef;--mute:#98a2b0;--rail:#2c3440}}
body{margin:0;background:var(--page);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
main{max-width:820px;margin:0 auto;padding:24px 16px}
.bar{display:flex;gap:8px;align-items:center}
button{font:inherit;color:inherit;background:none;border:1px solid var(--rail);border-radius:999px;height:32px;padding:0 12px;cursor:pointer}
#play{width:32px;padding:0;background:var(--hl);border-color:var(--hl);color:#fff}
#segs{flex:1;display:flex;gap:3px}
#segs button{flex:1;height:6px;padding:0;border:0;border-radius:3px;background:var(--rail)}
#segs button.done{background:color-mix(in srgb,var(--hl) 45%,var(--rail))}
#segs button.on{background:var(--hl)}
#caption{min-height:20px;margin:14px 0 8px;color:var(--mute)}
.stage svg{max-width:100%;height:auto}
#log{margin:12px 0 0;padding:0;list-style:none;font-size:13px}
#log li{display:grid;grid-template-columns:150px 1fr;gap:12px;padding:3px 8px;border-radius:6px;color:var(--mute);opacity:.45}
#log li.done{opacity:1}
#log li.on{opacity:1;color:var(--fg);background:color-mix(in srgb,var(--hl) 14%,transparent)}
#log b{font-family:ui-monospace,monospace;font-weight:500}

/* What the player does to the flow: future parts fade, the current node
   rings in the highlight colour, the edge just taken runs as moving dashes. */
.ab [data-node],.ab [data-from]{transition:opacity .3s}
.ab.playing [data-node]:not(.on):not(.done),.ab.playing [data-from]:not(.on):not(.done){opacity:.28}
.ab [data-node].on rect,.ab [data-node].on path{stroke:var(--hl);stroke-width:2.5}
.ab [data-node].on{filter:drop-shadow(0 0 6px color-mix(in srgb,var(--hl) 55%,transparent))}
.ab [data-node].on text.b,.ab [data-node].on > text:only-child{fill:var(--hl)}
.ab path.e[data-from].on{stroke-width:2.6;stroke-dasharray:6 5;animation:ab-run .6s linear infinite}
@keyframes ab-run{to{stroke-dashoffset:-11}}
@media (prefers-reduced-motion:reduce){.ab path.e[data-from].on{animation:none}}
`;

// Plain browser script: the page holds the SVG and STEPS, nothing else.
const PLAYER = `
const svg = document.querySelector(".ab");
const nodes = (id) => svg.querySelectorAll(\`[data-node="\${CSS.escape(id)}"]\`);
const edges = (a, b) => svg.querySelectorAll(\`[data-from="\${CSS.escape(a)}"][data-to="\${CSS.escape(b)}"]\`);
const segs = document.getElementById("segs"), log = document.getElementById("log");
const caption = document.getElementById("caption"), playBtn = document.getElementById("play");
let at = 0, playing = !matchMedia("(prefers-reduced-motion: reduce)").matches, timer = 0;
STEPS.forEach((s, i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.setAttribute("aria-label", \`Step \${i + 1}: \${s.node}\`);
  b.onclick = () => { setPlaying(false); show(i); };
  segs.append(b);
  const li = document.createElement("li");
  li.innerHTML = "<b></b><span></span>";
  li.children[0].textContent = s.node;
  li.children[1].textContent = s.caption;
  log.append(li);
});
function show(i) {
  at = i;
  svg.classList.add("playing");
  for (const el of svg.querySelectorAll(".on,.done")) el.classList.remove("on", "done");
  for (let k = 0; k <= i; k++) {
    const cls = k === i ? "on" : "done";
    const lit = [...nodes(STEPS[k].node), ...(k ? edges(STEPS[k - 1].node, STEPS[k].node) : [])];
    for (const el of lit) { el.classList.remove("done"); el.classList.add(cls); }
  }
  const state = (k) => (k === i ? "on" : k < i ? "done" : "");
  [...segs.children].forEach((b, k) => { b.className = state(k); });
  [...log.children].forEach((li, k) => { li.className = state(k); });
  caption.textContent = STEPS[i].caption;
  schedule();
}
function schedule() {
  clearTimeout(timer);
  if (playing) timer = setTimeout(() => show(at + 1 < STEPS.length ? at + 1 : 0), STEPS[at].ms);
}
function setPlaying(p) {
  playing = p;
  playBtn.textContent = p ? "❚❚" : "▶";
  playBtn.setAttribute("aria-label", p ? "Pause" : "Play");
  schedule();
}
playBtn.onclick = () => setPlaying(!playing);
document.getElementById("restart").onclick = () => { setPlaying(true); show(0); };
setPlaying(playing);
show(0);
`;

if (import.meta.main) {
	const file = process.argv[2];
	if (!file) throw new Error("usage: node spike/play/play.ts FILE.play");
	const play = parsePlay(readFileSync(file, "utf8"));
	const flowFile = join(dirname(file), play.flow);
	const { html, problems } = build(play, readFileSync(flowFile, "utf8"), file);
	for (const p of problems) console.error(`${file}: ${p}`);
	const out = file.replace(/\.play$/, ".html");
	writeFileSync(out, html);
	console.log(`wrote ${out}`);
}
