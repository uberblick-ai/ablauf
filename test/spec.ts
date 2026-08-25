// The format spec is normative and ships in the package, so the tests read it
// rather than restating it: its "emitted constructs" and "rejected constructs"
// tables are cross-checked against the code, and drift in either direction
// fails here.
import { readFileSync } from "node:fs";

const SPEC = readFileSync(new URL("../docs/spec/format.md", import.meta.url), "utf8").split("\n");

/** A heading's body, up to the next heading of the same depth or shallower. */
export const section = (heading: string): string[] => {
  const start = SPEC.indexOf(heading);
  if (start < 0) throw new Error(`docs/spec/format.md has no "${heading}" heading`);
  const depth = heading.indexOf(" ");
  let end = start + 1;
  while (end < SPEC.length) {
    const line = SPEC[end]!;
    if (line.startsWith("#") && line.indexOf(" ") <= depth) break;
    end++;
  }
  return SPEC.slice(start + 1, end);
};

/** The data rows of the first markdown table in a section, cells unescaped. */
export const table = (heading: string): string[][] =>
  section(heading)
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim().replaceAll("\\|", "|").replaceAll("`", "")),
    )
    .filter((cells) => !cells[0]!.startsWith("---"))
    .slice(1);

/** The first fenced code block in a section. */
export const fenced = (heading: string): string[] => {
  const lines = section(heading);
  const open = lines.findIndex((line) => line.startsWith("```"));
  const close = lines.findIndex((line, i) => i > open && line.startsWith("```"));
  if (open < 0 || close < 0) throw new Error(`"${heading}" has no fenced code block`);
  return lines.slice(open + 1, close);
};
