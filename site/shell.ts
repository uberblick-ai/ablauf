// The shell every page shares, the same as uberblick.ai's (uberblick-2's
// site/build.py): top bar, docs sidebar, main column, the "Who builds this"
// block and the footer. static/shared.css is a copy of uberblick.ai's; link
// https://uberblick.ai/shared.css instead once the new site serves there.
import { kinds } from "./kinds.ts";

const REPO = "https://github.com/uberblick-ai/ablauf";
const NPM = "https://www.npmjs.com/package/@uberblick/ablauf";
const PRIMER = `${REPO}/blob/main/spike/PRIMER.md`;

// [group title or null for an ungrouped list, [href, label][]]
const SIDE: [string | null, [string, string][]][] = [
	[null, [["/", "Overview"], ["/motivation", "Motivation"], ["/uberblick", "With Uberblick"]]],
	["Kinds", kinds.map((k) => [`/${k.id}`, k.name])],
	["Guides", [["/guides/colours", "Customise colours"], ["/guides/tiptap", "Tiptap editor"]]],
];

function sidebar(path: string) {
	const link = ([href, label]: [string, string]) => `<a${href === path ? ' class="on"' : ""} href="${href}">${label}</a>`;
	return SIDE.map(([title, links]) =>
		title === null
			? `      <ul class="plain">${links.map((l) => `<li>${link(l)}</li>`).join("")}</ul>\n`
			: `      <ul><li><span class="grp">${title}</span><ul>${links.map((l) => `<li>${link(l)}</li>`).join("")}</ul></li></ul>\n`,
	).join("");
}

export function shell(page: { head: string; canonical: string; noindex: boolean; path: string; body: string }) {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/shared.css">
<link rel="stylesheet" href="/site.css">
${page.head}${page.canonical}${page.noindex ? '<meta name="robots" content="noindex">\n' : ""}</head>
<body>
<header class="top">
  <span class="mark"><a class="ub" href="https://next.uberblick.ai">uberblick</a><span>/</span><a href="/">ablauf</a></span>
  <nav aria-label="Site">
    <a href="${REPO}">GitHub</a>
  </nav>
</header>
<div class="layout">
  <details class="side" open>
    <summary>Contents</summary>
    <div class="side-in">
${sidebar(page.path)}    </div>
  </details>
  <main class="main">
${page.body}
    <section class="blk about" id="about">
      <h2>Who builds this.</h2>
      <p>Uberblick, ub-agents and the small libraries beside them, such as wireframe and ablauf, are made by a team in Berlin that likes to find out how far AI engineering can go. What holds up in our own work becomes a framework and a few products that run on GitHub alone, so a team no longer needs Notion, Linear or Jira beside it. Take them as a starting point for your own variant.</p>
      <div class="cols">
        <div><h3>ablauf</h3><ul>${kinds.map((k) => `<li><a href="/${k.id}">${k.name}</a></li>`).join("")}<li><a href="/guides/colours">Customise colours</a></li><li><a href="/guides/tiptap">Tiptap editor</a></li><li><a href="/motivation">Motivation</a></li><li><a href="/uberblick">With Uberblick</a></li><li><a href="${PRIMER}">Format primer</a></li><li><a href="${NPM}">npm package</a></li></ul></div>
        <div><h3>Uberblick</h3><ul><li><a href="https://next.uberblick.ai">Uberblick</a></li><li><a href="https://agents.uberblick.ai">ub-agents</a></li><li><a href="https://skills.uberblick.ai">Skills</a></li><li><a href="https://github.com/uberblick-ai/wireframe-md">wireframe.md</a></li></ul></div>
        <div><h3>Project</h3><ul><li><a href="${REPO}">GitHub</a></li><li><a href="${REPO}/blob/main/docs/plan.md">The plan</a></li><li><a href="${REPO}/blob/main/LICENSE">License</a></li></ul></div>
      </div>
    </section>
  </main>
</div>
<footer class="foot">
  <span>MIT license</span>
  <a href="${REPO}">Source</a>
  <a href="${NPM}">npm</a>
  <a href="https://next.uberblick.ai">Uberblick</a>
  <a href="https://agents.uberblick.ai">ub-agents</a>
  <a href="https://skills.uberblick.ai">Skills</a>
</footer>
<div class="toast" role="status" aria-live="polite"></div>
<script>
const toast = document.querySelector('.toast');
const copied = async (text, fallback) => {
  try { await navigator.clipboard.writeText(text); toast.textContent = 'Copied'; }
  catch { const r = document.createRange(); r.selectNodeContents(fallback); getSelection().removeAllRanges(); getSelection().addRange(r); toast.textContent = 'Select and copy'; }
  toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 1400);
};
// Copy takes the open tab's code, or the source when the picture is open.
for (const b of document.querySelectorAll('.copy')) b.addEventListener('click', () => {
  const box = b.closest('.tabs') ?? b.parentNode, open = box.querySelector('.panel:not([hidden]) code') ?? box.querySelector('code');
  copied(open.textContent, open);
});
for (const box of document.querySelectorAll('.tabs')) {
  const tabs = box.querySelectorAll('[role="tab"]');
  for (const tab of tabs) tab.addEventListener('click', () => {
    for (const t of tabs) { const on = t === tab; t.setAttribute('aria-selected', on); document.getElementById(t.getAttribute('aria-controls')).hidden = !on; }
  });
}
(() => {
  const side = document.querySelector('details.side'), wide = matchMedia('(min-width: 900px)');
  const sync = () => { if (wide.matches) side.open = true; };
  sync(); wide.addEventListener('change', sync);
})();
</script>
</body>
</html>
`;
}
