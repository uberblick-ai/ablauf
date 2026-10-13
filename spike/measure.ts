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
const key = (r: (typeof a.routes)[number]) => `${r.edge.from} -> ${r.edge.to}`;
for (const r of a.routes) {
	const s = b.routes.find((x) => key(x) === key(r));
	if (!s) {
		console.log(`edge  ${key(r).padEnd(36)} removed`);
		continue;
	}
	const same = JSON.stringify(r.points) === JSON.stringify(s.points);
	const shape =
		r.points.length === s.points.length
			? ""
			: ` shape ${r.points.length - 1}->${s.points.length - 1} segments`;
	console.log(`edge  ${key(r).padEnd(36)} ${same ? "still" : `moved${shape}`}`);
}
