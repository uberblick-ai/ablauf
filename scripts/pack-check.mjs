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
//
// `--registry <version>` asks the same three questions of the copy npm is
// actually serving instead of a local build: it waits for the version to show
// up, insists the registry's own metadata lists no runtime dependencies, packs
// `@uberblick/ablauf@<version>` *from the registry*, and installs that exact
// version into the consumer. That is the post-publish half of a release
// (`docs/releasing.md`); the tag is pushed only once it passes.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const NAME = "@uberblick/ablauf";

/** Every manifest section npm installs at run time, not just `dependencies`. */
const RUNTIME_SECTIONS = ["dependencies", "optionalDependencies", "peerDependencies"];

const argv = process.argv.slice(2);
const flag = argv.indexOf("--registry");
const registryVersion = flag === -1 ? null : argv[flag + 1];
if (flag !== -1 && !registryVersion) {
  console.error("usage: node scripts/pack-check.mjs [--registry <version>]");
  process.exit(2);
}

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

/** A synchronous pause: the registry is allowed a moment to serve a new version. */
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// `npm view`, minus the E404 noise, keeping the distinction that matters:
// `null` is "npm could not answer" (no such version, no network, a registry
// error); `""` is "npm answered, and the answer is empty" — which is what a
// package with no dependencies looks like. Treating the first as the second
// would turn an unanswered question into a pass.
const view = (spec, field) => {
  const res = spawnSync("npm", ["view", spec, field, "--json"], { encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() : null;
};

/** Poll until npm serves the version, so "not there yet" never reads as broken. */
const waitForRegistry = (spec) => {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const served = view(spec, "version");
    if (served) return JSON.parse(served);
    console.log(`  ${spec} is not served yet (attempt ${attempt}/12) — waiting 5s`);
    sleep(5000);
  }
  throw new Error(`${spec} never appeared on the registry`);
};

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
    // Deliberately no `skipLibCheck`: it would hide errors *inside* the
    // shipped declarations, which is exactly what this check is for.
    noEmit: true,
  },
  files: ["consumer.ts"],
});

const work = mkdtempSync(join(tmpdir(), "ablauf-pack-"));
let ok = false;
try {
  // 1. Get the tarball under test: either the one this checkout would upload,
  //    or the one the registry is already serving.
  const spec = `${NAME}@${registryVersion}`;
  let packed;
  if (registryVersion) {
    console.log(`→ waiting for ${spec} on the registry`);
    console.log(`  serving ${waitForRegistry(spec)}`);

    // The registry's own metadata, not the checkout's manifest: a consumer
    // installs what npm says, and what npm says must be nothing — across all
    // three sections npm installs at run time, not just `dependencies`.
    // One field per call on purpose: asked for several at once, `npm view`
    // prints the bare object when only one of them exists and a keyed object
    // when more do, which is exactly the ambiguity this check cannot afford.
    for (const section of RUNTIME_SECTIONS) {
      const declared = view(spec, section);
      if (declared === null) {
        throw new Error(`could not ask the registry for ${spec} ${section}`);
      }
      const names = Object.keys(declared ? JSON.parse(declared) : {});
      if (names.length > 0) {
        throw new Error(`the published ${spec} declares ${section}: ${names.join(", ")}`);
      }
    }
    console.log(`→ npm view ${RUNTIME_SECTIONS.join(", ")}: all empty`);

    console.log(`→ npm pack ${spec} (the published tarball, not a local build)`);
    const name = run("npm", ["pack", spec, "--pack-destination", work], work)
      .trim()
      .split("\n")
      .pop();
    packed = isAbsolute(name) ? name : join(work, name);
  } else {
    // `prepack` makes the build unskippable.
    console.log("→ pnpm pack (runs prepack → build)");
    packed = run("pnpm", ["pack", "--pack-destination", work], ROOT).trim().split("\n").pop();
  }
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

  console.log(`\n→ npm install ${registryVersion ? spec : "<tarball>"}`);
  const dependency = registryVersion ? spec : packed;
  run("npm", ["install", "--no-audit", "--no-fund", "--no-package-lock", dependency], consumer);

  if (registryVersion) {
    const installed = JSON.parse(
      readFileSync(join(consumer, "node_modules", ...NAME.split("/"), "package.json"), "utf8"),
    ).version;
    if (installed !== registryVersion) {
      throw new Error(`the consumer resolved ${NAME}@${installed}, not ${registryVersion}`);
    }
    console.log(`  resolved ${spec}`);
  }

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
  console.log(`\npack-check: ok${registryVersion ? ` — ${spec} verified from the registry` : ""}`);
} catch (err) {
  console.error(`\npack-check failed: ${err instanceof Error ? err.message : err}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
