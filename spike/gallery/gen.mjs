// Builds a one-file prototype of the workflow gallery from the ablauf playback spike.
//   node spike/gallery/gen.mjs > spike/gallery/index.html
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

process.removeAllListeners('warning');
const SPIKE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { render } = await import(`${SPIKE}/flow/index.ts`);
const player = stripTypeScriptTypes(readFileSync(`${SPIKE}/flow/player.ts`, 'utf8'))
  .replace(/^import .*$/gm, '').replace(/^export /gm, '');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const GROUPS = [
  { id: 'default', title: 'Default after ub-agents init', repo: 'one command, any repository',
    blurb: 'The one full loop on this page: five roles, the labels, and a person at every hard decision. Every workflow below is a change to it.' },
  { id: 'uberblick', title: 'Uberblick', repo: 'uberblick-ai/uberblick-2 · public',
    blurb: 'How we build Uberblick itself. Every issue starts from the product pages in our workspace, Codex writes the code, and a different model reviews it.' },
  { id: 'backend', title: 'CampfireFM backend', repo: 'Django API in production · private',
    blurb: 'Issues start from production data, Copilot is a second pair of eyes, and anything risky waits for a person to press merge.' },
  { id: 'studio', title: 'CampfireFM Studio', repo: 'Next.js editor · private',
    blurb: 'Work lands on milestone branches, the preview deploy is a gate, and the loop reports every step in Slack.' },
];
const W = [
  { slug: 'default', flow: 'loop', group: 'default', hero: true, name: 'The default ub-agents loop',
    intent: 'Label an issue. Get back a reviewed, merged pull request.', for: 'Every new repository' },
  { slug: 'split', group: 'default', name: 'Split a big issue',
    intent: "Work that won't fit one reviewable PR becomes sub-issues before anyone codes.", for: 'Teams with fuzzy tickets', also: 'Uberblick, Studio' },
  { slug: 'second-opinion', flow: 'issue-review-loop', group: 'default', name: 'Second opinion on the plan',
    intent: 'Another model checks the issue before anyone writes code. Mistakes are cheapest here.', for: 'Teams mixing Claude and Codex', also: 'Uberblick, Studio' },
  { slug: 'cap', flow: 'limit-rounds', group: 'default', name: 'Review rounds with a cap',
    intent: 'Three rounds of back and forth, then a person settles it.', for: 'Everyone running reviewers', also: 'Studio' },
  { slug: 'ask', flow: 'stop-labels', group: 'default', name: 'Ask a person, then carry on',
    intent: 'An agent stops on a real decision, asks one clear question, and resumes when you answer.', for: 'Everyone', also: 'all four' },
  { slug: 'outside', flow: 'approvals', group: 'default', name: 'Outside contributions, safely',
    intent: "Strangers' issues reach your agents only after a maintainer says go.", for: 'Open-source maintainers', also: 'on for public repositories' },

  { slug: 'dependabot', flow: 'dependabot', group: 'uberblick', name: 'Dependabot on autopilot',
    intent: 'Patch and minor bumps merge on their own once the tests pass, without anyone opening the PR. Majors, and failures one fix round can\'t settle, wait for you.', for: 'Maintainers buried in bump PRs', also: 'CampfireFM backend, Studio' },
  { slug: 'cross-model', group: 'uberblick', name: 'Reviewer on a different model',
    intent: 'Whoever wrote the code, the other model reviews it. Blind spots rarely overlap.', for: 'Teams with Claude and Codex' },
  { slug: 'intent', group: 'uberblick', name: 'Start from the product pages',
    intent: 'Agents read what the product should do from the workspace, not from a stale docs folder.', for: 'Teams using Uberblick' },
  { slug: 'shortcut', group: 'uberblick', name: 'Skip review, or hand it back',
    intent: 'A trivial change goes straight to merge checks; an unclear issue goes back to preparation.', for: 'Teams tired of ceremony', also: 'CampfireFM backend' },

  { slug: 'production', group: 'backend', name: 'Grounded in production data',
    intent: 'Before scoping a bug, the preparer checks monitoring, so the issue names the real cause.', for: 'Teams on call for their own code' },
  { slug: 'copilot', group: 'backend', name: 'Copilot as a second reviewer',
    intent: 'On a serious finding the reviewer asks Copilot too, and nothing merges until both are answered.', for: 'Teams who want another pair of eyes' },
  { slug: 'maintainer-merge', group: 'backend', name: 'Agents get it green, you press merge',
    intent: 'Schema changes and other risky diffs arrive fully checked, one click away from merged.', for: 'Teams with a production database', also: 'Studio' },

  { slug: 'milestones', group: 'studio', name: 'Milestone branches',
    intent: "Each milestone collects its PRs on its own branch; main only moves when the team merges the milestone.", for: 'Teams releasing in chunks' },
  { slug: 'preview', group: 'studio', name: 'The preview deploy is a gate',
    intent: 'Playwright and the preview deploy must pass at the exact head that merges.', for: 'Teams with preview deploys' },
  { slug: 'slack', group: 'studio', name: 'The loop tells the team',
    intent: 'Every start and every outcome lands in a Slack channel, so nobody polls GitHub.', for: 'Teams who live in Slack' },
];

const { SCENARIOS } = await import('./scenarios.mjs');
const { ABOUT, genericPrompt } = await import('./about.mjs');
const kebab = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const data = {};
for (const w of W) {
  if (!w.flow) continue;
  const src = readFileSync(`${SPIKE}/play/${w.flow}.flow`, 'utf8');
  const at = src.search(/^play\s*$/m);
  const base = at < 0 ? src : src.slice(0, at);
  const list = SCENARIOS[w.slug] ?? (at < 0 ? [] : [{ name: 'A run', play: src.slice(at).replace(/^play\s*\n/, '') }]);
  w.card = render(base + (list[0] ? '\nplay\n' + list[0].play.replace(/^\n/, '') + '\n' : ''), { idPrefix: `c-${w.slug}`, scheme: 'dark' }).svg;
  w.big = render(base + (list[0] ? '\nplay\n' + list[0].play.replace(/^\n/, '') + '\n' : ''), { idPrefix: `b-${w.slug}`, scheme: 'dark' }).svg;
  data[w.slug] = list.map((sc) => {
    const full = base + '\nplay\n' + sc.play.replace(/^\n/, '') + '\n';
    const r = render(full, { idPrefix: 'x', scheme: 'dark' });
    if (r.diagnostics.length) throw new Error(w.slug + '/' + sc.name + JSON.stringify(r.diagnostics));
    const lines = full.split('\n');
    const steps = r.timeline.map(({ parts, ms, caption, line }) => {
      const m = /^\s*step\s+("([^"]*)"|\S+)/.exec(lines[line - 1] ?? '');
      const id = m ? (m[2] ?? m[1]) : '';
      const cut = caption.indexOf(' | ');
      const pretty = id === 'start' ? 'Maintainer' : id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');
      const who = cut >= 0 ? caption.slice(0, cut) : caption ? pretty : 'Loop';
      const say = cut >= 0 ? caption.slice(cut + 3) : caption || 'labels it ' + id;
      return { parts, ms, caption: say, who };
    });
    return { name: sc.name, id: kebab(sc.name), steps };
  });
}

const card = (w) => `
<article class="card${w.hero ? ' hero' : ''}${w.flow ? '' : ' text'}${data[w.slug]?.length ? ' plays' : ''}" data-slug="${w.slug}" tabindex="0">
  ${w.card ? `<div class="stage">${w.card}</div>` : ''}
  <div class="meta">
    <h3>${esc(w.name)}</h3>
    <p class="intent">${esc(w.intent)}</p>
    ${w.also ? `<p class="also">Also in: ${esc(w.also)}</p>` : ''}
  </div>
</article>`;

const sorted = GROUPS.map((g) => [g, W.filter((w) => w.group === g.id)]);

const entries = W.filter((w) => w.flow).map((w) => `
<template id="t-${w.slug}">${w.big}</template>`).join('');

process.stdout.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Workflows · ub-agents (prototype)</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--page:#090c11;--card:#10151c;--edge:#1f2832;--fg:#e7ecf2;--mute:#8d98a7;--glow:#6ff0cf;--amber:#f2b45a}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--fg);font:15px/1.5 "IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;
  background-image:radial-gradient(1200px 500px at 20% -10%,rgba(111,240,207,.13),transparent 60%),radial-gradient(900px 500px at 95% 0%,rgba(242,180,90,.10),transparent 60%),radial-gradient(rgba(255,255,255,.05) 1px,transparent 1px);
  background-size:auto,auto,22px 22px;min-height:100vh}
header{display:flex;align-items:center;gap:22px;max-width:1240px;margin:0 auto;padding:18px 24px}
.brand{font:600 15px/1 "IBM Plex Mono",ui-monospace,Menlo,monospace;letter-spacing:.02em}
.brand b{color:var(--glow)}
header nav{display:flex;gap:18px;color:var(--mute);font-size:14px}
header nav span.on{color:var(--fg)}
.hero{max-width:1240px;margin:0 auto;padding:56px 24px 24px}
.hero .kick{font:500 12px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--glow)}
.hero h1{font-size:clamp(34px,5vw,60px);line-height:1.05;margin:14px 0 14px;letter-spacing:-.02em;max-width:16ch}
.hero h1 em{font-style:normal;background:linear-gradient(90deg,var(--glow),var(--amber));-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p{color:var(--mute);font-size:18px;max-width:58ch;margin:0}
main{max-width:1240px;margin:0 auto;padding:8px 24px 80px}
h2{font:500 12px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--mute);margin:44px 0 14px;display:flex;align-items:center;gap:12px}
h2::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--edge),transparent)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:18px}
.card{position:relative;background:linear-gradient(180deg,#121921,#0e1319);border:1px solid var(--edge);border-radius:16px;overflow:hidden;cursor:pointer;
  transition:transform .25s ease,border-color .25s ease,box-shadow .25s ease;outline:none}
.card:hover,.card:focus-visible{transform:translateY(-4px);border-color:rgba(111,240,207,.45);box-shadow:0 18px 50px -18px rgba(111,240,207,.35),0 0 0 1px rgba(111,240,207,.15) inset}
.card.text{cursor:default}
.card.text:hover{transform:none;border-color:var(--edge);box-shadow:none}
.stage{height:260px;display:flex;align-items:center;justify-content:center;padding:14px;background:radial-gradient(400px 200px at 50% 40%,rgba(111,240,207,.05),transparent 70%);border-bottom:1px solid var(--edge)}
.stage svg{max-width:100%;max-height:100%;width:auto;height:auto}
.soon{font:12px "IBM Plex Mono",ui-monospace,monospace;color:#4b5563;border:1px dashed #263040;border-radius:10px;padding:10px 14px}
.meta{padding:16px 18px 18px}
.for{margin:0;font:500 11px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--amber)}
.card h3{margin:8px 0 4px;font-size:19px;letter-spacing:-.01em}
.intent{margin:0;color:var(--mute)}
.tick{margin:12px 0 0;font:12px/1.4 "IBM Plex Mono",ui-monospace,monospace;color:#6b7686;display:flex;gap:8px;align-items:center;min-height:17px}
.tick .dot{width:7px;height:7px;border-radius:50%;background:#3a4452;flex:none}
.card.plays .tick .dot{background:var(--glow);box-shadow:0 0 10px var(--glow);animation:pulse 1.4s ease-in-out infinite}
.card.plays .tick{color:#b9c4d0}
@keyframes pulse{50%{opacity:.35}}
/* ablauf: transparent ground, a glowing current step */
.ab{--ab-bg:transparent;--ab-play:var(--glow)}
.ab .ab-on rect:not(.gap),.ab .ab-on path.e{filter:drop-shadow(0 0 6px rgba(111,240,207,.75))}
.ab.ab-playing [data-ab-part]:not(.ab-on):not(.ab-done){opacity:.22!important}
.ab [data-ab-part]{transition:opacity .35s ease}
.ab .ab-done rect:not(.gap){stroke:rgba(111,240,207,.45)}
/* entry view */
#entry{position:fixed;inset:0;z-index:5;background:rgba(6,8,12,.86);backdrop-filter:blur(8px);display:none;overflow:auto}
#entry.open{display:block;animation:fade .25s ease}
@keyframes fade{from{opacity:0}}
.sheet{max-width:1000px;margin:22px auto;padding:0 32px 80px}
.top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.top h1{margin:4px 0 4px;font-size:clamp(22px,2.6vw,28px);letter-spacing:-.015em}
.top>div:first-child{flex:1;min-width:0}
.top p{margin:0;color:var(--mute);font-size:14.5px}
.close{font:inherit;color:var(--fg);background:#151c25;border:1px solid var(--edge);border-radius:999px;height:36px;padding:0 14px;cursor:pointer}
.theatre{display:grid;grid-template-columns:1fr;gap:10px;margin-top:16px}
@media (max-width:980px){.theatre{grid-template-columns:1fr}}
.big{background:#0c1117;border:1px solid var(--edge);border-radius:12px;padding:20px 28px;display:flex;align-items:center;justify-content:center}
.big svg{max-width:100%;height:auto}
.log{background:#0a0d12;border:1px solid var(--edge);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.logbar{display:flex;align-items:center;gap:6px;padding:10px 12px;border-bottom:1px solid var(--edge);font:12px "IBM Plex Mono",ui-monospace,monospace;color:var(--mute)}
.logbar i{width:10px;height:10px;border-radius:50%;background:#252d38;display:inline-block}
.logbar span{margin-left:8px}
.lines{list-style:none;margin:0;padding:10px 28px 18px;font:12.5px/1.5 "IBM Plex Mono",ui-monospace,monospace;flex:1}
.lines li{display:grid;grid-template-columns:170px 1fr;gap:16px;padding:9px 0;border-bottom:1px solid #141a22;color:#aeb8c5;animation:slide .3s ease}
.lines li b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lines li .msg{color:#aeb8c5}
@media (max-width:640px){.lines li{grid-template-columns:1fr;gap:2px}}
.lhead{display:grid;grid-template-columns:118px 1fr;gap:12px;padding:10px 14px 6px;border-bottom:1px solid var(--edge);font:500 10.5px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:#4f5a68}
.lines .head{color:#4f5a68;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;padding:0 0 6px;animation:none}
.lines li .t{color:#4f5a68}
.lines li b{color:var(--glow);font-weight:500}
.lines li.cur .msg::after{content:"▍";color:var(--glow);animation:pulse 1s steps(1) infinite;margin-left:2px}
@keyframes slide{from{opacity:0;transform:translateY(4px)}}
.controls{display:flex;gap:8px;align-items:center;padding:6px 24px 12px}
.controls button{font:12px "IBM Plex Mono",ui-monospace,monospace;color:var(--fg);background:#121821;border:1px solid var(--edge);border-radius:8px;height:30px;padding:0 10px;cursor:pointer}
.controls button.main{min-width:68px}
.controls button:disabled{opacity:.35;cursor:default}
.segs b{cursor:pointer}
.segs{flex:1;display:flex;gap:3px}
.segs b{flex:1;height:4px;border-radius:2px;background:#202833}
.segs b.done{background:rgba(111,240,207,.45)}
.segs b.on{background:var(--glow);box-shadow:0 0 8px var(--glow)}
.note{margin-top:26px;color:var(--mute);font-size:13px}
.group{margin-top:8px}
h2 .repo{order:3;font-size:11px;letter-spacing:.06em;text-transform:none;color:#5d6876;border:1px solid var(--edge);border-radius:999px;padding:4px 9px}
h2{font-size:13px;color:var(--fg)}
.blurb{margin:-4px 0 16px;color:var(--mute);max-width:70ch}
.card.hero{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1.6fr) minmax(260px,1fr);border-color:rgba(111,240,207,.22)}
.card.hero .stage{height:520px;border-bottom:0;border-right:1px solid var(--edge)}
.card.hero .meta{display:flex;flex-direction:column;justify-content:center;padding:28px}
.card.hero h3{font-size:28px}
.card.hero .intent{font-size:17px}
.card.hero .tick{font-size:13px;min-height:60px;align-items:flex-start}
@media (max-width:900px){.card.hero{grid-template-columns:1fr}.card.hero .stage{height:380px;border-right:0;border-bottom:1px solid var(--edge)}}
.also{margin:10px 0 0;font:11px/1.4 "IBM Plex Mono",ui-monospace,monospace;color:#7f8a99}
.hero p code{font:15px "IBM Plex Mono",ui-monospace,monospace;color:var(--fg);background:#141b24;border:1px solid var(--edge);border-radius:6px;padding:1px 6px}
.card.text .stage{height:150px}
.tabs{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0 0}
.tabs button{font:500 11.5px/1 "IBM Plex Mono",ui-monospace,monospace;color:var(--mute);background:#0d1218;border:1px solid var(--edge);border-radius:999px;padding:7px 11px;cursor:pointer;transition:all .2s}
.tabs button:hover{color:var(--fg);border-color:#334050}
.tabs button.on{color:#06110e;background:var(--glow);border-color:var(--glow);box-shadow:0 0 14px rgba(111,240,207,.45)}
.logtabs{display:flex;gap:0;border-bottom:1px solid var(--edge);overflow-x:auto}
.logtabs button{font:500 12px/1 "IBM Plex Mono",ui-monospace,monospace;color:var(--mute);background:none;border:0;border-bottom:2px solid transparent;padding:11px 16px;cursor:pointer;white-space:nowrap}
.logtabs button:hover{color:var(--fg)}
.logtabs button.on{color:var(--glow);border-bottom-color:var(--glow);text-shadow:0 0 10px rgba(111,240,207,.5)}
.url{display:inline-block;margin-top:10px;font:12px "IBM Plex Mono",ui-monospace,monospace;color:#7f8a99;background:#0d1218;border:1px solid var(--edge);border-radius:6px;padding:4px 8px;cursor:pointer}
.url:hover{color:var(--fg)}
.story{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:48px;margin-top:52px}
@media (max-width:980px){.story{grid-template-columns:1fr}}
.prose h3{font:500 12px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--mute);margin:0 0 14px}
.prose h3:not(:first-child){margin-top:28px}
.prose p{margin:0 0 14px;font-size:15.5px;line-height:1.65;color:#c9d2dc;max-width:66ch}
.prose code{font:14px "IBM Plex Mono",ui-monospace,monospace;background:#141b24;border:1px solid var(--edge);border-radius:5px;padding:1px 5px;color:var(--fg)}
.prose ul{margin:0 0 22px;padding:0;list-style:none}
.prose li{position:relative;padding-left:22px;margin:0 0 8px;color:#c9d2dc;font-size:15px}
.prose li::before{content:"";position:absolute;left:4px;top:.6em;width:7px;height:7px;border-radius:50%;background:var(--glow);box-shadow:0 0 8px var(--glow)}
.prose .person{border-left:2px solid var(--amber);padding:4px 0 4px 14px;color:#d8c7a6}
.adopt{align-self:start;position:sticky;top:20px;background:#0c1117;border:1px solid var(--edge);border-radius:12px;padding:24px}
.cta{display:flex;justify-content:space-between;align-items:center;text-decoration:none;font-weight:600;font-size:15px;color:#06110e;background:var(--glow);border-radius:9px;padding:11px 14px;box-shadow:0 8px 24px -14px rgba(111,240,207,.6);transition:transform .2s,box-shadow .2s}
.cta:hover{transform:translateY(-2px);box-shadow:0 16px 40px -12px rgba(111,240,207,.8)}
.cta span{transition:transform .2s}.cta:hover span{transform:translateX(4px)}
.adopthead{margin:0 0 12px;font:500 11px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--mute)}
.cta.alt{margin-top:8px;background:#141c25;color:var(--fg);border:1px solid #2a3542;box-shadow:none}
.cta.alt:hover{border-color:var(--glow);box-shadow:0 10px 30px -14px rgba(111,240,207,.5)}
.footnote{margin:40px 0 0;padding-top:16px;border-top:1px solid var(--edge);font-size:12.5px;color:#6b7686}
.footnote a{color:var(--mute);text-decoration:underline;text-decoration-color:#334050}
.footnote a:hover{color:var(--fg)}
.whatis{margin:0 0 14px;font-size:12.5px;color:#7f8a99;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.whatis b{color:var(--fg);font-weight:600}
.whatis a{color:var(--glow);text-decoration:none;white-space:nowrap}
.whatis a:hover{text-decoration:underline}
.now{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:14px;row-gap:2px;padding:12px 24px 4px;min-height:64px;align-content:start}
.now .nstep{grid-row:1/3;align-self:start;font:500 11px/20px "IBM Plex Mono",ui-monospace,monospace;color:#5d6876;border:1px solid var(--edge);border-radius:999px;padding:0 8px;min-width:38px;text-align:center}
.now .nstep:empty{visibility:hidden}
.now b{font:500 13px/20px "IBM Plex Mono",ui-monospace,monospace;color:var(--glow)}
.now span:last-child{font-size:16px;line-height:1.45;color:var(--fg)}
.all{border-top:1px solid var(--edge)}
.all summary{cursor:pointer;padding:12px 28px;font:500 11px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);list-style:none}
.all summary::-webkit-details-marker{display:none}
.all summary::before{content:"▸ ";color:#5d6876}
.all[open] summary::before{content:"▾ "}
.big svg{max-height:max(240px,calc(100vh - 420px))}
.tabrow{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--edge);padding-right:14px}
.tabrow .logtabs{border-bottom:0}
.tabrow .url{margin:0;white-space:nowrap;font-size:11px}
@media (max-width:760px){.tabrow .url{display:none}}
.alt-line{margin:10px 2px 0;font-size:12.5px;color:var(--mute);white-space:nowrap}
.alt-line a,.linkish{color:var(--glow);text-decoration:none;background:none;border:0;padding:0;font:inherit;cursor:pointer}
.alt-line a:hover,.linkish:hover{text-decoration:underline}
.hint{margin:12px 0;color:var(--mute);font-size:13px;line-height:1.5}
.copy{margin-top:14px;width:100%;font:12px "IBM Plex Mono",ui-monospace,monospace;color:var(--fg);background:#0d1218;border:1px solid var(--edge);border-radius:10px;height:36px;cursor:pointer}
.copy:hover{border-color:#334050}
.article{display:block;margin-top:16px;padding-top:14px;border-top:1px solid var(--edge);color:var(--amber);text-decoration:none;font-size:14px}
.article:hover{text-decoration:underline}
.article::before{content:"Read the story";display:block;font:500 11px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:#6b7686;margin-bottom:6px}
.runs{margin:14px 0 0;font:12px/1.5 "IBM Plex Mono",ui-monospace,monospace;color:#7f8a99}
footer{max-width:1240px;margin:0 auto;padding:0 24px 40px;color:#5d6876;font-size:13px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
.topbtns{display:flex;gap:8px;flex:none}
.iconbtn{width:36px;height:36px;display:grid;place-items:center;color:var(--mute);background:#151c25;border:1px solid var(--edge);border-radius:999px;cursor:pointer;position:relative}
.iconbtn:hover{color:var(--fg);border-color:#334050}
.iconbtn.ok{color:var(--glow);border-color:rgba(111,240,207,.5)}
.iconbtn.ok::after{content:"Link copied";position:absolute;top:42px;right:0;white-space:nowrap;font:11px "IBM Plex Mono",ui-monospace,monospace;color:var(--glow)}
.top .via{color:#6b7686}
.top .via a{color:var(--fg);text-decoration:underline;text-decoration-color:#334050}
.top .via a:hover{text-decoration-color:var(--glow)}
/* calmer wall */
.hero{padding:40px 24px 8px}
.hero h1{font-size:clamp(28px,3.6vw,42px);max-width:none;white-space:nowrap}
.hero p{font-size:16px}
.grid{grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:22px}
.stage{height:170px;padding:16px 18px}
.meta{padding:14px 16px 16px}
.card h3{font-size:16px;margin:0 0 4px}
.intent{font-size:13.5px;line-height:1.45}
.also{margin:8px 0 0;font-size:12px;color:#5d6876}
.card:hover,.card:focus-visible{transform:translateY(-2px)}
.card.hero{grid-template-columns:minmax(0,1.4fr) minmax(240px,1fr)}
.card.hero .stage{height:320px;padding:20px}
.card.hero .meta{padding:24px 28px}
.card.hero h3{font-size:22px}
.card.hero .intent{font-size:15px}
h2{margin:52px 0 12px}
.grid{align-items:start}
.card.text .meta{padding:16px}
.card.text h3::before{content:"diagram to come";display:block;margin-bottom:8px;font:500 10px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:#4b5563}
.blurb{font-size:14px}
</style>
</head>
<body>
<header><span class="brand"><b>●</b> ub-agents</span><nav><span>Docs</span><span class="on">Workflows</span><span>GitHub</span></nav></header>
<section class="hero">
  <div class="kick">Workflow gallery · prototype</div>
  <h1>Loops we <em>actually run</em></h1>
  <p>One loop from <code>ub-agents init</code>, and the changes we make to it on Uberblick and CampfireFM. Each one plays its runs and ends with a prompt to adopt it.</p>
</section>
<main>
${sorted.map(([g, ws]) => `<section class="group"><h2>${esc(g.title)}<span class="repo">${esc(g.repo)}</span></h2><p class="blurb">${esc(g.blurb)}</p><div class="grid">${ws.map(card).join('')}</div></section>`).join('\n')}
<p class="note">Prototype: diagrams are drawn by the ablauf playback spike (ablauf PR #65); run captions are illustrative. Cards without a diagram get one before launch.</p>
</main>
<footer>agents.uberblick.ai/workflows · prototype, not live</footer>
<div id="entry" role="dialog" aria-modal="true" aria-labelledby="etitle">
  <div class="sheet">
    <div class="top"><div><h1 id="etitle"></h1><p><span id="eintent"></span> <span class="via">Built on <a href="https://agents.uberblick.ai" target="_blank" rel="noopener">ub-agents</a>, a minimal agent loop for experienced developers: plain GitHub labels, your own coding agents, nothing to host.</span></p></div><div class="topbtns"><button class="iconbtn" id="eurl" type="button" title="Copy link to this run" aria-label="Copy link to this run"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg></button><button class="close" id="eclose" type="button">Close</button></div></div>
    <div class="theatre">
      <div class="big" id="ebig"></div>
      <div class="log">
        <div class="tabrow"><div class="logtabs" id="etabs" role="tablist"></div></div>
        <div class="now" aria-live="polite"><span class="nstep" id="nowstep"></span><b id="nowwho"></b><span id="nowsay"></span></div>
        <div class="controls"><button id="eprev" type="button" aria-label="Previous step">&lt;</button><button id="eplay" type="button" class="main">Pause</button><button id="enext" type="button" aria-label="Next step">&gt;</button><div class="segs" id="esegs"></div></div>
        <details class="all"><summary>All steps</summary><ol class="lines" id="elines"></ol></details>
      </div>
    </div>
    <div class="story">
      <div class="prose" id="eprose"></div>
      <aside class="adopt">
        <p class="adopthead">Adopt it with Claude</p>
        <a class="cta" id="eadopt" href="#">Open in Claude Code <span>→</span></a>
        <p class="alt-line">No desktop app? <a id="eadoptweb" href="#" target="_blank" rel="noopener">Use claude.ai</a></p>
        <button class="copy" id="ecopy" type="button">Copy the prompt</button>
        <a class="article" id="earticle" href="#" target="_blank" rel="noopener" hidden></a>
        <p class="runs" id="eruns" hidden></p>
      </aside>
    </div>
    <p class="footnote">Generated with the <a href="https://skills.uberblick.ai/skills/ub-agents-flow.html" target="_blank" rel="noopener">ub-agents-flow skill</a>, which can keep your own loop's version in your <a href="https://uberblick.ai" target="_blank" rel="noopener">Uberblick</a> knowledge base. Requires <a href="https://agents.uberblick.ai" target="_blank" rel="noopener">ub-agents</a> and <a href="https://ablauf.uberblick.ai" target="_blank" rel="noopener">ablauf</a>.</p>
  </div>
</div>
${entries}
<script>
${player}
const DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')};
const META = ${JSON.stringify(Object.fromEntries(W.map((w) => [w.slug, { name: w.name, intent: w.intent, for: w.for, about: ABOUT[w.slug] ?? null, prompt: ABOUT[w.slug]?.prompt ?? genericPrompt(w.name, 'https://agents.uberblick.ai/workflows/' + w.slug + '/') }]))).replace(/</g, '\\u003c')};
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SITE = 'agents.uberblick.ai/workflows/';
const entry = document.getElementById('entry');
const cards = new Map();
// Cards: play one scenario, then move to the next tab, unless a person picked a tab.
for (const el of document.querySelectorAll('.card.plays')) {
  const slug = el.dataset.slug, list = DATA[slug], svg = el.querySelector('svg.ab');
  const tabs = [...el.querySelectorAll('.tabs button')];
  const c = { i: 0, pinned: false, p: null, visible: false, timer: 0 };
  const load = (i) => {
    c.i = i; c.p?.destroy(); clearTimeout(c.timer);
    tabs.forEach((t, k) => { t.classList.toggle('on', k === i); t.setAttribute('aria-selected', k === i); });
    const steps = list[i].steps;
    c.p = createPlayer(svg, steps, { loop: c.pinned || list.length === 1, onChange(p) {
      if (!p.playing && p.index === steps.length - 1 && !c.pinned && list.length > 1) c.timer = setTimeout(() => { load((c.i + 1) % list.length); if (c.visible) c.p.play(); }, 1600);
    }});
  };
  tabs.forEach((t, k) => t.onclick = (e) => { e.stopPropagation(); c.pinned = true; load(k); if (!still) c.p.play(); });
  load(0);
  cards.set(el, c);
}
const pauseCards = () => cards.forEach((c) => { clearTimeout(c.timer); c.p.pause(); });
if (!still) {
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    const c = cards.get(e.target); c.visible = e.isIntersecting;
    if (e.isIntersecting && !entry.classList.contains('open')) { if (!c.p.playing) c.p.play(); } else if (!e.isIntersecting) { clearTimeout(c.timer); c.p.pause(); }
  }), { threshold: .45 });
  cards.forEach((_, el) => io.observe(el));
}
// Entry view: one tab per scenario; every flow and scenario has its own address.
let ep, current = null;
function show(slug, si, fromHash) {
  const list = DATA[slug]; if (!list?.length) return;
  si = Math.max(0, Math.min(si, list.length - 1));
  pauseCards();
  const sc = list[si], steps = sc.steps;
  if (current !== slug) {
    document.getElementById('etitle').textContent = META[slug].name;
    document.getElementById('eintent').textContent = META[slug].intent;
    const big = document.getElementById('ebig'); big.replaceChildren(document.getElementById('t-' + slug).content.cloneNode(true));
    const bsvg = big.querySelector('svg'); const vb = bsvg?.viewBox?.baseVal; if (vb?.width) bsvg.style.width = 'min(100%, ' + Math.round(vb.width * 0.78) + 'px)';
    current = slug;
    const m = META[slug], prose = document.getElementById('eprose');
    const inline = (t) => { const f = document.createDocumentFragment(); t.split(/\x60([^\x60]+)\x60/).forEach((part, k) => f.append(k % 2 ? Object.assign(document.createElement('code'), { textContent: part }) : part)); return f; };
    prose.replaceChildren();
    if (m.about) {
      const h = (t) => Object.assign(document.createElement('h3'), { textContent: t });
      prose.append(h('Why it exists'));
      m.about.why.forEach((t) => { const p = document.createElement('p'); p.append(inline(t)); prose.append(p); });
      prose.append(h('What you gain'));
      const ul = document.createElement('ul'); m.about.gains.forEach((t) => { const li = document.createElement('li'); li.append(inline(t)); ul.append(li); }); prose.append(ul);
      prose.append(h('Where a person steps in'));
      const pp = Object.assign(document.createElement('p'), { className: 'person', textContent: m.about.person }); prose.append(pp);
    } else {
      const p = document.createElement('p'); p.textContent = m.intent + ' The full story for this workflow is still to be written.'; prose.append(p);
    }
    const link = 'claude-cli://open?q=' + encodeURIComponent(m.prompt);
    document.getElementById('eadopt').href = link;
    document.getElementById('eadoptweb').href = 'https://claude.ai/new?q=' + encodeURIComponent(m.prompt);
    const copy = document.getElementById('ecopy');
    copy.textContent = 'Copy the prompt';
    copy.onclick = () => { try { navigator.clipboard.writeText(m.prompt).then(() => { copy.textContent = 'Copied'; }, () => {}); } catch (e) {} };
    const art = document.getElementById('earticle'), runs = document.getElementById('eruns');
    art.hidden = !m.about?.article; if (m.about?.article) { art.href = m.about.article.url; art.textContent = m.about.article.title + ' →'; }
    runs.hidden = !m.about?.runs; if (m.about?.runs) runs.textContent = 'We run it on: ' + m.about.runs;
  }
  const hash = list.length > 1 ? slug + '-' + sc.id : slug;
  const url = SITE + slug + '/' + (list.length > 1 ? sc.id + '/' : '');
  const u = document.getElementById('eurl'); u.title = 'Copy link: ' + url;
  u.onclick = () => { try { navigator.clipboard.writeText('https://' + url).then(() => { u.classList.add('ok'); setTimeout(() => u.classList.remove('ok'), 1200); }, () => {}); } catch (e) {} };
  if (!fromHash && location.hash !== '#' + hash) history.replaceState(null, '', '#' + hash);
  const tabs = document.getElementById('etabs');
  tabs.hidden = list.length < 2;
  tabs.replaceChildren(...list.map((x, k) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.textContent = x.name; b.className = k === si ? 'on' : ''; b.setAttribute('aria-selected', k === si); b.onclick = () => show(slug, k); return b; }));
  const lines = document.getElementById('elines'), segs = document.getElementById('esegs'), btn = document.getElementById('eplay');
  lines.replaceChildren(); segs.replaceChildren(...steps.map(() => document.createElement('b')));
  const prev = document.getElementById('eprev'), next = document.getElementById('enext');
  ep?.destroy();
  ep = createPlayer(document.querySelector('#ebig svg.ab'), steps, { onChange(p) {
    const end = p.index === steps.length - 1;
    btn.textContent = p.playing ? 'Pause' : end ? 'Replay' : 'Play';
    prev.disabled = p.index <= 0; next.disabled = end;
    [...segs.children].forEach((b, k) => b.className = k === p.index ? 'on' : k < p.index ? 'done' : '');
    while (lines.children.length > p.index + 1) lines.lastChild.remove();
    for (let k = lines.children.length; k <= p.index; k++) {
      const s = steps[k], li = document.createElement('li');
      li.innerHTML = '<b></b><span class="msg"></span>';
      li.querySelector('b').textContent = s.who;
      li.querySelector('.msg').textContent = s.caption;
      lines.append(li);
    }
    lines.querySelector('.cur')?.classList.remove('cur'); lines.lastChild?.classList.add('cur');
    const st = steps[p.index];
    document.getElementById('nowstep').textContent = p.index >= 0 ? (p.index + 1) + '/' + steps.length : '';
    document.getElementById('nowwho').textContent = st ? st.who : '';
    document.getElementById('nowsay').textContent = st ? st.caption : 'Press play to watch this run';
    lines.scrollTop = lines.scrollHeight;
  }});
  const replay = () => { ep.reset(); ep.play(); };
  btn.onclick = () => ep.playing ? ep.pause() : (ep.index === steps.length - 1 ? replay() : ep.play());
  prev.onclick = () => { ep.pause(); ep.previous(); };
  next.onclick = () => { ep.pause(); ep.next(); };
  [...segs.children].forEach((b, k) => b.onclick = () => { ep.pause(); ep.seek(k); });
  entry.classList.add('open'); document.body.style.overflow = 'hidden';
  if (!still) ep.play(); else ep.seek(steps.length - 1);
}
function close(fromHash) {
  entry.classList.remove('open'); document.body.style.overflow = ''; ep?.pause(); current = null;
  if (!fromHash && location.hash) history.replaceState(null, '', location.pathname + location.search);
  if (!still) cards.forEach((c, el) => { const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) c.p.play(); });
}
function route() {
  const h = location.hash.slice(1);
  if (!h) { if (entry.classList.contains('open')) close(true); return; }
  const slug = Object.keys(DATA).filter((s) => h === s || h.startsWith(s + '-')).sort((a, b) => b.length - a.length)[0];
  if (!slug || !DATA[slug].length) return;
  const rest = h.slice(slug.length + 1);
  const si = Math.max(0, DATA[slug].findIndex((x) => x.id === rest));
  show(slug, si, true);
}
document.querySelectorAll('.card').forEach((el) => {
  if (!DATA[el.dataset.slug]?.length) return;
  const go = () => { const c = cards.get(el); show(el.dataset.slug, c ? c.i : 0); };
  el.onclick = go;
  el.onkeydown = (e) => { if (e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(); } };
});
document.getElementById('eclose').onclick = () => close();
addEventListener('keydown', (e) => {
  if (!entry.classList.contains('open')) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowLeft') document.getElementById('eprev').click();
  else if (e.key === 'ArrowRight') document.getElementById('enext').click();
});
addEventListener('hashchange', route);
route();
</script>
</body>
</html>
`);
