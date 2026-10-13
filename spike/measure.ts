// Compares two renders of an edit: how far every shared node, route and label moved.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "./flow/index.ts";

const [beforeName = "loop", afterName = "loop-insert"] = process.argv.slice(2);
const load = (n: string) =>
	render(
		readFileSync(join(import.meta.dirname, "examples", `${n}.flow`), "utf8"),
	).layout;
const a = load(beforeName);
const b = load(afterName);

const moved = (dx: number, dy: number) =>
	dx || dy ? `dx=${dx} dy=${dy}` : "still";
console.log(`canvas ${a.width}x${a.height} -> ${b.width}x${b.height}`);
for (const p of a.nodes) {
	const q = b.nodes.find((n) => n.node.id === p.node.id);
	if (q)
		console.log(
			`node  ${p.node.id.padEnd(20)} ${moved(q.x - p.x, q.y - p.y)}${q.w !== p.w ? ` w ${p.w}->${q.w}` : ""}`,
		);
}
// Edges are matched by their ends and, between the same two nodes, by order.
type R = (typeof a.routes)[number];
const keyed = (routes: R[]) => {
	const seen = new Map<string, number>();
	return routes.map((r) => {
		const ends = `${r.edge.from} -> ${r.edge.to}`;
		const n = (seen.get(ends) ?? 0) + 1;
		seen.set(ends, n);
		return { key: n > 1 ? `${ends} #${n}` : ends, r };
	});
};
const after = new Map(keyed(b.routes).map((k) => [k.key, k.r]));
for (const { key, r } of keyed(a.routes)) {
	const s = after.get(key);
	if (!s) {
		console.log(`edge  ${key.padEnd(36)} removed`);
		continue;
	}
	const same = JSON.stringify(r.points) === JSON.stringify(s.points);
	const shape =
		r.points.length === s.points.length
			? ""
			: ` shape ${r.points.length - 1}->${s.points.length - 1} segments`;
	const label =
		r.label && s.label
			? r.label.x !== s.label.x || r.label.y !== s.label.y
				? ` label ${moved(s.label.x - r.label.x, s.label.y - r.label.y)}${r.label.anchor !== s.label.anchor ? ` anchor ${r.label.anchor}->${s.label.anchor}` : ""}`
				: ""
			: r.label || s.label
				? " label added or removed"
				: "";
	console.log(`edge  ${key.padEnd(36)} ${same ? "still" : `moved${shape}`}${label}`);
}
