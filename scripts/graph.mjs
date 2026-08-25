// What the two acceptance scripts share: where the committed fixtures are, and
// how a scenario's ops turn one Graph into the next one. Both the gate and the
// gallery mutate graphs, so the applier lives here instead of twice.
//
// Nothing here imports the library. Both scripts import it from `dist/`, so
// `pnpm build` has to have run — `pnpm acceptance` does that for you.
import { readFileSync } from "node:fs";

export const ROOT = new URL("../", import.meta.url);

export const read = (path) => readFileSync(new URL(path, ROOT), "utf8");
export const readJson = (path) => JSON.parse(read(path));

/** The two hand-arranged fixtures, by the id every fixture file keys them on. */
export const FIXTURES = ["auth", "deploy"];

/**
 * The titles the goldens were rendered with. `title` is emitted as `<title>`,
 * so it is part of the SVG's bytes: rendering the fixtures without it would
 * miss the committed goldens by exactly one element.
 */
export const TITLES = { auth: "Room auth flow", deploy: "Deploy pipeline" };

/**
 * A graph mutation, in the spike's op vocabulary (`fixtures/spike/README.md`).
 * Pure: the input graph is never touched, because the base graph is rendered
 * as "before" in the same run.
 */
export const applyOps = (graph, ops) => {
  const nodes = graph.nodes.map((n) => ({ ...n }));
  let edges = graph.edges.map((e) => ({ ...e }));
  for (const op of ops) {
    switch (op.op) {
      case "addNode":
        nodes.push({ id: op.id, label: op.label, kind: op.kind });
        break;
      case "delNode": {
        const i = nodes.findIndex((n) => n.id === op.id);
        if (i >= 0) nodes.splice(i, 1);
        edges = edges.filter((e) => e.from !== op.id && e.to !== op.id);
        break;
      }
      case "addEdge":
        edges.push({
          from: op.from,
          to: op.to,
          style: "arrow",
          ...(op.label === undefined ? {} : { label: op.label }),
        });
        break;
      case "delEdge":
        edges = edges.filter((e) => !(e.from === op.from && e.to === op.to));
        break;
      case "relabel": {
        const n = nodes.find((x) => x.id === op.id);
        if (n) n.label = op.label;
        break;
      }
      default:
        throw new Error(`unknown op "${op.op}"`);
    }
  }
  return { direction: graph.direction, nodes, edges };
};

/** `<`, `&` and friends, for the text this script puts into the gallery's HTML. */
export const escapeHtml = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
