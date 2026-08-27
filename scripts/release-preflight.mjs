// The refusal gate in front of `npm publish`: everything that must be true
// *before* a release run is allowed to contact the registry with credentials.
// It is a plain script, not workflow YAML, so the same six answers are one
// command away on a laptop (`node scripts/release-preflight.mjs 0.1.0`) as
// they are in `.github/workflows/release.yml`.
//
// Two ordering rules it exists to protect (`docs/releasing.md`):
//   - a version is published once and never again — so a version already on
//     the registry, or a `v<version>` tag that already exists, stops the run
//     here rather than halfway through;
//   - the artifact must be the commit `main` currently points at, because the
//     tag pushed afterwards names that commit.
//
// The version is validated first and alone, because every other check is a
// question *about* that version; past it every check runs, so one command
// reports every reason a dispatch is wrong instead of one reason per attempt.
// Anything unanswerable — no network, no
// remote, a registry error that is not "no such version" — is a failure, never
// a shrug: "we could not ask" must never read as "it is not published".
//
// Node built-ins only, no dependencies (D15).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/** A release version: three numbers, no `v`, no prerelease, no build metadata. */
const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const version = process.argv[2];
if (!version) {
  console.error("usage: node scripts/release-preflight.mjs <version>   # e.g. 0.1.0");
  process.exit(2);
}

if (!RELEASE_VERSION.test(version)) {
  console.error(
    `"${version}" is not a release version — expected x.y.z, no leading "v", no ` +
      "prerelease or build metadata (prereleases go the manual route). Nothing was published.",
  );
  process.exit(1);
}

const capture = (cmd, args) => {
  const res = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8" });
  if (res.error) throw res.error;
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
};

/** Like `capture`, but a non-zero exit is the caller's problem to explain. */
const mustRun = (cmd, args) => {
  const { status, stdout, stderr } = capture(cmd, args);
  if (status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${stderr.trim()}`);
  return stdout.trim();
};

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const checks = [
  [
    "package.json carries exactly that version",
    () => {
      if (manifest.version !== version) {
        throw new Error(
          `package.json says ${manifest.version}, the dispatch says ${version} — ` +
            "bump the manifest on main first, then dispatch that commit",
        );
      }
      return `${manifest.name}@${manifest.version}`;
    },
  ],
  [
    "the manifest declares no runtime dependencies",
    () => {
      const deps = Object.keys(manifest.dependencies ?? {});
      if (deps.length > 0) throw new Error(`package.json declares ${deps.join(", ")}`);
      return "none";
    },
  ],
  [
    "HEAD is the current tip of origin/main",
    () => {
      const head = mustRun("git", ["rev-parse", "HEAD"]);
      const remote = mustRun("git", ["ls-remote", "origin", "refs/heads/main"]).split(/\s/)[0];
      if (!remote) throw new Error("origin has no refs/heads/main");
      if (head !== remote) {
        throw new Error(
          `HEAD is ${head.slice(0, 12)} but origin/main is ${remote.slice(0, 12)} — ` +
            "release only from the commit main points at",
        );
      }
      return `${head.slice(0, 12)} (origin/main)`;
    },
  ],
  [
    `no v${version} tag exists yet`,
    () => {
      const local = capture("git", ["rev-parse", "-q", "--verify", `refs/tags/v${version}`]);
      if (local.status === 0) throw new Error(`refs/tags/v${version} already exists locally`);
      const remote = mustRun("git", ["ls-remote", "--tags", "origin", `v${version}`]);
      if (remote) throw new Error(`origin already has the tag:\n${remote}`);
      return `v${version} is free`;
    },
  ],
  [
    `${version} is not on the registry yet`,
    () => {
      const spec = `${manifest.name}@${version}`;
      const { status, stdout, stderr } = capture("npm", ["view", spec, "version", "--json"]);
      if (status === 0 && stdout.trim() && stdout.trim() !== "undefined") {
        throw new Error(`${spec} is already published — npm versions are never reused`);
      }
      // `npm view --json` reports a missing package or version as an E404 body
      // on stdout with a non-zero exit. Any other failure means the registry
      // did not answer, which is not permission to publish.
      let code;
      try {
        code = JSON.parse(stdout).error?.code;
      } catch {
        code = undefined;
      }
      if (code !== "E404") {
        throw new Error(`could not ask the registry about ${spec}:\n${(stderr || stdout).trim()}`);
      }
      return "not published";
    },
  ],
];

console.log(`release preflight — ${manifest.name} ${version}\n`);

let failed = 0;
for (const [label, check] of checks) {
  try {
    console.log(`  ok    ${label}: ${check()}`);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL  ${label}`);
    for (const line of String(err instanceof Error ? err.message : err).split("\n")) {
      console.log(`        ${line}`);
    }
  }
}

if (failed > 0) {
  console.error(`\npreflight failed: ${failed} of ${checks.length} checks. Nothing was published.`);
  process.exit(1);
}
console.log(`\npreflight: ok — ${manifest.name}@${version} is clear to publish`);
