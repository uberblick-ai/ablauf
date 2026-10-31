// Throwaway spike for #75: one lenient parser for both candidate spellings and
// a renderer with a few layout modes. Not wired into render(); not tested.
import { CHAR } from "../flow/grid.ts";
import type { Diagnostic, Tone } from "../flow/parse.ts";
import { esc, svgStyle } from "../flow/svg.ts";

interface Participant { id: string; title: string; tone?: Tone; line: number }
type Item =
	| { t: "msg"; from: number; to: number; label: string; dashed: boolean; line: number }
	| { t: "note"; over: number[]; text: string; line: number }
	| { t: "open"; kind: string; label: string; line: number }
	| { t: "else"; label: string; line: number }
	| { t: "end"; line: number }
	| { t: "section"; title: string; line: number };

export interface Model { participants: Participant[]; items: Item[]; diagnostics: Diagnostic[] }

const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, "$1");
const ARROW = /^(\S+?)\s*(-->>|->>|-\.->|-->)\s*(\S+?)\s*:\s*(.*)$/;

export function parse(source: string): Model {
	const participants: Participant[] = [];
	const items: Item[] = [];
	const diagnostics: Diagnostic[] = [];
	const error = (line: number, message: string) => diagnostics.push({ line, severity: "error", message });
	const index = (id: string, line: number) => {
		const i = participants.findIndex((p) => p.id === id);
		if (i < 0) error(line, `unknown participant \`${id}\``);
		return i;
	};
	let header = false;
	let depth = 0;
	for (const [n, raw] of source.split("\n").entries()) {
		const line = n + 1;
		const text = raw.trim();
		if (!text || text.startsWith("#")) continue;
		if (!header) {
			header = true;
			if (!/^sequence\s+v0$/.test(text)) error(line, "first line should be `sequence v0`");
			continue;
		}
		let m: RegExpExecArray = [] as unknown as RegExpExecArray;
		const hit = (re: RegExp) => {
			const found = re.exec(text);
			if (found) m = found;
			return found !== null;
		};
		if (hit(/^(participant|person|system)\s+(\S+)\s*("[^"]*")?\s*(?:tone=(\S+))?$/)) {
			if (items.some((i) => i.t === "msg")) error(line, "declare every participant before the first message");
			const tone = (m[4] ?? (m[1] === "person" ? "neutral" : m[1] === "system" ? "system" : undefined)) as Tone | undefined;
			participants.push({ id: m[2], title: m[3] ? unquote(m[3]) : m[2], tone, line });
		} else if (hit(ARROW)) {
			const from = index(m[1], line);
			const to = index(m[3], line);
			if (from >= 0 && to >= 0)
				items.push({ t: "msg", from, to, label: m[4].trim(), dashed: m[2] === "-->>" || m[2] === "-.->", line });
		} else if (hit(/^note\s+over\s+([^:]+):\s*(.*)$/) || hit(/^note\s+(\S+)\s+("[^"]*")$/)) {
			const over = m[1].split(",").map((s) => index(s.trim(), line)).filter((i) => i >= 0);
			if (over.length) items.push({ t: "note", over, text: unquote(m[2]), line });
		} else if (hit(/^(alt|opt|loop|group)\s+(.*)$/)) {
			depth++;
			items.push({ t: "open", kind: m[1], label: unquote(m[2]), line });
		} else if (hit(/^else\s*(.*)$/)) {
			if (!depth) error(line, "`else` outside a group");
			else items.push({ t: "else", label: unquote(m[1]), line });
		} else if (text === "end") {
			if (!depth) error(line, "`end` without a group");
			else { depth--; items.push({ t: "end", line }); }
		} else if (hit(/^section\s+("[^"]*")$/)) {
			items.push({ t: "section", title: unquote(m[1]), line });
		} else error(line, "expected a participant, message, note, group or section");
	}
	while (depth-- > 0) items.push({ t: "end", line: 0 });
	return { participants, items, diagnostics };
}

export interface LayoutMode {
	/** Fixed width with evenly spaced lifelines; omit to size columns to labels. */
	width?: number;
	/** center: wrapped within the arrow's span. source: one line from the left end, over a knockout. */
	labels: "center" | "source";
	/** Repeat participant headers below the lifelines. */
	footer?: boolean;
	/** plain: the first spike look. lanes: tinted lanes, no boxes. cards: tone cards and hairlines. */
	style?: "plain" | "lanes" | "cards";
}

const LEAD = 15;
const GUTTER = 22;
const PAD = 16;
const SANS = CHAR.sans12;
const MONO = CHAR.mono12;
const tw = (s: string, c = SANS) => [...s].length * c;

function wrap(text: string, width: number, c = SANS): string[] {
	const limit = Math.max(4, Math.floor(width / c));
	const lines: string[] = [];
	let line = "";
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (line && [...line].length + 1 + [...word].length > limit) { lines.push(line); line = ""; }
		line = line ? `${line} ${word}` : word;
	}
	if (line || !lines.length) lines.push(line);
	return lines;
}

function columns(model: Model, mode: LayoutMode): { xs: number[]; width: number } {
	const n = model.participants.length;
	const gutter = mode.style && mode.style !== "plain" ? GUTTER : 0;
	if (mode.width) {
		const col = (mode.width - 2 * PAD - gutter) / n;
		return { xs: model.participants.map((_, i) => PAD + gutter + col * (i + 0.5)), width: mode.width };
	}
	// Grow gaps until every header and single-line label fits its span.
	const head = model.participants.map((p) => tw(p.title, MONO) + 28);
	const gaps = head.slice(1).map((w, i) => Math.max(96, (head[i] + w) / 2 + 20));
	let right = head[n - 1] / 2;
	const msgs = model.items.filter((i) => i.t === "msg").sort((a, b) => Math.abs(a.to - a.from) - Math.abs(b.to - b.from));
	for (const m of msgs) {
		const need = tw(m.label) + 28;
		if (m.from === m.to) {
			const room = 40 + tw(m.label);
			if (m.from < n - 1) gaps[m.from] = Math.max(gaps[m.from], room);
			else right = Math.max(right, room);
			continue;
		}
		const [a, b] = [Math.min(m.from, m.to), Math.max(m.from, m.to)];
		const have = gaps.slice(a, b).reduce((s, g) => s + g, 0);
		if (have < need) for (let i = a; i < b; i++) gaps[i] += (need - have) / (b - a);
	}
	const xs = [PAD + head[0] / 2];
	for (const g of gaps) xs.push(xs[xs.length - 1] + g);
	return { xs, width: Math.ceil(xs[n - 1] + right + PAD) };
}

export function renderSequence(model: Model, mode: LayoutMode, scheme: "light" | "dark") {
	const { participants: ps, items } = model;
	const { xs, width } = columns(model, mode);
	const n = ps.length;
	const fancy = mode.style === "lanes" || mode.style === "cards";
	const lanes = mode.style === "lanes";
	const colW = mode.width ? (mode.width - 2 * PAD - (fancy ? GUTTER : 0)) / n : 0;
	const under: string[] = [];
	const back: string[] = [];
	let step = 0;
	const toneOf = (i: number) => ps[i].tone ?? "ink";
	const body: string[] = [];
	const front: string[] = [];
	const text = (lines: string[], x: number, y: number, cls: string, anchor = "") =>
		lines.map((t, i) => `<text x="${x}" y="${y + i * LEAD}"${anchor ? ` text-anchor="${anchor}"` : ""} class="${cls}">${esc(t)}</text>`).join("");

	// Headers: wrapped to their column in fixed modes, one line otherwise.
	const heads = ps.map((p) => wrap(p.title, mode.width ? colW - 20 : 999, MONO));
	const headH = 16 + Math.max(...heads.map((h) => h.length)) * LEAD;
	const drawHeads = (y: number) =>
		ps.forEach((p, i) => {
			if (lanes) {
				const top = y + headH / 2 - ((heads[i].length - 1) * LEAD) / 2 + 4;
				body.push(`<circle cx="${xs[i]}" cy="${y + 2}" r="3.5" class="t-${toneOf(i) === "ink" ? "muted" : toneOf(i)}"/>`);
				body.push(text(heads[i], xs[i], top + 6, `m s12 b${p.tone && p.tone !== "neutral" ? ` t-${p.tone}` : ""}`, "middle"));
				return;
			}
			const w = mode.width ? colW - 8 : tw(p.title, MONO) + 24;
			const cls = p.tone ? `k-${p.tone}` : "pill";
			body.push(`<rect x="${xs[i] - w / 2}" y="${y}" width="${w}" height="${headH}" rx="8" class="${cls}"/>`);
			const top = y + headH / 2 - ((heads[i].length - 1) * LEAD) / 2 + 4;
			body.push(text(heads[i], xs[i], top, `m s12 b${p.tone ? ` t-${p.tone === "neutral" ? "ink" : p.tone}` : ""}`, "middle"));
		});
	drawHeads(PAD);
	let y = PAD + headH + 18;

	// Group extents come from the participants their messages touch.
	const stack: { top: number; lo: number; hi: number; self: boolean; kind: string; label: string; elses: { y: number; label: string }[] }[] = [];
	const extents = new Map<number, { lo: number; hi: number; self: boolean }>();
	{
		const open: { at: number; lo: number; hi: number; self: boolean }[] = [];
		items.forEach((it, k) => {
			if (it.t === "open") open.push({ at: k, lo: n, hi: -1, self: false });
			else if (it.t === "end") { const g = open.pop(); if (g) extents.set(g.at, g); }
			else if (it.t === "msg" || it.t === "note")
				for (const g of open) {
					const idx = it.t === "msg" ? [it.from, it.to] : it.over;
					g.lo = Math.min(g.lo, ...idx);
					g.hi = Math.max(g.hi, ...idx);
					if (it.t === "msg" && it.from === it.to && it.from === Math.max(...idx)) g.self = true;
				}
		});
	}
	let section: { top: number; title: string } | null = null;
	const closeSection = () => {
		if (section) back.push(`<rect x="0" y="${section.top}" width="${width}" height="${y - section.top}" class="band"/>`);
	};

	items.forEach((it, k) => {
		if (it.t === "section") {
			closeSection();
			if (fancy) {
				// A labelled rule instead of a band, so lanes keep their tint.
				y += 4;
				const label = it.title.toUpperCase();
				front.push(`<text x="${PAD}" y="${y + 12}" class="cap">${esc(label)}</text>`);
				front.push(`<path d="M${PAD + tw(label, CHAR.mono11 + 0.9) + 10},${y + 8} L${width - PAD},${y + 8}" class="sec-rule"/>`);
				y += 30;
				return;
			}
			y += section ? 4 : -8;
			section = { top: y, title: it.title };
			front.push(`<text x="${PAD}" y="${y + 18}" class="cap">${esc(it.title.toUpperCase())}</text>`);
			y += 34;
		} else if (it.t === "open") {
			const e = extents.get(k) ?? { lo: 0, hi: n - 1, self: false };
			const depth = stack.length;
			stack.push({ top: y, lo: e.lo, hi: e.hi, self: e.self, kind: it.kind, label: it.label, elses: [] });
			y += 30 + depth * 0;
		} else if (it.t === "else") {
			const g = stack[stack.length - 1];
			g.elses.push({ y: y + 2, label: it.label });
			y += fancy ? 28 : 30;
		} else if (it.t === "end") {
			const g = stack.pop();
			if (!g) return;
			y += 4;
			const inset = 10 * stack.length;
			const x0 = Math.max(4, xs[g.lo] - (mode.width ? colW / 2 - 6 : 44) + inset);
			const x1 = Math.min(width - 4, xs[g.hi] + (g.self ? (mode.width ? colW / 2 - 6 : 160) : mode.width ? colW / 2 - 6 : 44) - inset);
			if (fancy) {
				const fx0 = Math.max(PAD + GUTTER - 6, x0);
				back.push(`<rect x="${fx0}" y="${g.top}" width="${x1 - fx0}" height="${y - g.top}" rx="10" class="grp-soft"/>`);
				front.push(`<text x="${fx0 + 12}" y="${g.top + 18}" class="cap"><tspan class="cap-b">${esc(g.kind.toUpperCase())}</tspan>  ${esc(g.label.toUpperCase())}</text>`);
				for (const e of g.elses) {
					front.push(`<path d="M${fx0 + 10},${e.y} L${x1 - 10},${e.y}" class="grp-split"/>`);
					front.push(`<text x="${fx0 + 12}" y="${e.y + 17}" class="cap"><tspan class="cap-b">ELSE</tspan>  ${esc(e.label.toUpperCase())}</text>`);
				}
				y += 12;
				return;
			}
			const tag = g.kind;
			const tagW = tw(tag, CHAR.mono11) + 16;
			front.push(`<rect x="${x0}" y="${g.top}" width="${x1 - x0}" height="${y - g.top}" rx="6" class="grp"/>`);
			front.push(`<path d="M${x0},${g.top + 20} L${x0 + tagW},${g.top + 20} L${x0 + tagW + 6},${g.top + 14} L${x0 + tagW + 6},${g.top} " class="grp-tag"/>`);
			front.push(`<text x="${x0 + 8}" y="${g.top + 14}" class="m s11 b muted">${esc(tag)}</text>`);
			front.push(`<text x="${x0 + tagW + 14}" y="${g.top + 14}" class="m s11 b">[${esc(g.label)}]</text>`);
			for (const e of g.elses) {
				front.push(`<path d="M${x0},${e.y} L${x1},${e.y}" class="rule"/>`);
				front.push(`<text x="${x0 + 8}" y="${e.y + 16}" class="m s11 b">[${esc(e.label)}]</text>`);
			}
			y += 12;
		} else if (it.t === "note") {
			const lo = Math.min(...it.over);
			const hi = Math.max(...it.over);
			const cx = (xs[lo] + xs[hi]) / 2;
			const maxW = lo === hi ? (mode.width ? Math.min(colW * 1.8, 220) : 220) : xs[hi] - xs[lo] + 60;
			const lines = wrap(it.text, maxW - 20);
			const w = Math.min(maxW, Math.max(...lines.map((l) => tw(l))) + 20);
			const h = lines.length * LEAD + 12;
			const x = Math.max(4, Math.min(width - 4 - w, cx - w / 2));
			if (fancy) {
				body.push(`<rect x="${x}" y="${y}" width="${w + 4}" height="${h}" rx="6" class="note-soft"/>`);
				body.push(`<rect x="${x}" y="${y}" width="3" height="${h}" rx="1.5" class="t-rework"/>`);
				body.push(text(lines, x + 14, y + 19, "s12 t-rework"));
			} else {
				body.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" class="k-rework"/>`);
				body.push(text(lines, x + 10, y + 19, "s12 t-rework"));
			}
			y += h + 14;
		} else if (it.t === "msg") {
			const self = it.from === it.to;
			const a = xs[it.from];
			const b = xs[it.to];
			const lo = Math.min(a, b);
			const hi = Math.max(a, b);
			const tone = fancy && !it.dashed ? toneOf(it.from) : "ink";
			const marker = `url(#${scheme}-${it.dashed ? "open" : `fill-${tone}`})`;
			const cls = `e e-${tone}${it.dashed ? " dash" : ""}${fancy && it.dashed ? " resp" : ""}`;
			step++;
			const number = (ay: number) => {
				if (fancy) front.push(`<text x="${PAD + 2}" y="${ay + 4}" class="m s11 num">${String(step).padStart(2, "0")}</text>`);
			};
			const dot = (ax: number, ay: number) => {
				if (fancy && !it.dashed) body.push(`<circle cx="${ax}" cy="${ay}" r="3" class="t-${tone === "ink" ? "muted" : tone}"/>`);
			};
			if (self) {
				const room = mode.width ? Math.min(colW - 46, width - a - 50) : 999;
				const lines = wrap(it.label, room);
				const top = y + 2;
				if (fancy) body.push(`<path d="M${a},${top} L${a + 18},${top} Q${a + 30},${top} ${a + 30},${top + 12} Q${a + 30},${top + 24} ${a + 18},${top + 24} L${a + 3},${top + 24}" class="${cls}" marker-end="${marker}"/>`);
				else body.push(`<path d="M${a},${top} L${a + 28},${top} L${a + 28},${top + 24} L${a + 3},${top + 24}" class="${cls}" marker-end="${marker}"/>`);
				dot(a, top);
				number(top + 12);
				front.push(knock(lines, a + 36, top + 8, "start"));
				front.push(text(lines, a + 36, top + 12, "s12"));
				y += Math.max(36, lines.length * LEAD + 16) + 8;
				return;
			}
			let lines: string[];
			let lx: number;
			let anchor: string;
			if (mode.labels === "center") {
				lines = wrap(it.label, hi - lo - 16);
				lx = (lo + hi) / 2;
				anchor = "middle";
			} else {
				lines = wrap(it.label, width - PAD - lo - 8);
				lx = lo + 8;
				anchor = "start";
			}
			const ly = y + 10;
			front.push(knock(lines, lx, ly - 4, anchor));
			front.push(text(lines, lx, ly, "s12", anchor));
			y = ly + (lines.length - 1) * LEAD + 10;
			const end = b + (b > a ? -3 : 3);
			body.push(`<path d="M${a},${y} L${end},${y}" class="${cls}" marker-end="${marker}"/>`);
			dot(a, y);
			number(y);
			y += 18;
		}
	});
	closeSection();
	y += 4;
	let height = y + PAD;
	if (mode.footer) {
		drawHeads(y);
		height = y + headH + PAD;
	}
	const laneW = mode.width ? colW : 0;
	xs.forEach((x, i) => {
		if (lanes) {
			const w = laneW || (i ? x - xs[i - 1] : 60);
			if (i % 2 === 0) under.push(`<rect x="${x - w / 2 + 3}" y="${PAD - 6}" width="${w - 6}" height="${y - PAD + 6}" rx="10" class="lane"/>`);
			under.push(`<path d="M${x},${PAD + headH + 4} L${x},${y - 6}" class="life-faint"/>`);
		} else if (mode.style === "cards") back.push(`<path d="M${x},${PAD + headH} L${x},${y - 4}" class="life-tone e-${toneOf(i) === "ink" ? "muted" : toneOf(i)}"/>`);
		else back.push(`<path d="M${x},${PAD + headH} L${x},${mode.footer ? y : y - 4}" class="life"/>`);
	});

	function knock(lines: string[], x: number, y: number, anchor: string): string {
		if (fancy) return "";
		const w = Math.max(...lines.map((l) => tw(l))) + 8;
		const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w + 4 : x - 4;
		return `<rect x="${x0}" y="${y - 9}" width="${w}" height="${lines.length * LEAD + 2}" class="gap${section ? " gap-band" : ""}"/>`;
	}
	const fills = ["ink", "muted", "neutral", "agent", "system", "done", "rework", "stop"]
		.map((t) => `<marker id="${scheme}-fill-${t}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 z" class="t-${t}"/></marker>`)
		.join("");
	const defs = `<defs>${fills}<marker id="${scheme}-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1 L9,5 L1,9" class="open"/></marker></defs>`;
	const extra = [
		".ab .life{stroke:var(--line);stroke-width:1.4;stroke-dasharray:4 4}",
		".ab .gap{fill:var(--bg)}.ab .gap-band{fill:var(--band)}",
		".ab .grp{fill:none;stroke:var(--neutral);stroke-opacity:.55;stroke-width:1.2}",
		".ab .grp-tag{fill:var(--neutral-bg);stroke:var(--neutral);stroke-opacity:.55;stroke-width:1.2}",
		".ab .open{fill:none;stroke:var(--muted);stroke-width:1.6;stroke-linejoin:round}",
		".ab .lane{fill:var(--neutral-bg);opacity:.4}.ab .life-faint{stroke:var(--line);stroke-width:1}",
		".ab .life-tone{stroke-width:1;stroke-opacity:.35}",
		".ab .sec-rule{stroke:var(--line);stroke-width:1}",
		".ab .grp-soft{fill:var(--neutral-bg);opacity:.55}.ab .grp-split{stroke:var(--neutral);stroke-opacity:.35;stroke-width:1;stroke-dasharray:2 4}",
		".ab .cap-b{font-weight:600;fill:var(--ink)}",
		".ab .note-soft{fill:var(--rework-bg)}",
		".ab .num{fill:var(--muted);opacity:.7}.ab .resp{stroke-width:1.3}",
	];
	// Sections sit on bands, so knockouts there take the band colour. Spike: approximate.
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="ab ab-${scheme}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n${svgStyle(scheme, undefined, extra)}\n${defs}\n<rect width="${width}" height="${height}" fill="var(--bg)"/>\n${under.join("\n")}\n${back.join("\n")}\n${body.join("\n")}\n${front.join("\n")}\n</svg>\n`;
	return { svg, width, height };
}
