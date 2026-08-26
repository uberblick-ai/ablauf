// The consumer gate: proves that what `npm publish` would upload is what a
// host can actually install and use. Everything else in this repo tests the
// library from inside the checkout, where `src/` is on disk and TypeScript is
// installed — neither is true for `pnpm add @uberblick/ablauf`.
//
// Three claims, in order:
//   1. The tarball carries dist JS + declarations, the agent procedure, the
//      normative specs, README, LICENSE, manifest — and nothing else. Source,
//      tests, fixtures, the demo, the acceptance output and these scripts stay
//      out; a forbidden path is a hard failure, not a warning.
//   2. The published types resolve and check against a real consumer's
//      compiler settings — under `bundler` resolution (what a Vite/webpack
//      host uses) and under `node16` (what a plain Node ESM host uses).
//   3. The published JavaScript runs: parse → snap → toSvg in a project that
//      has never seen this repo, with the tarball as its only dependency.
//
// `pnpm pack` runs `prepack`, so the build is never stale (D14: one package,
// `tsc`, no bundler). Zero dependencies of its own, like everything in here.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/** Paths that must never ship: shipping them is a leak, not a size problem. */
const FORBIDDEN = [/^src\//, /^test\//, /^fixtures\//, /^demo\//, /^out\//, /^scripts\//];

/** Every claim the package makes about its own contents, as a predicate. */
const REQUIRED = [
  ["a dist entry point", (f) => f === "dist/index.js"],
  ["dist declarations", (f) => f === "dist/index.d.ts"],
  ["more built JavaScript", (f) => f.startsWith("dist/") && f.endsWith(".js")],
  ["the agent procedure", (f) => f === "agent/layout-preserving-edit.md"],
  ["the format spec", (f) => f === "docs/spec/format.md"],
  ["the layout-store spec", (f) => f === "docs/spec/layout-store.md"],
  ["README.md", (f) => f === "README.md"],
  ["LICENSE", (f) => f === "LICENSE"],
  ["the manifest", (f) => f === "package.json"],
];

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

const consumerTs = `import { DEFAULT_THEME, ParseError, parse, snap, toSvg } from "@uberblick/ablauf";
import type { Directive, Graph, Position, SnapResult, Theme } from "@uberblick/ablauf";

const graph: Graph = parse("flowchart TD\\n  a[Start] --> b[End]");
const directives: readonly Directive[] = [{ id: "b", rel: { of: "a", dir: "below" } }];
const result: SnapResult = snap(graph, { a: { x: 100, y: 100 } }, directives);
const placed: Position = result.positions.b;
const written: Record<string, Position> = result.writes;
const theme: Theme = DEFAULT_THEME;
const svg: string = toSvg(graph, result.positions, { theme });
const error: typeof ParseError = ParseError;

export { graph, placed, written, svg, error };
`;

const consumerMjs = `import assert from "node:assert/strict";
import { DEFAULT_THEME, ParseError, parse, snap, toSvg } from "@uberblick/ablauf";

const graph = parse("flowchart TD\\n  a[Start] --> b{Ok?}\\n  b -->|yes| c([Done])");
assert.equal(graph.nodes.length, 3);

const { positions, writes, warnings } = snap(graph, { a: { x: 100, y: 100 } }, [
  { id: "b", rel: { of: "a", dir: "below" } },
]);
assert.deepEqual(positions.a, { x: 100, y: 100 }, "a frozen node keeps its position");
assert.ok(!("a" in writes), "a frozen node is not rewritten");

const svg = toSvg(graph, positions, { theme: DEFAULT_THEME });
assert.ok(svg.startsWith("<svg"), "toSvg returns an SVG document");
assert.ok(svg.includes("Done"), "labels reach the output");
assert.equal(toSvg(graph, positions, { theme: DEFAULT_THEME }), svg, "same input, same bytes");

assert.throws(() => parse("subgraph nope"), ParseError);

console.log(
  \`consumer ok — \${graph.nodes.length} nodes, \${warnings.length} warnings, \${svg.length} bytes of SVG\`,
);
`;

const tsconfigFor = (moduleKind, resolution) => ({
  compilerOptions: {
    target: "es2023",
    lib: ["es2023"],
    module: moduleKind,
    moduleResolution: resolution,
    strict: true,
    verbatimModuleSyntax: true,
    skipLibCheck: true,
    noEmit: true,
  },
  files: ["consumer.ts"],
});

const work = mkdtempSync(join(tmpdir(), "ablauf-pack-"));
let ok = false;
try {
  // 1. Build and pack. `prepack` makes the build unskippable.
  console.log("→ pnpm pack (runs prepack → build)");
  const packed = run("pnpm", ["pack", "--pack-destination", work], ROOT).trim().split("\n").pop();
  console.log(`  ${packed}`);

  const files = run("tar", ["-tzf", packed], work)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    // npm tarballs put everything under `package/`; directory entries end in /.
    .map((line) => line.replace(/^package\//, ""))
    .filter((line) => !line.endsWith("/"))
    .sort();

  console.log(`\n→ tarball contents (${files.length} files)`);
  for (const file of files) console.log(`  ${file}`);

  const leaked = files.filter((f) => FORBIDDEN.some((re) => re.test(f)));
  const absent = REQUIRED.filter(([, want]) => !files.some((f) => want(f))).map(([what]) => what);
  if (leaked.length > 0) {
    throw new Error(`the tarball ships paths it must not:\n  ${leaked.join("\n  ")}`);
  }
  if (absent.length > 0) {
    throw new Error(`the tarball is missing:\n  ${absent.join("\n  ")}`);
  }

  // 2. A consumer that has never seen this repo: its own project, npm, and the
  //    tarball as its only dependency.
  const consumer = join(work, "consumer");
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, "package.json"),
    `${JSON.stringify({ name: "ablauf-consumer", version: "0.0.0", private: true, type: "module" }, null, 2)}\n`,
  );
  writeFileSync(join(consumer, "consumer.ts"), consumerTs);
  writeFileSync(join(consumer, "consumer.mjs"), consumerMjs);

  console.log("\n→ npm install <tarball>");
  run("npm", ["install", "--no-audit", "--no-fund", "--no-package-lock", packed], consumer);

  // 3. Typecheck with this repo's TypeScript, under both resolutions a real
  //    host uses: `bundler` (Vite/webpack) and `node16` (plain Node ESM).
  const tsc = join(ROOT, "node_modules", "typescript", "bin", "tsc");
  for (const [moduleKind, resolution] of [
    ["esnext", "bundler"],
    ["node16", "node16"],
  ]) {
    const config = join(consumer, `tsconfig.${resolution}.json`);
    writeFileSync(config, `${JSON.stringify(tsconfigFor(moduleKind, resolution), null, 2)}\n`);
    console.log(`→ tsc --noEmit (moduleResolution: ${resolution})`);
    run(process.execPath, [tsc, "-p", config], consumer);
  }

  // 4. Run it.
  console.log("→ node consumer.mjs");
  process.stdout.write(run(process.execPath, ["consumer.mjs"], consumer));

  ok = true;
  console.log("\npack-check: ok");
} catch (err) {
  console.error(`\npack-check failed: ${err instanceof Error ? err.message : err}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
