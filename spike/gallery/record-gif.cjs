// Records the Dependabot entry of the gallery prototype as playback-showcase.gif:
// "Clean merge", then "Tests failing", at twice the page size.
//   node spike/gallery/record-gif.cjs        (needs playwright and ffmpeg)
// The screencast only sends a frame when something changes, so each frame keeps
// its own timestamp and ffmpeg resamples them to a steady 15 fps.
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PAGE = `file://${path.join(__dirname, 'index.html')}#dependabot-clean-merge`;
const OUT = path.join(__dirname, 'frames');
const GIF = path.join(__dirname, 'playback-showcase.gif');
const Z = 2;

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 936 * Z, height: 536 * Z } });
  const p = await ctx.newPage();
  await p.goto(PAGE);
  // Show only the diagram and its caption; the blur behind the sheet is slow to screencast.
  await p.addStyleTag({
    content: `html{zoom:${Z}} #entry{backdrop-filter:none;background:#0b0e13;overflow:hidden} .sheet{margin:0;padding:0;max-width:936px;width:936px} #entry .top,.story,.footnote,details.all{display:none!important} .theatre{margin:0}`,
  });
  await p.waitForTimeout(500);
  await p.click('#etabs button:nth-child(1)');
  const s = await ctx.newCDPSession(p);
  const frames = [];
  s.on('Page.screencastFrame', (f) => {
    frames.push({ t: f.metadata.timestamp, d: f.data });
    s.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await s.send('Page.startScreencast', { format: 'jpeg', quality: 95, everyNthFrame: 1 });
  await p.waitForTimeout(10000);
  await p.click('#etabs button:nth-child(2)');
  await p.waitForTimeout(16500);
  await s.send('Page.stopScreencast');
  await b.close();

  let list = '';
  frames.forEach((f, i) => {
    const name = `${String(i).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(OUT, name), Buffer.from(f.d, 'base64'));
    const next = frames[i + 1];
    list += `file '${name}'\nduration ${Math.min(next ? next.t - f.t : 1.5, 1).toFixed(4)}\n`;
  });
  list += `file '${String(frames.length - 1).padStart(5, '0')}.jpg'\n`;
  fs.writeFileSync(path.join(OUT, 'list.txt'), list);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'list.txt'), '-vf',
    'fps=15,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
    GIF]);
  fs.rmSync(OUT, { recursive: true, force: true });
  console.log(`${frames.length} frames -> ${GIF}`);
})();
