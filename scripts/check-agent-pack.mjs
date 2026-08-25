// Drift guard for the enablement pack (`agent/`): the spec is the vocabulary's
// only definition, so the pack may not teach a directive form or a warning code
// the spec does not define, and may not leave a directive form unexampled.
//
// Deliberately grep-level. The examples' *values* are not checked here — they
// were produced by running `snap`, and the acceptance gate is what proves the
// pass still behaves that way.
import { readFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8");

const spec = read("docs/spec/layout-store.md");
const pack = read("agent/layout-preserving-edit.md");

const all = (re, text) => [...text.matchAll(re)].map((m) => m[1]);
const set = (xs) => new Set(xs);
const missing = (want, have) => [...want].filter((x) => !have.has(x)).sort();

// `{ id, rel: { … } }` in the spec's directive block; `{ "id": "x", "rel": …`
// in the pack's JSON examples.
const specForms = set(all(/\{\s*id,\s*([a-z]+):/g, spec));
const packForms = set(all(/\{\s*"id":\s*"[^"]*",\s*"([a-z]+)":/g, pack));

// The rows of the spec's warning table, against every code the pack quotes in a
// `"code": "…"` snippet.
const specCodes = set(all(/^\| {1,2}`([a-z-]+)` +\|/gm, spec.slice(spec.indexOf("### Warnings"))));
const packCodes = set(all(/"code":\s*"([a-z-]+)"/g, pack));

const problems = [
  [missing(specForms, packForms), "directive forms the spec defines but the pack never shows"],
  [missing(packForms, specForms), "directive forms the pack uses but the spec does not define"],
  [missing(packCodes, specCodes), "warning codes the pack quotes but the spec does not define"],
];

if (specForms.size === 0 || specCodes.size === 0) {
  console.error("FAIL  the spec's vocabulary did not parse — check the regexes in this script");
  process.exit(1);
}

let failed = false;
for (const [bad, what] of problems) {
  console.log(`${bad.length ? "FAIL" : "pass"}  ${what}${bad.length ? `: ${bad.join(", ")}` : ""}`);
  failed ||= bad.length > 0;
}
console.log(`      forms: ${[...specForms].join(", ")} | codes: ${specCodes.size} defined, ${packCodes.size} taught`);
process.exit(failed ? 1 : 0);
