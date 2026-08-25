import { isId } from "./parse.js";
import type { EdgeStyle, Graph, Node, NodeKind } from "./types.js";

/**
 * A graph that has no ablauf text: an id the parser would reject, one id
 * declared twice with two different labels, an edge hanging off a node that
 * was never declared, a label with a newline in it. The serializer refuses
 * rather than emitting something mermaid misreads.
 */
export class SerializeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SerializeError";
  }
}

const SHAPE: Record<NodeKind, readonly [string, string]> = {
  process: ["[", "]"],
  rounded: ["(", ")"],
  stadium: ["([", "])"],
  decision: ["{", "}"],
  circle: ["((", "))"],
};

const CONNECTOR: Record<EdgeStyle, string> = {
  arrow: "-->",
  open: "---",
  dotted: "-.->",
  thick: "==>",
};

// Characters that are safe unquoted in every position the serializer emits a
// label. Anything else — brackets, pipes, `%`, `#`, `<`, `>`, `=` — gets
// quotes, which is what keeps the output parsable as mermaid.
const BARE = /^[A-Za-z0-9_][A-Za-z0-9_ .,:!?'+*/-]*$/;

/**
 * Quote a label unless it is plainly safe bare. `"`, `|` and `#` have no bare
 * spelling at all, so they go out as the mermaid entity escapes the parser
 * decodes again — `#` first, or the escapes would escape each other.
 */
const label = (raw: string): string => {
  const escaped = raw.replaceAll("#", "#35;").replaceAll('"', "#quot;").replaceAll("|", "#124;");
  return BARE.test(escaped) && escaped === escaped.trim() ? escaped : `"${escaped}"`;
};

/**
 * Render a graph as ablauf text: the header, one node declaration per line,
 * then one edge per line. Normalising (`|label|` spelling, `&` groups
 * expanded) is safe because this is an export path — ablauf never writes a
 * serialization back over a human's source (D13).
 */
export const serialize = (graph: Graph): string => {
  // Keyed by id, so an identical re-declaration collapses into the one line
  // the parser would read back; a conflicting one has no text at all.
  const nodes = new Map<string, Node>();
  for (const node of graph.nodes) {
    if (!isId(node.id)) {
      throw new SerializeError(`node id \`${node.id}\` is not a legal ablauf id`);
    }
    if (/[\r\n]/.test(node.label)) {
      throw new SerializeError(`the label of node \`${node.id}\` contains a newline`);
    }
    const first = nodes.get(node.id);
    if (first === undefined) {
      nodes.set(node.id, node);
    } else if (first.kind !== node.kind || first.label !== node.label) {
      throw new SerializeError(
        `node \`${node.id}\` is declared twice, as ${first.kind} \`${first.label}\` and as ${node.kind} \`${node.label}\``,
      );
    }
  }
  for (const edge of graph.edges) {
    const end = [edge.from, edge.to].find((id) => !nodes.has(id));
    if (end !== undefined) {
      throw new SerializeError(`edge \`${edge.from}\` → \`${edge.to}\` ends at undeclared node \`${end}\``);
    }
    if (/[\r\n]/.test(edge.label ?? "")) {
      throw new SerializeError(`the label of edge \`${edge.from}\` → \`${edge.to}\` contains a newline`);
    }
  }
  const lines = [`flowchart ${graph.direction}`];
  for (const node of nodes.values()) {
    const [open, close] = SHAPE[node.kind];
    lines.push(`  ${node.id}${open}${label(node.label)}${close}`);
  }
  for (const edge of graph.edges) {
    const text = edge.label === undefined ? "" : `|${label(edge.label)}|`;
    lines.push(`  ${edge.from} ${CONNECTOR[edge.style]}${text} ${edge.to}`);
  }
  return `${lines.join("\n")}\n`;
};
