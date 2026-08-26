// The gallery: one HTML page showing the eight-chart legibility ladder
// (`fixtures/scenarios/`), then what the shipped pipeline does to the twelve
// spike scenarios, plus a cold-start column per fixture. It is the
// owner's review surface and never a CI gate — CI compares the manifest
// hashes; nothing here decides whether a build passes.
//
// Two rules this page exists to keep:
//
//   * Every SVG is **inlined**. The spike's gallery referenced `out/**.png`
//     relatively and broke the moment the file moved; this one is one
//     self-contained document that opens from file:// with no server. (Inlined
//     SVGs share the HTML document's id space, so all 28 copies of the arrow
//     marker resolve to the first one — harmless only because the renderer
//     emits the same marker in every picture, and worth knowing before anyone
//     gives this page a per-row theme.)
//   * No clock, no randomness — the page is hashed with the rest of the run's
//     artifacts, so a timestamp in the footer would make every run "drift".
//
// `node scripts/gallery.mjs` writes it on its own (after `pnpm build`);
// `scripts/acceptance.mjs` imports `galleryHtml()` and writes it with the rest.
import { pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { parse, snap, toSvg } from "../dist/index.js";
import { FIXTURES, ROOT, TITLES, applyOps, escapeHtml, read, readJson } from "./graph.mjs";

const CSS = `
:root { color-scheme: light; }
body { font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
       margin: 0; padding: 32px; background: #f6f7fa; color: #16203a; }
h1 { margin: 0 0 4px; font-size: 26px; }
.lede { color: #5a6580; max-width: 82ch; margin: 0 0 24px; }
.toc { margin: 0 0 28px; padding: 12px 16px; background: #fff; border: 1px solid #e2e7f0; border-radius: 10px; }
.toc a { margin: 0 14px 4px 0; display: inline-block; font-size: 13px; color: #33405a; }
section { background: #fff; border: 1px solid #e2e7f0; border-radius: 12px; padding: 18px; margin-bottom: 26px; }
h2 { font-size: 18px; margin: 0 0 2px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.mut { font-weight: 400; color: #7b3fb5; font-size: 14px; font-family: inherit; }
.note { margin: 4px 0 8px; color: #8a6d1f; font-size: 13px; }
.delta { margin: 0 0 14px; padding: 8px 10px; background: #f6f7fa; border-radius: 6px;
         font-size: 12px; white-space: pre-wrap; color: #33405a; }
.wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; table-layout: fixed; }
td { vertical-align: top; padding: 0 10px; border-left: 1px solid #eef1f6; }
td:first-child { border-left: 0; padding-left: 0; }
.cap { font-size: 13px; margin-bottom: 6px; }
.sub { color: #8896ad; font-weight: 400; }
.frame { border: 1px solid #e2e7f0; border-radius: 6px; background: #fff; padding: 6px; }
.frame svg { display: block; width: 100%; height: auto; }
.frame pre { margin: 0; font-size: 12px; white-space: pre-wrap; color: #33405a; }
.m { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; color: #5a6580; margin-top: 6px; }
.good { color: #147a3d; font-weight: 600; }
.warn { color: #a15c00; font-weight: 600; }
`;

/** The largest distance any node kept from the previous layout moved, in px. */
const drift = (graph, prev, after) => {
  let moved = 0;
  let max = 0;
  let kept = 0;
  for (const n of graph.nodes) {
    const a = prev[n.id];
    const b = after[n.id];
    if (!a || !b) continue;
    kept++;
    const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    if (d > 0) moved++;
    if (d > max) max = d;
  }
  return { kept, moved, max };
};

const OP_LINE = {
  addNode: (op) => `+ node ${op.id} ("${op.label}", ${op.kind}) — new, needs a position`,
  delNode: (op) => `- node ${op.id}`,
  addEdge: (op) => `+ edge ${op.from} -> ${op.to}${op.label === undefined ? "" : ` ("${op.label}")`}`,
  delEdge: (op) => `- edge ${op.from} -> ${op.to}`,
  relabel: (op) => `~ label ${op.id} -> "${op.label}"`,
};

const cell = (caption, sub, svg, meta = "") => `
      <td>
        <div class="cap"><b>${escapeHtml(caption)}</b> <span class="sub">${escapeHtml(sub)}</span></div>
        <div class="frame">${svg}</div>
        <div class="m">${meta}</div>
      </td>`;

/** Warning codes with their counts, in code order: `displaced ×4, orphan`. */
const warnLine = (warnings) => {
  if (warnings.length === 0) return "<span>no warnings</span>";
  const counts = new Map();
  for (const w of warnings) counts.set(w.code, (counts.get(w.code) ?? 0) + 1);
  const text = [...counts.keys()]
    .sort()
    .map((code) => (counts.get(code) === 1 ? code : `${code} ×${counts.get(code)}`))
    .join(", ");
  return `<span class="warn">${escapeHtml(text)}</span>`;
};

const metrics = (d, added, warnings) =>
  [
    d.moved === 0
      ? `<span class="good">${d.kept}/${d.kept} kept nodes at 0px</span>`
      : `<span class="warn">${d.moved}/${d.kept} kept nodes moved, up to ${d.max}px</span>`,
    added.length === 0 ? "<span>no new nodes</span>" : `<span>placed: ${escapeHtml(added.join(", "))}</span>`,
    warnLine(warnings),
  ].join("\n        ");

const section = (id, heading, mutation, note, delta, cells) => `
<section id="${escapeHtml(id)}">
  <h2>${escapeHtml(heading)} <span class="mut">${escapeHtml(mutation)}</span></h2>
  ${note ? `<p class="note">${escapeHtml(note)}</p>` : ""}
  ${delta ? `<pre class="delta">${escapeHtml(delta)}</pre>` : ""}
  <div class="wrap"><table><tr>${cells}
  </tr></table></div>
</section>`;

export const galleryHtml = () => {
  const stored = readJson("fixtures/spike/positions.json");
  const scenarios = readJson("fixtures/spike/scenarios.json");
  const bases = new Map(FIXTURES.map((name) => [name, parse(read(`fixtures/text/${name}.mmd`))]));

  const sections = [];
  const toc = [];

  // The legibility scenario ladder: eight fixed charts, each rendered from its
  // committed positions with no snap pass and no directives, ordered by
  // structural complexity. First on the page because this is the block a
  // renderer change is judged against — the source text sits above every
  // picture so the eye can check the drawing against what was asked for.
  for (const s of readJson("fixtures/scenarios/scenarios.json").scenarios) {
    const text = read(`fixtures/scenarios/${s.id}.mmd`);
    const graph = parse(text);
    toc.push(s.id);
    sections.push(
      section(
        s.id,
        s.id,
        s.title,
        s.note ?? "",
        "",
        cell(
          "source",
          `fixtures/scenarios/${s.id}.mmd`,
          `<pre>${escapeHtml(text.trim())}</pre>`,
          `<span>${graph.nodes.length} nodes, ${graph.edges.length} edges</span>`,
        ) +
          cell(
            "rendered",
            "committed positions, no directives",
            toSvg(graph, s.positions, { title: s.title }),
            "<span>no snap pass, no directives</span>",
          ),
      ),
    );
  }

  // Cold start: the same graph with an empty store, every position from the
  // fallback rule. Beside the hand-arranged layout, because the question the
  // owner is answering by looking is "how far off is a chart with no hand
  // layout and no model?" — a judgement, not an assertion.
  for (const name of FIXTURES) {
    const graph = bases.get(name);
    const cold = snap(graph, {}, []);
    const id = `cold-${name}`;
    toc.push(id);
    sections.push(
      section(
        id,
        `cold-start · ${name}`,
        "empty layout store",
        "Every position from the fallback rule (one row below the first placed parent), then snapped, clamped and overlap-resolved. No hand layout, no model.",
        "",
        cell("hand-arranged", "the committed positions", toSvg(graph, stored[name], { title: TITLES[name] })) +
          cell(
            "cold start",
            "empty store, fallback rule only",
            toSvg(graph, cold.positions, { title: `${TITLES[name]} (cold start)` }),
            [`<span>${graph.nodes.length} positions, every one from the fallback rule</span>`, warnLine(cold.warnings)].join(
              "\n        ",
            ),
          ),
      ),
    );
  }

  // The twelve mutations, each through parse -> snap (no directives) -> render.
  // No directives on purpose: this is the floor, what every host gets from the
  // pipeline alone before anything smarter emits a directive.
  for (const s of scenarios) {
    const base = bases.get(s.base);
    const prev = stored[s.base];
    const after = applyOps(base, s.ops);
    const { positions, warnings } = snap(after, prev, []);
    const added = after.nodes.filter((n) => prev[n.id] === undefined).map((n) => n.id);
    toc.push(s.id);
    sections.push(
      section(
        s.id,
        s.id,
        s.mutation,
        s.note ?? "",
        s.ops.map((op) => OP_LINE[op.op](op)).join("\n"),
        cell("before", "what the user last saw", toSvg(base, prev, { title: TITLES[s.base] })) +
          cell(
            "after",
            "parse → snap → render",
            toSvg(after, positions, { title: `${TITLES[s.base]} — ${s.id}` }),
            metrics(drift(after, prev, positions), added, warnings),
          ),
      ),
    );
  }

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>ablauf — acceptance gallery</title>
<style>${CSS}</style></head><body>
<h1>ablauf — what the pipeline does to a hand-arranged chart</h1>
<p class="lede">Written by <code>mise run acceptance</code>, from the committed <code>.mmd</code> fixtures and the
spike's twelve mutations. It opens with the <b>legibility ladder</b> (<code>s1…s8</code>): eight fixed charts of
growing structural complexity, each drawn straight from its committed positions with no snap pass and no
directives, and the block a renderer change is judged against. Then two <b>cold starts</b>: the fixtures with an
empty layout store, so every position comes from the fallback rule. The rest is <b>before</b> (the layout the user
last saw) and <b>after</b> (the same text mutated, run through parse → snap → render with <b>no</b> directives at all).
Every SVG is inlined, so this file opens from <code>file://</code> on its own. This page is a review surface,
not a gate — nothing in CI diffs it.</p>
<div class="toc">${toc.map((id) => `<a href="#${escapeHtml(id)}">${escapeHtml(id)}</a>`).join("")}</div>
${sections.join("\n")}
</body></html>
`;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = new URL("out/acceptance/", ROOT);
  mkdirSync(out, { recursive: true });
  writeFileSync(new URL("gallery.html", out), galleryHtml());
  console.log(`wrote ${new URL("gallery.html", out).pathname}`);
}
