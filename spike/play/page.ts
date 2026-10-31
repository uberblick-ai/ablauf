// Writes a page that plays a diagram's play section with the package's own
// player, for review in a browser before a host like Uberblick embeds it.
//
//   node spike/play/page.ts spike/play/loop.flow     writes loop.html beside it

import { readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { render } from "../flow/index.ts";
import { esc } from "../flow/svg.ts";

process.removeAllListeners("warning"); // stripTypeScriptTypes is marked experimental

export function page(source: string, title: string): string {
	const { svg, timeline, diagnostics } = render(source);
	// The player module as the browser runs it: types stripped, imports gone.
	const player = stripTypeScriptTypes(readFileSync(new URL("../flow/player.ts", import.meta.url), "utf8"))
		.replace(/^import .*$/gm, "")
		.replace(/^export /gm, "");
	const steps = JSON.stringify(timeline.map(({ parts, ms, caption }) => ({ parts, ms, caption }))).replace(/</g, "\\u003c");
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{color-scheme:light dark;--page:#f6f7f9;--fg:#17202c;--mute:#5a6575;--rail:#d3d9e2}
@media (prefers-color-scheme:dark){:root{--page:#11151b;--fg:#e5e9ef;--mute:#98a2b0;--rail:#2c3440}}
body{margin:0;background:var(--page);color:var(--fg);font:14px/1.4 system-ui,sans-serif}
main{max-width:820px;margin:0 auto;padding:24px 16px}
.bar{display:flex;gap:8px;align-items:center}
button{font:inherit;color:inherit;background:none;border:1px solid var(--rail);border-radius:999px;height:32px;padding:0 12px;cursor:pointer}
#segs{flex:1;display:flex;gap:3px}
#segs button{flex:1;height:6px;padding:0;border:0;border-radius:3px;background:var(--rail)}
#segs button.done{background:var(--mute)}
#segs button.on{background:var(--fg)}
#caption{min-height:20px;margin:14px 0 8px;color:var(--mute)}
svg{max-width:100%;height:auto}
</style>
</head>
<body>
<main>
<div class="bar"><button type="button" id="play">Play</button><div id="segs"></div></div>
<p id="caption" aria-live="polite"></p>
${svg}
${diagnostics.map((d) => `<p>Line ${d.line}: ${esc(d.message)}</p>`).join("\n")}
</main>
<script>
${player}
const STEPS = ${steps};
const button = document.getElementById("play");
const segs = document.getElementById("segs");
const caption = document.getElementById("caption");
const p = createPlayer(document.querySelector("svg.ab"), STEPS, {
  onChange(p) {
    button.textContent = p.playing ? "Pause" : "Play";
    caption.textContent = p.index >= 0 ? STEPS[p.index].caption : "";
    [...segs.children].forEach((b, k) => { b.className = k === p.index ? "on" : k < p.index ? "done" : ""; });
  },
});
STEPS.forEach((_, i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.setAttribute("aria-label", \`Step \${i + 1}\`);
  b.onclick = () => { p.pause(); p.seek(i); };
  segs.append(b);
});
button.onclick = () => (p.playing ? p.pause() : p.play());
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) p.play();
</script>
</body>
</html>
`;
}

if (import.meta.main) {
	const file = process.argv[2];
	if (!file) throw new Error("usage: node spike/play/page.ts FILE.flow");
	const out = file.replace(/\.flow$/, ".html");
	writeFileSync(out, page(readFileSync(file, "utf8"), file));
	console.log(`wrote ${out}`);
}
