// Public surface of the ablauf core: parse, snap, render. Adapters live in
// src/adapters/ and are reached through the "ablauf/tiptap" and "ablauf/react"
// export paths, never from here.
export {
  COL,
  GRID,
  MARGIN,
  PAD,
  ROW,
  boxOf,
  contentBounds,
  overlaps,
  sizeOf,
} from "./geometry.js";
export type { Bounds, Box, Position, Size } from "./geometry.js";
export { ORIGIN, adjacency, fallbackPoint } from "./layout/fallback.js";
export type { Adjacency } from "./layout/fallback.js";
export { snap } from "./layout/snap.js";
export type { Dir, Directive, SnapResult, Warning, WarningCode } from "./layout/snap.js";
export { isPosition, jsonStore, orphans, pruneOrphans } from "./layout/store.js";
export type { JsonLayoutStore, LayoutJson, LayoutStore } from "./layout/store.js";
export { ParseError, parse } from "./parse.js";
export { RenderError, svgMeta, toSvg } from "./render/svg.js";
export type { RenderOptions, SvgMeta } from "./render/svg.js";
export { DARK_THEME, DEFAULT_THEME } from "./render/theme.js";
export type { Theme } from "./render/theme.js";
export { SerializeError, serialize } from "./serialize.js";
export type { Direction, Edge, EdgeStyle, Graph, Node, NodeKind } from "./types.js";
