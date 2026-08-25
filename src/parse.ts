import type { Direction, Edge, EdgeStyle, Graph, Node, NodeKind } from "./types.js";

/**
 * Every rejected construct throws this, one at a time — first error wins.
 * `construct` is a stable slug (see the rejected-constructs table in
 * docs/spec/format.md) so a host can branch on the failure without matching
 * on prose.
 */
export class ParseError extends Error {
  readonly line: number;
  readonly column: number;
  readonly construct: string;

  constructor(line: number, column: number, construct: string, detail: string) {
    super(`line ${line}:${column}: ${detail}`);
    this.name = "ParseError";
    this.line = line;
    this.column = column;
    this.construct = construct;
  }
}

const DIRECTIONS: readonly string[] = ["TD", "TB", "LR", "RL", "BT"];

// Longest opener first: `([` and `((` have to win over `(`.
const SHAPES = [
  { open: "([", close: "])", kind: "stadium" },
  { open: "((", close: "))", kind: "circle" },
  { open: "[", close: "]", kind: "process" },
  { open: "(", close: ")", kind: "rounded" },
  { open: "{", close: "}", kind: "decision" },
] as const satisfies readonly { open: string; close: string; kind: NodeKind }[];

const SHAPE_HELP =
  "ablauf supports five shapes: `id[label]` process, `id(label)` rounded, `id([label])` stadium, `id{label}` decision, `id((label))` circle";

// mermaid's other shape openers, listed so that `A[[Sub]]` reports an
// unsupported shape instead of dying somewhere inside the label scanner.
const REJECTED_OPENERS = ["@{", "(((", "[[", "[(", "[/", "[\\", "{{", ">"];

const PLAIN_CONNECTORS = [
  { text: "-.->", style: "dotted" },
  { text: "-->", style: "arrow" },
  { text: "---", style: "open" },
  { text: "==>", style: "thick" },
] as const satisfies readonly { text: string; style: EdgeStyle }[];

// The `A -- text --> B` spellings: an opener, then the arrow that closes the
// label. `--` can close as either `-->` or `---`, so the nearest one wins.
const MID_CONNECTORS = [
  { open: "-.", closers: [{ text: ".->", style: "dotted" }] },
  { open: "--", closers: [{ text: "-->", style: "arrow" }, { text: "---", style: "open" }] },
  { open: "==", closers: [{ text: "==>", style: "thick" }] },
] as const satisfies readonly { open: string; closers: readonly { text: string; style: EdgeStyle }[] }[];

const REJECTED_KEYWORDS: Record<string, string> = {
  subgraph:
    "`subgraph` is not supported: v1 has no clusters, and half-supporting them would move nodes ablauf promises not to move",
  end: "`end` closes a `subgraph`, which is not supported",
  style: "`style` is not supported: a node's appearance comes from its shape, not from the text",
  classDef: "`classDef` is not supported: a node's appearance comes from its shape, not from the text",
  class: "`class` is not supported: a node's appearance comes from its shape, not from the text",
  linkStyle:
    "`linkStyle` is not supported: an edge's appearance comes from its connector (`-->`, `---`, `-.->`, `==>`)",
  click: "`click` is not supported: the text carries semantics only, no interaction",
  direction:
    "`direction` only applies inside a `subgraph`; set the chart direction in the `flowchart` header",
};

/**
 * mermaid's statement keywords. None of them is a legal node id — mermaid
 * parses them as statements wherever they appear — so they are rejected in id
 * position as well as at the start of a line.
 */
const RESERVED_IDS: ReadonlySet<string> = new Set([
  ...Object.keys(REJECTED_KEYWORDS),
  "graph",
  "flowchart",
]);

// The three mermaid entity escapes the serializer emits, decoded here so that
// a label survives serialize → parse verbatim. Every other `#…;` entity form is
// rejected rather than passed through: a label may not mean one thing here and
// another in a mermaid renderer.
const ENTITIES = new Map([
  ["quot", '"'],
  ["124", "|"],
  ["35", "#"],
]);
const ENTITY = /#([A-Za-z0-9]+);/g;

// `%%`, a raw `|`, or a shape closer inside a bare label: the shape or the
// edge label closed early, or the text after it is garbage. Either way the
// label has to be quoted.
const STRAY = /%%|[|\]})]/;

const isLetter = (c: string): boolean => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
const isIdChar = (c: string): boolean => isLetter(c) || (c >= "0" && c <= "9") || c === "_";

/**
 * The id starting at `i`, or `""` when there is none. This is the only
 * definition of the id grammar: a hyphen belongs to the id only when a name
 * character follows it, which keeps `a-b` one id while `a-->b` is an id, a
 * connector and another id — and is why an id never ends in `-`.
 */
const readId = (text: string, i: number): string => {
  const start = i;
  if (!isLetter(text[i] ?? "") && text[i] !== "_") return "";
  i++;
  for (;;) {
    const c = text[i] ?? "";
    if (isIdChar(c)) {
      i++;
      continue;
    }
    if (c === "-" && isIdChar(text[i + 1] ?? "")) {
      i += 2;
      continue;
    }
    return text.slice(start, i);
  }
};

/**
 * True for a string the parser reads back as exactly this id. The serializer
 * asks the lexer rather than carrying a second grammar that could drift from
 * it — `A-` and `A--B` look like ids but are not ones the parser can return.
 */
export const isId = (id: string): boolean =>
  id !== "" && readId(id, 0) === id && !RESERVED_IDS.has(id);

/** A hand-written line scanner; every rejection reports a line and a column. */
class Parser {
  private readonly nodes: Node[] = [];
  private readonly byId = new Map<string, Node>();
  private readonly shaped = new Set<string>();
  private readonly edges: Edge[] = [];
  private direction: Direction = "TD";
  private text = "";
  private line = 0;
  private i = 0;

  parse(source: string): Graph {
    const lines = source.split(/\r?\n/);
    let headerSeen = false;
    for (let n = 0; n < lines.length; n++) {
      this.text = lines[n] ?? "";
      this.line = n + 1;
      this.i = 0;
      this.skipSpace();
      if (this.i >= this.text.length) continue;
      if (this.at("%%{")) {
        this.fail("init", "`%%{init}%%` directives are not supported: ablauf takes no configuration from the text");
      }
      if (this.at("%%")) continue;
      this.rejectKeyword();
      this.rejectTrailingSemicolon();
      if (headerSeen) {
        this.parseChain();
      } else {
        this.parseHeader();
        headerSeen = true;
      }
    }
    if (!headerSeen) {
      throw new ParseError(1, 1, "missing-header", "no statements: the chart must open with a `flowchart` or `graph` header");
    }
    return { direction: this.direction, nodes: this.nodes, edges: this.edges };
  }

  private at(s: string): boolean {
    return this.text.startsWith(s, this.i);
  }

  private ch(): string {
    return this.text[this.i] ?? "";
  }

  private skipSpace(): void {
    while (this.ch() === " " || this.ch() === "\t") this.i++;
  }

  private fail(construct: string, detail: string, index = this.i): never {
    throw new ParseError(this.line, index + 1, construct, detail);
  }

  /** A run of letters: the header keyword, the direction, a rejected keyword. */
  private word(): string {
    const start = this.i;
    while (isLetter(this.ch())) this.i++;
    return this.text.slice(start, this.i);
  }

  /**
   * A statement keyword counts only at a token boundary: `style A fill:#f00`
   * is a `style` statement, while `style-node[ok]` and `style1[ok]` are
   * ordinary ids that happen to start with one.
   */
  private rejectKeyword(): void {
    const word = readId(this.text, this.i);
    const why = REJECTED_KEYWORDS[word];
    if (why !== undefined) this.fail(word, why);
  }

  private rejectTrailingSemicolon(): void {
    const last = this.text.trimEnd().length - 1;
    if (this.text[last] === ";") {
      this.fail("semicolon", "`;` statement separators are not supported: write one statement per line", last);
    }
  }

  private parseHeader(): void {
    const start = this.i;
    const keyword = this.word();
    if (keyword !== "flowchart" && keyword !== "graph") {
      this.fail(
        "missing-header",
        "the chart must open with a `flowchart` or `graph` header, optionally followed by a direction (TD, TB, LR, RL, BT)",
        start,
      );
    }
    this.skipSpace();
    if (this.i < this.text.length) {
      const at = this.i;
      const token = this.word();
      if (!DIRECTIONS.includes(token)) {
        const shown = token === "" ? this.text.slice(at).trimEnd() : token;
        this.fail("bad-direction", `\`${shown}\` is not a supported direction; use TD, TB, LR, RL or BT`, at);
      }
      this.direction = token as Direction;
      this.skipSpace();
    }
    if (this.i < this.text.length) {
      this.fail("header", "the header line takes nothing but a direction; start the chart on the next line");
    }
  }

  private parseChain(): void {
    let left = this.parseGroup();
    for (;;) {
      this.skipSpace();
      const connector = this.matchConnector();
      if (connector === undefined) break;
      const right = this.parseGroup();
      for (const from of left) {
        for (const to of right) {
          this.edges.push(
            connector.label === undefined
              ? { from, to, style: connector.style }
              : { from, to, style: connector.style, label: connector.label },
          );
        }
      }
      left = right;
    }
    this.skipSpace();
    if (this.i < this.text.length) {
      if (this.ch() === ";") {
        this.fail("semicolon", "`;` statement separators are not supported: write one statement per line");
      }
      this.fail(
        "unparsable-line",
        `unexpected \`${this.text.slice(this.i).trimEnd()}\`: a statement is a node declaration or a chain of edges`,
      );
    }
  }

  /** One side of an edge: `A`, or `A & B & C`. */
  private parseGroup(): string[] {
    const ids: string[] = [];
    for (;;) {
      this.skipSpace();
      ids.push(this.parseNodeRef());
      this.skipSpace();
      if (this.ch() !== "&") return ids;
      this.i++;
    }
  }

  private parseNodeRef(): string {
    const start = this.i;
    const id = readId(this.text, this.i);
    this.i += id.length;
    if (id === "") {
      const found = this.text.slice(this.i, this.i + 12).trimEnd();
      this.fail(
        "bad-id",
        `expected a node id matching \`[A-Za-z_][A-Za-z0-9_-]*[A-Za-z0-9_]\`, found ${found === "" ? "the end of the line" : `\`${found}\``}`,
        start,
      );
    }
    if (RESERVED_IDS.has(id)) {
      this.fail("bad-id", `\`${id}\` is a mermaid keyword, not a legal node id`, start);
    }
    this.declare(id, this.nodeShape(), start);
    return id;
  }

  private nodeShape(): { kind: NodeKind; label: string } | undefined {
    const rejected = REJECTED_OPENERS.find((o) => this.at(o));
    if (rejected !== undefined) {
      this.fail("unknown-shape", `\`${rejected}\` is not a supported shape: ${SHAPE_HELP}`);
    }
    const shape = SHAPES.find((s) => this.at(s.open));
    if (shape === undefined) return undefined;
    this.i += shape.open.length;
    return { kind: shape.kind, label: this.readLabel(shape.close, "a node label") };
  }

  private matchConnector(): { style: EdgeStyle; label?: string } | undefined {
    const plain = PLAIN_CONNECTORS.find((c) => this.at(c.text));
    if (plain !== undefined) {
      this.i += plain.text.length;
      const label = this.pipeLabel();
      return label === undefined ? { style: plain.style } : { style: plain.style, label };
    }
    const mid = MID_CONNECTORS.find((c) => this.at(c.open));
    if (mid === undefined) return undefined;
    const opener = this.i;
    this.i += mid.open.length;
    this.skipSpace();
    let closer: { text: string; style: EdgeStyle } | undefined;
    let label: string;
    if (this.ch() === '"') {
      // A quoted label may contain the closing arrow, so the closing quote is
      // found first and the closer has to follow it.
      const end = this.text.indexOf('"', this.i + 1);
      if (end < 0) this.fail("unterminated-label", 'an edge label opens with `"` but never closes it');
      label = this.decode(this.text.slice(this.i + 1, end), this.i + 1);
      this.i = end + 1;
      this.skipSpace();
      closer = mid.closers.find((c) => this.at(c.text));
      if (closer === undefined) this.fail("edge", this.unclosedEdge(mid), opener);
      this.i += closer.text.length;
    } else {
      let cut = -1;
      for (const candidate of mid.closers) {
        const found = this.text.indexOf(candidate.text, this.i);
        if (found >= 0 && (cut < 0 || found < cut)) {
          cut = found;
          closer = candidate;
        }
      }
      if (closer === undefined) this.fail("edge", this.unclosedEdge(mid), opener);
      label = this.bareLabel(this.text.slice(this.i, cut), "an edge label", this.i);
      if (label === "") this.fail("empty-label", 'an edge label is empty; write `""` if that is deliberate', opener);
      this.i = cut + closer.text.length;
    }
    if (this.pipeLabel() !== undefined) {
      this.fail("edge", "an edge carries one label: either `-- text -->` or `-->|text|`, never both", opener);
    }
    return { style: closer.style, label };
  }

  private unclosedEdge(mid: { open: string; closers: readonly { text: string }[] }): string {
    const arrows = mid.closers.map((c) => `\`${c.text}\``).join(" or ");
    return `an edge label opened with \`${mid.open}\` but no ${arrows} closes it`;
  }

  /** The `-->|text|` spelling, read after the connector. */
  private pipeLabel(): string | undefined {
    const save = this.i;
    this.skipSpace();
    if (this.ch() !== "|") {
      this.i = save;
      return undefined;
    }
    this.i++;
    return this.readLabel("|", "an edge label");
  }

  /** Decode the three supported entity escapes; reject any other `#…;` form. */
  private decode(raw: string, at: number): string {
    return raw.replace(ENTITY, (whole, body: string, offset: number) => {
      const decoded = ENTITIES.get(body);
      if (decoded === undefined) {
        this.fail(
          "entity",
          `\`${whole}\` is not a supported entity: ablauf decodes \`#quot;\`, \`#124;\` and \`#35;\` only`,
          at + offset,
        );
      }
      return decoded;
    });
  }

  /** A bare label, checked for the delimiters that only a quoted one may hold. */
  private bareLabel(raw: string, what: string, at: number): string {
    const stray = STRAY.exec(raw);
    if (stray !== null) {
      this.fail(
        "bare-label",
        `${what} contains \`${stray[0]}\`: quote a label that contains \`%%\`, \`|\` or a shape delimiter`,
        at + stray.index,
      );
    }
    return this.decode(raw, at).trim();
  }

  private readLabel(close: string, what: string): string {
    if (this.ch() === '"') {
      const end = this.text.indexOf('"', this.i + 1);
      if (end < 0) this.fail("unterminated-label", `${what} opens with \`"\` but never closes it`);
      const label = this.decode(this.text.slice(this.i + 1, end), this.i + 1);
      this.i = end + 1;
      if (!this.at(close)) this.fail("unterminated-label", `expected \`${close}\` after the quoted label`);
      this.i += close.length;
      return label;
    }
    const end = this.text.indexOf(close, this.i);
    if (end < 0) this.fail("unterminated-label", `${what} is missing its closing \`${close}\``);
    const label = this.bareLabel(this.text.slice(this.i, end), what, this.i);
    if (label === "") this.fail("empty-label", `${what} is empty; write \`""\` if that is deliberate`);
    this.i = end + close.length;
    return label;
  }

  private declare(id: string, shape: { kind: NodeKind; label: string } | undefined, at: number): void {
    const existing = this.byId.get(id);
    if (shape === undefined) {
      // A bare reference to an undeclared id is a process node labelled with
      // the id; a bare reference to a declared one adds nothing.
      if (existing === undefined) this.push({ id, label: id, kind: "process" });
      return;
    }
    if (existing === undefined) {
      this.push({ id, label: shape.label, kind: shape.kind });
      this.shaped.add(id);
      return;
    }
    if (this.shaped.has(id)) {
      if (existing.kind !== shape.kind || existing.label !== shape.label) {
        this.fail(
          "duplicate-node",
          `node \`${id}\` is already declared as ${existing.kind} \`${existing.label}\`; give a node its shape and label once and reference it bare afterwards`,
          at,
        );
      }
      return;
    }
    // Declared after being referenced bare: keep its first-appearance slot in
    // `nodes`, take the shape and label.
    existing.kind = shape.kind;
    existing.label = shape.label;
    this.shaped.add(id);
  }

  private push(node: Node): void {
    this.nodes.push(node);
    this.byId.set(node.id, node);
  }
}

/** Parse ablauf text (a mermaid-flowchart subset) into a graph. */
export const parse = (source: string): Graph => new Parser().parse(source);
