// Turns the author's grid into pixels. It sizes columns and rows from their
// contents and draws the elbow each pair of sides implies. It never moves a
// node or picks a route; problems become diagnostics for the author.

import type {
	Child,
	Diagnostic,
	FlowEdge,
	FlowNode,
	LegendItem,
	Model,
	SideName,
	Tone,
} from "./parse.ts";

export type Point = [number, number];

export interface Placed {
	node: FlowNode;
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Label {
	text: string;
	x: number;
	y: number;
	anchor: "start" | "end";
	w: number;
}

export interface Route {
	edge: FlowEdge;
	points: Point[];
	tone: Tone;
	label: Label | null;
}

export interface Band {
	label: string;
	y: number;
	h: number;
	shaded: boolean;
}

// A legend entry: its sample sits at x, its text after it, both centred on y.
export interface Key {
	item: LegendItem;
	x: number;
	y: number;
}

export interface Layout {
	width: number;
	height: number;
	nodes: Placed[];
	routes: Route[];
	bands: Band[];
	legend: { y: number; keys: Key[] } | null;
	diagnostics: Diagnostic[];
}

// Character widths for the fonts the SVG asks for. Mono is reliable; sans is
// an estimate.
export const CHAR = {
	mono11: 6.6,
	mono12: 7.2,
	mono13: 7.8,
	sans11: 6.1,
	sans12: 6.7,
};
const MARGIN = 16;
const ROW_GAP = 30;
const SECTION_GAP = 52;
const MIN_COL_GAP = 56;
const LABEL_PAD = 10;
const LOOP_OUT = 24;

const len = (s: string) => [...s].length;
// The legend is fine print in rows under the diagram.
export const SAMPLE_W = 24;
const KEY_GAP = 20;
const KEY_ROW = 20;
const PANEL_PAD = 14;
// Keep automatic sizing bounded: notes grow downwards unless another child
// needs more width. This preferred width only sizes the panel, not its lines.
const PANEL_TEXT_WIDTH = 34 * CHAR.sans12;

export function panelLines(c: Child, width: number): string[] {
	return wrap(
		c.text,
		width - 2 * PANEL_PAD,
		c.kind === "strong" ? CHAR.sans12 : CHAR.sans11,
	);
}

export function panelContentHeight(n: FlowNode, width: number): number {
	let h = 12;
	for (const c of n.children) {
		if (c.kind === "pill") h += 36;
		else if (c.kind === "rule") h += 14;
		else h += 18 + (panelLines(c, width).length - 1) * 15;
	}
	return h + 8;
}

function wrap(text: string, width: number, charWidth: number): string[] {
	const lines: string[] = [];
	let line = "";
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (line && (len(line) + 1 + len(word)) * charWidth > width) {
			lines.push(line);
			line = word;
		} else line = line ? `${line} ${word}` : word;
	}
	lines.push(line);
	return lines;
}
const labelWidth = (text: string) => Math.round(len(text) * CHAR.mono11);
const horizontal = (s: SideName) => s === "left" || s === "right";

function size(n: FlowNode): { w: number; h: number } {
	switch (n.kind) {
		case "text":
			return { w: Math.round(len(n.label) * CHAR.sans12), h: 16 };
		case "pill":
			return { w: Math.round(36 + len(n.label) * CHAR.mono12), h: 34 };
		case "end":
			return {
				w: Math.round(Math.max(170, len(n.label) * CHAR.sans12 + 40)),
				h: 34,
			};
		case "box":
			return {
				w: Math.round(
					Math.max(
						180,
						len(n.label) * CHAR.mono13 + 32,
						len(n.sub) * CHAR.sans11 + 28,
					),
				),
				h: 46,
			};
		case "panel": {
			let w = 190;
			for (const c of n.children) {
				const width =
					c.kind === "pill"
						? 36 + len(c.text) * CHAR.mono12
						: c.kind === "rule"
							? 0
							: Math.max(
									...wrap(c.text, PANEL_TEXT_WIDTH, CHAR.sans12).map(len),
								) * CHAR.sans12;
				w = Math.max(w, Math.round(width + 2 * PANEL_PAD));
			}
			return { w, h: panelContentHeight(n, w) };
		}
	}
}

interface End {
	edge: FlowEdge;
	node: Placed;
	side: SideName;
	slot: number; // 1-based, left to right or top to bottom
	count: number;
	point: Point;
}

export function grid(
	model: Model,
	parseDiagnostics: Diagnostic[] = [],
): Layout {
	const diagnostics = [...parseDiagnostics];
	const warn = (line: number, message: string) =>
		diagnostics.push({ line, severity: "warning", message });

	const placed = new Map<string, Placed>();
	for (const n of model.nodes)
		placed.set(n.id, { node: n, x: 0, y: 0, ...size(n) });
	const P = (id: string) => placed.get(id) as Placed;
	const nodes = [...placed.values()];

	// Boxes in one column share a width, so the column reads as one line.
	for (const col of model.columns) {
		const boxes = nodes.filter(
			(p) => p.node.col === col && p.node.kind === "box",
		);
		const w = Math.max(0, ...boxes.map((p) => p.w));
		for (const p of boxes) p.w = w;
	}

	// Rows: each node starts one unless it joins another node's row.
	const rowOf = new Map<string, number>();
	const rowSection: number[] = [];
	for (const n of model.nodes) {
		if (n.row) continue;
		rowOf.set(n.id, rowSection.length);
		rowSection.push(n.section);
	}
	for (const n of model.nodes)
		if (n.row) rowOf.set(n.id, rowOf.get(n.row) as number);
	const rows = rowSection.length;
	const first = (p: Placed) => rowOf.get(p.node.id) as number;
	for (const p of nodes)
		if (first(p) + p.node.span > rows) {
			warn(p.node.line, `span=${p.node.span} runs past the last row`);
			p.node.span = rows - first(p);
		}
	const last = (p: Placed) => first(p) + p.node.span - 1;

	const rowH: number[] = new Array(rows).fill(16);
	for (const p of nodes)
		if (p.node.span === 1) rowH[first(p)] = Math.max(rowH[first(p)], p.h);
	const gapAbove = (r: number) =>
		r > 0 && rowSection[r] !== rowSection[r - 1] ? SECTION_GAP : ROW_GAP;
	for (const p of nodes) {
		if (p.node.span === 1) continue;
		let covered = 0;
		for (let r = first(p); r <= last(p); r++)
			covered += rowH[r] + (r > first(p) ? gapAbove(r) : 0);
		if (covered < p.h) rowH[last(p)] += p.h - covered;
	}
	const rowY: number[] = [];
	// Where each section's band starts, keyed by the section, so a section
	// without rows takes no band.
	const sectionTop = new Map<number, number>();
	if (rows) sectionTop.set(rowSection[0], 0);
	let y = MARGIN;
	for (let r = 0; r < rows; r++) {
		if (r > 0) {
			if (gapAbove(r) === SECTION_GAP)
				sectionTop.set(rowSection[r], y + SECTION_GAP / 2);
			y += gapAbove(r);
		}
		rowY.push(y);
		y += rowH[r];
	}
	for (const p of nodes) {
		const top = rowY[first(p)];
		const bottom = rowY[last(p)] + rowH[last(p)];
		// A spanning node fills its rows, so every row meets it head on.
		if (p.node.span > 1) p.h = bottom - top;
		p.y = Math.round(top + (bottom - top - p.h) / 2);
	}

	// Sides: the author's, or one of three defaults.
	const colIndex = (p: Placed) => model.columns.indexOf(p.node.col);
	const sides = (e: FlowEdge): [SideName, SideName] => {
		const a = P(e.from);
		const b = P(e.to);
		const ca = colIndex(a);
		const cb = colIndex(b);
		const overlap = first(a) <= last(b) && first(b) <= last(a);
		let from: SideName;
		let to: SideName;
		if (ca === cb)
			[from, to] = first(b) > first(a) ? ["bottom", "top"] : ["top", "bottom"];
		else if (overlap)
			[from, to] = cb > ca ? ["right", "left"] : ["left", "right"];
		else
			[from, to] = [
				cb > ca ? "right" : "left",
				first(b) > first(a) ? "top" : "bottom",
			];
		return [e.from_side ?? from, e.to_side ?? to];
	};

	// Slots: explicit ones first, the rest fill the gaps in source order.
	const ends: End[] = [];
	for (const e of model.edges) {
		const [fs, ts] = sides(e);
		ends.push({
			edge: e,
			node: P(e.from),
			side: fs,
			slot: e.from_slot,
			count: 0,
			point: [0, 0],
		});
		ends.push({
			edge: e,
			node: P(e.to),
			side: ts,
			slot: e.to_slot,
			count: 0,
			point: [0, 0],
		});
	}
	const bySide = new Map<string, End[]>();
	for (const end of ends) {
		const k = `${end.node.node.id}:${end.side}`;
		if (!bySide.has(k)) bySide.set(k, []);
		bySide.get(k)?.push(end);
	}
	for (const group of bySide.values()) {
		const count = Math.max(group.length, ...group.map((g) => g.slot));
		const taken = new Set<number>();
		for (const g of group) {
			if (!g.slot) continue;
			if (taken.has(g.slot))
				warn(
					g.edge.line,
					`slot ${g.side}.${g.slot} of ${g.node.node.id} is used twice`,
				);
			taken.add(g.slot);
		}
		let next = 1;
		for (const g of group) {
			if (g.slot) continue;
			while (taken.has(next)) next++;
			g.slot = next;
			taken.add(next);
		}
		for (const g of group) g.count = count;
	}

	// Columns: widths from contents, gaps wide enough for the labels in them.
	const colW = model.columns.map((c) =>
		Math.max(0, ...nodes.filter((p) => p.node.col === c).map((p) => p.w)),
	);
	const gaps = model.columns.map(() => MIN_COL_GAP);
	const frac = (end: End) => end.slot / (end.count + 1);
	for (const e of model.edges) {
		if (!e.label) continue;
		const [a, b] = ends.filter((x) => x.edge === e);
		const near = e.label_at === "start" ? a : b;
		const far = near === a ? b : a;
		if (!horizontal(near.side)) continue;
		const c = colIndex(near.node);
		const gap = near.side === "right" ? c : c - 1;
		if (
			gap < 0 ||
			gap >= gaps.length - 1 ||
			Math.abs(colIndex(far.node) - c) !== 1
		)
			continue;
		const inset = (colW[c] - near.node.w) / 2;
		const cf = colIndex(far.node);
		const farInset = (colW[cf] - far.node.w) / 2;
		// How far the label may reach past the gap: into the far column's inset,
		// and up to the port when the edge turns into the far node's top or bottom.
		let room = farInset;
		if (!horizontal(far.side)) {
			const along = far.node.w * frac(far);
			room += near.side === "right" ? along : far.node.w - along;
		}
		gaps[gap] = Math.max(
			gaps[gap],
			Math.round(labelWidth(e.label) + 2 * LABEL_PAD - inset - room),
		);
	}
	const colX: number[] = [];
	let x = MARGIN;
	model.columns.forEach((_, c) => {
		colX.push(x);
		x += colW[c] + (c < model.columns.length - 1 && colW[c + 1] ? gaps[c] : 0);
	});
	for (const p of nodes)
		p.x = Math.round(colX[colIndex(p)] + (colW[colIndex(p)] - p.w) / 2);

	// Ports.
	for (const end of ends) {
		const p = end.node;
		const f = frac(end);
		end.point =
			end.side === "top"
				? [Math.round(p.x + p.w * f), p.y]
				: end.side === "bottom"
					? [Math.round(p.x + p.w * f), p.y + p.h]
					: end.side === "left"
						? [p.x, Math.round(p.y + p.h * f)]
						: [p.x + p.w, Math.round(p.y + p.h * f)];
	}
	// An edge between two parallel sides runs straight when the longer side
	// can meet the other end head on without crowding its other ports.
	for (const e of model.edges) {
		const [a, b] = ends.filter((x) => x.edge === e);
		if (horizontal(a.side) !== horizontal(b.side) || a.side === b.side)
			continue;
		const k = horizontal(a.side) ? 1 : 0;
		const extent = (end: End) => (k ? end.node.h : end.node.w);
		const [mover, fixed] = extent(b) >= extent(a) ? [b, a] : [a, b];
		const lo = (k ? mover.node.y : mover.node.x) + 6;
		const hi =
			(k ? mover.node.y + mover.node.h : mover.node.x + mover.node.w) - 6;
		const target = fixed.point[k];
		if (target < lo || target > hi) continue;
		const crowded = ends.some(
			(o) =>
				o !== mover &&
				o.node === mover.node &&
				o.side === mover.side &&
				Math.abs(o.point[k] - target) < 10,
		);
		if (!crowded) mover.point[k] = target;
	}

	// Elbows: one fixed shape per pair of sides.
	const routes: Route[] = [];
	for (const e of model.edges) {
		const [a, b] = ends.filter((x) => x.edge === e);
		const [ax, ay] = a.point;
		const [bx, by] = b.point;
		let points: Point[];
		if (horizontal(a.side) && horizontal(b.side)) {
			if (ay === by && a.side !== b.side) points = [a.point, b.point];
			else if (a.side === b.side) {
				const ox =
					a.side === "right"
						? Math.max(ax, bx) + LOOP_OUT
						: Math.min(ax, bx) - LOOP_OUT;
				points = [a.point, [ox, ay], [ox, by], b.point];
			} else {
				const mx = Math.round((ax + bx) / 2);
				points = [a.point, [mx, ay], [mx, by], b.point];
			}
		} else if (!horizontal(a.side) && !horizontal(b.side)) {
			if (ax === bx && a.side !== b.side) points = [a.point, b.point];
			else if (a.side === b.side) {
				const oy =
					a.side === "bottom"
						? Math.max(ay, by) + LOOP_OUT
						: Math.min(ay, by) - LOOP_OUT;
				points = [a.point, [ax, oy], [bx, oy], b.point];
			} else {
				const my = Math.round((ay + by) / 2);
				points = [a.point, [ax, my], [bx, my], b.point];
			}
		} else if (horizontal(a.side)) points = [a.point, [bx, ay], b.point];
		else points = [a.point, [ax, by], b.point];
		// An edge must leave its source and enter its target from outside.
		const out = (side: SideName, [x0, y0]: Point, [x1, y1]: Point) =>
			side === "top" ? y1 < y0 : side === "bottom" ? y1 > y0 : side === "left" ? x1 < x0 : x1 > x0;
		if (!out(a.side, points[0], points[1]))
			warn(e.line, `edge ${e.from} → ${e.to} leaves ${e.from}'s ${a.side} back through ${e.from}; choose other sides`);
		else if (!out(b.side, points.at(-1) as Point, points.at(-2) as Point))
			warn(e.line, `edge ${e.from} → ${e.to} enters ${e.to}'s ${b.side} through ${e.to}; choose other sides`);
		routes.push({
			edge: e,
			points,
			tone: e.tone,
			label: placeLabel(e, points, a, b),
		});
	}

	// Bounds cover every drawn part: nodes, routes (loops reach past their
	// nodes), labels and section captions. Anything left of or above the
	// margin shifts the whole drawing right or down.
	const labelRects = routes.flatMap((r) => (r.label ? [labelRect(r.label)] : []));
	const xs = [
		...routes.flatMap((r) => r.points.map((p) => p[0])),
		...labelRects.map((l) => l.x),
	];
	const ys = [
		...routes.flatMap((r) => r.points.map((p) => p[1])),
		...labelRects.map((l) => l.y),
	];
	const dx = Math.max(0, MARGIN - Math.min(MARGIN, ...xs));
	const dy = Math.max(0, MARGIN - Math.min(MARGIN, ...ys));
	if (dx || dy) {
		for (const p of nodes) {
			p.x += dx;
			p.y += dy;
		}
		for (const r of routes) {
			r.points = r.points.map(([x, y]) => [x + dx, y + dy]);
			if (r.label) {
				r.label.x += dx;
				r.label.y += dy;
			}
		}
		for (const [s, top] of sectionTop) if (top) sectionTop.set(s, top + dy);
	}
	const CAPTION_CHAR = CHAR.mono11 + 0.88; // .08em letter-spacing at 11px
	const right = Math.max(
		0,
		...nodes.map((p) => p.x + p.w),
		...routes.flatMap((r) => r.points.map((p) => p[0])),
		...labelRects.map((l) => l.x + l.w + dx),
		...model.sections.map((t) => 20 + Math.round(len(t.toUpperCase()) * CAPTION_CHAR)),
	);
	const keyW = (k: LegendItem) =>
		SAMPLE_W + 6 + Math.round(len(k.text) * CHAR.sans11);
	const width = Math.round(
		Math.max(right, MARGIN + Math.max(0, ...model.legend.map(keyW))) + MARGIN,
	);
	const content = Math.round(
		Math.max(
			0,
			...nodes.map((p) => p.y + p.h),
			...routes.flatMap((r) => r.points.map((p) => p[1])),
			...labelRects.map((l) => l.y + l.h + dy),
		) + MARGIN,
	);
	const tops = [...sectionTop].filter(([s]) => s < model.sections.length);
	const bands: Band[] = tops.map(([s, top], i) => {
		const bottom = tops[i + 1]?.[1] ?? content;
		return { label: model.sections[s], y: top, h: bottom - top, shaded: i % 2 === 1 };
	});

	// Legend keys run left to right and wrap onto further rows.
	let legend: Layout["legend"] = null;
	let height = content;
	if (model.legend.length) {
		const keys: Key[] = [];
		let x = MARGIN;
		let y = content + 10 + KEY_ROW / 2;
		for (const item of model.legend) {
			if (x > MARGIN && x + keyW(item) > width - MARGIN) {
				x = MARGIN;
				y += KEY_ROW;
			}
			keys.push({ item, x, y });
			x += keyW(item) + KEY_GAP;
		}
		legend = { y: content, keys };
		height = y + KEY_ROW / 2 + 8;
	}

	check(nodes, routes, bands, warn);
	return { width, height, nodes, routes, bands, legend, diagnostics };
}

// A label sits next to the end it belongs to: above a horizontal segment,
// beside a vertical one at its middle.
function placeLabel(
	e: FlowEdge,
	points: Point[],
	a: End,
	b: End,
): Label | null {
	if (!e.label) return null;
	const w = labelWidth(e.label);
	const atEnd = e.label_at === "end";
	const end = atEnd ? b : a;
	const p = atEnd ? points[points.length - 1] : points[0];
	const q = atEnd ? points[points.length - 2] : points[1];
	if (p[1] === q[1]) {
		const awayRight =
			end.side === "right" || (end.side !== "left" && q[0] > p[0]);
		return {
			text: e.label,
			x: awayRight ? p[0] + LABEL_PAD : p[0] - LABEL_PAD,
			y: p[1] - 7,
			anchor: awayRight ? "start" : "end",
			w,
		};
	}
	return {
		text: e.label,
		x: p[0] + LABEL_PAD,
		y: Math.round((p[1] + q[1]) / 2 + 4),
		anchor: "start",
		w,
	};
}

// Collision checks: every overlap the layout produces is reported, not hidden.
interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

const labelRect = (l: Label): Rect => ({
	x: l.anchor === "start" ? l.x : l.x - l.w,
	y: l.y - 9,
	w: l.w,
	h: 12,
});
const overlaps = (a: Rect, b: Rect) =>
	a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function segments(r: Route): [Point, Point][] {
	const out: [Point, Point][] = [];
	for (let i = 1; i < r.points.length; i++)
		out.push([r.points[i - 1], r.points[i]]);
	return out;
}

function segRect([a, b]: [Point, Point], r: Rect): boolean {
	const x1 = Math.min(a[0], b[0]);
	const x2 = Math.max(a[0], b[0]);
	const y1 = Math.min(a[1], b[1]);
	const y2 = Math.max(a[1], b[1]);
	return (
		x1 < r.x + r.w - 0.5 &&
		x2 > r.x + 0.5 &&
		y1 < r.y + r.h - 0.5 &&
		y2 > r.y + 0.5
	);
}

function segSeg(
	[a, b]: [Point, Point],
	[c, d]: [Point, Point],
): "cross" | "overlap" | null {
	const aH = a[1] === b[1];
	const cH = c[1] === d[1];
	if (aH !== cH) {
		const [h1, h2, v1, v2] = aH ? [a, b, c, d] : [c, d, a, b];
		const hx1 = Math.min(h1[0], h2[0]);
		const hx2 = Math.max(h1[0], h2[0]);
		const vy1 = Math.min(v1[1], v2[1]);
		const vy2 = Math.max(v1[1], v2[1]);
		return v1[0] > hx1 && v1[0] < hx2 && h1[1] > vy1 && h1[1] < vy2
			? "cross"
			: null;
	}
	const same = aH ? a[1] === c[1] : a[0] === c[0];
	if (!same) return null;
	const k = aH ? 0 : 1;
	const lo = Math.max(Math.min(a[k], b[k]), Math.min(c[k], d[k]));
	const hi = Math.min(Math.max(a[k], b[k]), Math.max(c[k], d[k]));
	return hi - lo > 0.5 ? "overlap" : null;
}

function check(
	nodes: Placed[],
	routes: Route[],
	bands: Band[],
	warn: (line: number, m: string) => void,
) {
	for (const r of routes) {
		for (const s of segments(r)) {
			for (const n of nodes) {
				if (n.node.id === r.edge.from || n.node.id === r.edge.to) continue;
				if (segRect(s, n))
					warn(
						r.edge.line,
						`edge ${r.edge.from} → ${r.edge.to} runs through ${n.node.id}`,
					);
			}
		}
	}
	for (let i = 0; i < routes.length; i++) {
		for (let j = i + 1; j < routes.length; j++) {
			for (const s of segments(routes[i])) {
				for (const t of segments(routes[j])) {
					const hit = segSeg(s, t);
					if (hit) {
						const e1 = routes[i].edge;
						const e2 = routes[j].edge;
						warn(
							e2.line,
							`edge ${e2.from} → ${e2.to} ${hit === "cross" ? "crosses" : "overlaps"} ${e1.from} → ${e1.to}`,
						);
					}
				}
			}
		}
	}
	const labels = routes.filter((r) => r.label);
	for (const r of labels) {
		const box = labelRect(r.label as Label);
		for (const n of nodes)
			if (overlaps(box, n))
				warn(r.edge.line, `label "${r.label?.text}" overlaps ${n.node.id}`);
		for (const o of routes) {
			for (const s of segments(o))
				if (segRect(s, box))
					warn(
						r.edge.line,
						`label "${r.label?.text}" overlaps edge ${o.edge.from} → ${o.edge.to}`,
					);
		}
	}
	for (let i = 0; i < labels.length; i++) {
		for (let j = i + 1; j < labels.length; j++) {
			if (
				overlaps(
					labelRect(labels[i].label as Label),
					labelRect(labels[j].label as Label),
				)
			) {
				warn(
					labels[j].edge.line,
					`label "${labels[j].label?.text}" overlaps label "${labels[i].label?.text}"`,
				);
			}
		}
	}
	for (let i = 0; i < nodes.length; i++) {
		for (let j = i + 1; j < nodes.length; j++) {
			if (overlaps(nodes[i], nodes[j]))
				warn(
					nodes[j].node.line,
					`${nodes[j].node.id} overlaps ${nodes[i].node.id}`,
				);
		}
	}
	for (const b of bands) {
		const box: Rect = {
			x: 20,
			y: b.y + 12,
			w: Math.round([...b.label].length * CHAR.mono11 * 1.15) + 2,
			h: 12,
		};
		for (const n of nodes)
			if (overlaps(box, n))
				warn(n.node.line, `section label "${b.label}" overlaps ${n.node.id}`);
		for (const r of routes) {
			for (const seg of segments(r))
				if (segRect(seg, box))
					warn(
						r.edge.line,
						`edge ${r.edge.from} → ${r.edge.to} runs over section label "${b.label}"`,
					);
			if (
				r.label &&
				overlaps(labelRect(r.label), { ...box, x: box.x - 4, w: box.w + 8 })
			) {
				warn(
					r.edge.line,
					`label "${r.label.text}" overlaps section label "${b.label}"`,
				);
			}
		}
	}
}
