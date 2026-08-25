// The parsed graph. Geometry is deliberately absent: positions live in the
// layout store, keyed by node id (D4), and the canvas is derived at render
// time from the content bounding box (D9).

/** Chart direction from the header. `TB` is kept as written; it means `TD`. */
export type Direction = "TD" | "TB" | "LR" | "RL" | "BT";

/** The five supported node shapes. */
export type NodeKind = "process" | "rounded" | "stadium" | "decision" | "circle";

/** The four supported connectors: `-->`, `---`, `-.->`, `==>`. */
export type EdgeStyle = "arrow" | "open" | "dotted" | "thick";

export type Node = { id: string; label: string; kind: NodeKind };

export type Edge = { from: string; to: string; style: EdgeStyle; label?: string };

/** `nodes` is in first-appearance order, `edges` in source order. */
export type Graph = { direction: Direction; nodes: Node[]; edges: Edge[] };
