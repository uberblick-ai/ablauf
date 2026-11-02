// The playground's sidebar: every .flow in examples/ and docs/trials/, grouped by
// diagram kind as on the showcase. A file's kind is its first source line,
// the same test render() uses; an unrecognised kind is drawn as a flow.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Keep the browser's folder names independent of their repository paths.
export const FOLDERS: Record<string, string> = { examples: "examples", trials: join("docs", "trials") };

export interface Entry {
  folder: string;
  name: string;
}

export interface Group {
  kind: string;
  flows: Entry[];
}

const KINDS = [
  { kind: "Flow", test: (first: string) => !/^(?:fan-out|sequence)(?:\s|$)/.test(first) },
  { kind: "Fan-out", test: (first: string) => /^fan-out(?:\s|$)/.test(first) },
  { kind: "Sequence", test: (first: string) => /^sequence(?:\s|$)/.test(first) },
];

export function catalog(root: string): Group[] {
  const entries = Object.entries(FOLDERS).flatMap(([folder, directory]) =>
    readdirSync(join(root, directory))
      .filter((f) => f.endsWith(".flow"))
      .sort()
      .map((f) => {
        const source = readFileSync(join(root, directory, f), "utf8");
        const first = source.split("\n").find((line) => line.trim() && !line.trim().startsWith("#"))?.trim() ?? "";
        return { folder, name: f.slice(0, -5), first };
      }),
  );
  return KINDS.map(({ kind, test }) => ({
    kind,
    flows: entries.filter((e) => test(e.first)).map(({ folder, name }) => ({ folder, name })),
  })).filter((g) => g.flows.length);
}
