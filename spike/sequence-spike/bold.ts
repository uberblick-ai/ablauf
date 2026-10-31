// Two departures from the lifeline-and-arrow look, for the same model.
// bars: each message is a tone bar spanning sender to receiver lane.
// ladder: a numbered list of steps with a mini lane map per row.
import { CHAR } from "../flow/grid.ts";
import type { Tone } from "../flow/parse.ts";
import { esc, svgStyle } from "../flow/svg.ts";
import { type Model, tw, wrap } from "./sequence.ts";

const PAD = 16;
const LEAD = 15;
const MONO = CHAR.mono12;
type Scheme = "light" | "dark";

const EXTRA = [
	".ab .lane{fill:var(--neutral-bg);opacity:.4}",
	".ab .cap-b{font-weight:600;fill:var(--ink)}",
	".ab .num{fill:var(--muted)}",
	".ab .sec-rule{stroke:var(--line);stroke-width:1}",
	".ab .grp-soft{fill:var(--neutral-bg);opacity:.55}.ab .grp-split{stroke:var(--neutral);stroke-opacity:.35;stroke-width:1;stroke-dasharray:2 4}",
	".ab .note-soft{fill:var(--rework-bg)}",
	".ab .resp{fill:var(--bg);stroke:var(--muted);stroke-width:1.2;stroke-dasharray:4 3}",
	".ab .chev{fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}",
	".ab .track{stroke:var(--line);stroke-width:1.2}",
	".ab .row-rule{stroke:var(--line);stroke-width:1;opacity:.6}",
];

const svgDoc = (scheme: Scheme, width: number, height: number, parts: string[]) =>
	`<svg xmlns="http://www.w3.org/2000/svg" class="ab ab-${scheme}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n${svgStyle(scheme, undefined, EXTRA)}\n<rect width="${width}" height="${height}" fill="var(--bg)"/>\n${parts.join("\n")}\n</svg>\n`;

const toneClass = (t: Tone | undefined) => (!t || t === "ink" ? "muted" : t);
const textTone = (t: Tone | undefined) => (!t || t === "ink" || t === "neutral" ? "" : ` t-${t}`);

export function renderBars(model: Model, width: number, scheme: Scheme) {
	const ps = model.participants;
	const n = ps.length;
	const GUT = 24;
	const colW = (width - 2 * PAD - GUT) / n;
	const xs = ps.map((_, i) => PAD + GUT + colW * (i + 0.5));
	const under: string[] = [];
	const body: string[] = [];
	const heads = ps.map((p) => wrap(p.title, colW - 12, MONO));
	const headH = Math.max(...heads.map((h) => h.length)) * LEAD + 14;
	ps.forEach((p, i) => {
		body.push(`<circle cx="${xs[i]}" cy="${PAD + 3}" r="4" class="t-${toneClass(p.tone)}"/>`);
		body.push(heads[i].map((l, k) => `<text x="${xs[i]}" y="${PAD + 24 + k * LEAD}" text-anchor="middle" class="m s12 b${textTone(p.tone)}">${esc(l)}</text>`).join(""));
	});
	let y = PAD + headH + 18;
	let step = 0;
	const groups: { top: number; lo: number; hi: number; kind: string; label: string; elses: { y: number; label: string }[] }[] = [];
	for (const it of model.items) {
		if (it.t === "section") {
			const label = it.title.toUpperCase();
			body.push(`<text x="${PAD}" y="${y + 12}" class="cap">${esc(label)}</text>`);
			body.push(`<path d="M${PAD + tw(label, CHAR.mono11 + 0.9) + 10},${y + 8} L${width - PAD},${y + 8}" class="sec-rule"/>`);
			y += 30;
		} else if (it.t === "open") {
			groups.push({ top: y, lo: 0, hi: n - 1, kind: it.kind, label: it.label, elses: [] });
			y += 28;
		} else if (it.t === "else") {
			groups[groups.length - 1]?.elses.push({ y, label: it.label });
			y += 28;
		} else if (it.t === "end") {
			const g = groups.pop();
			if (!g) continue;
			y += 2;
			const x0 = PAD + GUT - 4;
			const x1 = width - PAD;
			under.push(`<rect x="${x0}" y="${g.top}" width="${x1 - x0}" height="${y - g.top}" rx="10" class="grp-soft"/>`);
			body.push(`<text x="${x0 + 12}" y="${g.top + 18}" class="cap"><tspan class="cap-b">${esc(g.kind.toUpperCase())}</tspan>  ${esc(g.label.toUpperCase())}</text>`);
			for (const e of g.elses) {
				body.push(`<path d="M${x0 + 10},${e.y} L${x1 - 10},${e.y}" class="grp-split"/>`);
				body.push(`<text x="${x0 + 12}" y="${e.y + 17}" class="cap"><tspan class="cap-b">ELSE</tspan>  ${esc(e.label.toUpperCase())}</text>`);
			}
			y += 12;
		} else if (it.t === "note") {
			const lo = Math.min(...it.over);
			const lines = wrap(it.text, Math.min(260, width - xs[lo] - PAD));
			const w = Math.max(...lines.map((l) => tw(l))) + 24;
			const h = lines.length * LEAD + 12;
			const x = Math.max(PAD + GUT, Math.min(width - PAD - w, xs[lo] - 12));
			body.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" class="note-soft"/>`);
			body.push(`<rect x="${x}" y="${y}" width="3" height="${h}" rx="1.5" class="t-rework"/>`);
			body.push(lines.map((l, k) => `<text x="${x + 14}" y="${y + 19 + k * LEAD}" class="s12 t-rework">${esc(l)}</text>`).join(""));
			y += h + 12;
		} else if (it.t === "msg") {
			step++;
			const tone = it.dashed ? undefined : ps[it.from].tone;
			const a = xs[it.from];
			const b = xs[it.to];
			const H = 26;
			const self = it.from === it.to;
			const lo = self ? a - 13 : Math.min(a, b) - 13;
			const hi = self ? a + 44 : Math.max(a, b) + 13;
			// Labels inside full-height bars were tried and dropped: mixed heights read as noise.
			const fits = (false as boolean) && tw(it.label) <= hi - lo - (self ? 34 : 40);
			const cls = it.dashed ? "resp" : `k-${tone ?? "neutral"}`;
			body.push(`<text x="${PAD}" y="${y + 17}" class="m s11 num">${String(step).padStart(2, "0")}</text>`);
			body.push(`<rect x="${lo}" y="${y}" width="${hi - lo}" height="${H}" rx="${H / 2}" class="${cls}"/>`);
			// Source dot and a chevron at the receiving end show direction.
			const ink = it.dashed ? "muted" : toneClass(tone);
			const mid = y + H / 2;
			if (self) {
				body.push(`<circle cx="${a}" cy="${mid}" r="3.5" class="t-${ink}"/>`);
				body.push(`<path d="M${hi - 22},${mid - 5} a5,5 0 1 1 -1,6" class="chev e-${ink}"/>`);
			} else {
				const dir = b > a ? 1 : -1;
				body.push(`<circle cx="${a}" cy="${mid}" r="3.5" class="t-${ink}"/>`);
				body.push(`<path d="M${b - dir * 8},${mid - 5} L${b - dir * 2},${mid} L${b - dir * 8},${mid + 5}" class="chev e-${ink}"/>`);
			}
			const textCls = `s12${it.dashed ? " muted" : textTone(tone) ? `${textTone(tone)} b` : " b"}`;
			if (fits) {
				const tx = self ? a + 12 : (Math.min(a, b) + Math.max(a, b)) / 2;
				body.push(`<text x="${tx}" y="${mid + 4}"${self ? "" : ' text-anchor="middle"'} class="${textCls}">${esc(it.label)}</text>`);
				y += H + 10;
			} else {
				// Too long for its bar: the label sits just above, from the bar's left end.
				const lines = wrap(it.label, width - PAD - lo - 8);
				body.pop(); body.pop(); body.pop();
				body.push(lines.map((l, k) => `<text x="${lo + 10}" y="${y + 11 + k * LEAD}" class="${textCls}">${esc(l)}</text>`).join(""));
				const by = y + lines.length * LEAD + 2;
				body.push(`<rect x="${lo}" y="${by}" width="${hi - lo}" height="12" rx="6" class="${cls}"/>`);
				const m2 = by + 6;
				const dir = b > a ? 1 : -1;
				body.push(`<circle cx="${a}" cy="${m2}" r="3" class="t-${ink}"/>`);
				if (self) body.push(`<path d="M${hi + 6},${m2 - 6} a6,6 0 1 1 -2,10" class="chev e-${ink}"/><path d="M${hi + 1},${m2 + 1} L${hi + 4},${m2 + 4.5} L${hi - 0.5},${m2 + 6}" class="chev e-${ink}"/>`);
				else body.push(`<path d="M${b - dir * 6},${m2 - 3.5} L${b - dir * 2},${m2} L${b - dir * 6},${m2 + 3.5}" class="chev e-${ink}"/>`);
				y = by + 12 + 12;
			}
		}
	}
	xs.forEach((x, i) => {
		if (i % 2 === 0) under.unshift(`<rect x="${x - colW / 2 + 3}" y="${PAD - 8}" width="${colW - 6}" height="${y - PAD + 8}" rx="10" class="lane"/>`);
	});
	return svgDoc(scheme, width, y + PAD, [...under, ...body]);
}

export function renderLadder(model: Model, width: number, scheme: Scheme) {
	const ps = model.participants;
	const n = ps.length;
	const out: string[] = [];
	const under: string[] = [];
	// Legend: each participant's tone dot and name, wrapping across lines.
	let lx = PAD;
	let y = PAD + 10;
	ps.forEach((p) => {
		const w = tw(p.title, MONO) + 30;
		if (lx + w > width - PAD) { lx = PAD; y += 22; }
		out.push(`<circle cx="${lx + 5}" cy="${y - 4}" r="4" class="t-${toneClass(p.tone)}"/>`);
		out.push(`<text x="${lx + 15}" y="${y}" class="m s12 b${textTone(p.tone)}">${esc(p.title)}</text>`);
		lx += w;
	});
	y += 24;
	const mapTop = y;
	// Mini map: one track per participant, 9px apart.
	const STEP = 18;
	const MAP = { x: PAD + 30, w: (n - 1) * STEP };
	const TEXT = MAP.x + MAP.w + 22;
	const tx = (i: number) => MAP.x + i * STEP;
	const groups: { top: number; depth: number; kind: string; label: string }[] = [];
	let step = 0;
	const indent = () => groups.length * 12;
	for (const it of model.items) {
		if (it.t === "section") {
			y += 6;
			const label = it.title.toUpperCase();
			out.push(`<text x="${PAD}" y="${y + 12}" class="cap">${esc(label)}</text>`);
			out.push(`<path d="M${PAD + tw(label, CHAR.mono11 + 0.9) + 10},${y + 8} L${width - PAD},${y + 8}" class="sec-rule"/>`);
			y += 26;
		} else if (it.t === "open") {
			groups.push({ top: y, depth: groups.length, kind: it.kind, label: it.label });
			out.push(`<text x="${TEXT + indent() - 12}" y="${y + 14}" class="cap"><tspan class="cap-b">${esc(it.kind.toUpperCase())}</tspan>  ${esc(it.label.toUpperCase())}</text>`);
			y += 24;
		} else if (it.t === "else") {
			const g = groups[groups.length - 1];
			if (g) out.push(`<text x="${TEXT + indent() - 12}" y="${y + 14}" class="cap"><tspan class="cap-b">ELSE</tspan>  ${esc(it.label.toUpperCase())}</text>`);
			y += 24;
		} else if (it.t === "end") {
			const g = groups.pop();
			if (!g) continue;
			const x = TEXT + indent() - 6;
			under.push(`<rect x="${x}" y="${g.top}" width="3" height="${y - g.top - 4}" rx="1.5" class="t-neutral" opacity=".45"/>`);
			y += 6;
		} else if (it.t === "note") {
			const x = TEXT + indent();
			const lines = wrap(it.text, width - PAD - x - 20);
			const h = lines.length * LEAD + 10;
			out.push(`<rect x="${x}" y="${y}" width="${width - PAD - x}" height="${h}" rx="6" class="note-soft"/>`);
			out.push(`<rect x="${x}" y="${y}" width="3" height="${h}" rx="1.5" class="t-rework"/>`);
			out.push(lines.map((l, k) => `<text x="${x + 14}" y="${y + 17 + k * LEAD}" class="s12 t-rework">${esc(l)}</text>`).join(""));
			y += h + 10;
		} else if (it.t === "msg") {
			step++;
			const x = TEXT + indent();
			const who = `${ps[it.from].title} → ${ps[it.to].title}`;
			const lines = wrap(it.label, width - PAD - x, CHAR.sans12 * 1.08);
			const h = 16 + lines.length * 17 + 6;
			const mid = y + 13;
			out.push(`<text x="${PAD}" y="${mid + 4}" class="m s11 num">${String(step).padStart(2, "0")}</text>`);
			for (let i = 0; i < n; i++) under.push(`<path d="M${tx(i)},${y - 4} L${tx(i)},${y + h - 4}" class="track"/>`);
			const ink = it.dashed ? "muted" : toneClass(ps[it.from].tone);
			const a = tx(it.from);
			const b = tx(it.to);
			if (it.from === it.to) out.push(`<path d="M${a},${mid - 5} a5,5 0 1 1 -1,9" class="chev e-${ink}"/>`);
			else {
				const dir = b > a ? 1 : -1;
				out.push(`<path d="M${a},${mid} L${b - dir * 1.5},${mid}" class="e e-${ink}${it.dashed ? " dash" : ""}" style="stroke-width:2"/>`);
				out.push(`<path d="M${b - dir * 5},${mid - 4} L${b},${mid} L${b - dir * 5},${mid + 4}" class="chev e-${ink}"/>`);
			}
			out.push(`<circle cx="${a}" cy="${mid}" r="3.2" class="t-${ink}"/>`);
			const nameCls = (i: number) => `cap-b${textTone(ps[i].tone)}`;
			out.push(`<text x="${x}" y="${y + 9}" class="cap"><tspan class="${nameCls(it.from)}">${esc(ps[it.from].title.toUpperCase())}</tspan> → <tspan class="${nameCls(it.to)}">${esc(ps[it.to].title.toUpperCase())}</tspan></text>`);
			void who;
			out.push(lines.map((l, k) => `<text x="${x}" y="${y + 27 + k * 17}" class="s13${it.dashed ? " muted" : ""}">${esc(l)}</text>`).join(""));
			y += h;
		}
	}
	ps.forEach((p, i) => {
		under.push(`<circle cx="${tx(i)}" cy="${mapTop - 6}" r="3" class="t-${toneClass(p.tone)}"/>`);
	});
	return svgDoc(scheme, width, y + PAD, [...under, ...out]);
}
