// The playground's sidebar: every .flow in examples/ and trials/, grouped by
// diagram kind as on the showcase. A file's kind is its first source line,
// the same test render() uses; a file of neither kind is drawn as a flow.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const FOLDERS = ["examples", "trials"];

export interface Entry {
  folder: string;
  name: string;
}

export interface Group {
  kind: string;
  flows: Entry[];
}

const KINDS = [
  { kind: "Flow", test: (first: string) => !/^fan-out(?:\s|$)/.test(first) },
  { kind: "Fan-out", test: (first: string) => /^fan-out(?:\s|$)/.test(first) },
];

export function catalog(root: string): Group[] {
  const entries = FOLDERS.flatMap((folder) =>
    readdirSync(join(root, folder))
      .filter((f) => f.endsWith(".flow"))
      .sort()
      .map((f) => {
        const source = readFileSync(join(root, folder, f), "utf8");
        const first = source.split("\n").find((line) => line.trim() && !line.trim().startsWith("#"))?.trim() ?? "";
        return { folder, name: f.slice(0, -5), first };
      }),
  );
  return KINDS.map(({ kind, test }) => ({
    kind,
    flows: entries.filter((e) => test(e.first)).map(({ folder, name }) => ({ folder, name })),
  })).filter((g) => g.flows.length);
}
