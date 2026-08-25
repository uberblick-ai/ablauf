// The determinism ban list (D21), enforced over the whole of `src/`.
//
// Two replicas rendering the same document are two browser engines — V8,
// JavaScriptCore, SpiderMonkey — not one node build run twice, so a
// same-machine double-run proves nothing about the constructs whose results
// are implementation-defined or environment-dependent. This grep is the gate
// that does hold, and it runs in CI because CI runs the tests.
//
// It reads raw source, comments included: a banned name in a comment is a
// banned name, which leaves no wiggle room about what the rule means.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const BANNED: readonly { what: string; pattern: RegExp }[] = [
  { what: "Math.random", pattern: /\bMath\s*\.\s*random\b/ },
  { what: "the clock", pattern: /\bDate\b/ },
  { what: "localeCompare", pattern: /\blocaleCompare\b/ },
  { what: "Intl", pattern: /\bIntl\b/ },
  { what: "toLocaleString", pattern: /\btoLocaleString\b/ },
  { what: "approximated Math", pattern: /\bMath\s*\.\s*(hypot|pow|sin|cos|atan2|exp|log)\b/ },
];

const SRC = new URL("../src/", import.meta.url);

const sources = (dir: URL, prefix = "src"): { path: string; text: string }[] => {
  const out: { path: string; text: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    if (entry.isDirectory()) out.push(...sources(child, `${prefix}/${entry.name}`));
    else if (entry.name.endsWith(".ts")) out.push({ path: `${prefix}/${entry.name}`, text: readFileSync(child, "utf8") });
  }
  return out;
};

describe("determinism ban list", () => {
  it("finds source to check", () => {
    expect(sources(SRC).length).toBeGreaterThan(3);
  });

  it("has patterns that actually match what they ban", () => {
    // Without this the grep could rot into a check that cannot fail.
    const samples = [
      "const r = Math.random();",
      "const t = Date.now();",
      "ids.sort((a, b) => a.localeCompare(b));",
      "new Intl.Collator();",
      "n.toLocaleString();",
      "const d = Math.hypot(dx, dy);",
    ];
    for (const sample of samples) {
      expect(BANNED.some(({ pattern }) => pattern.test(sample)), sample).toBe(true);
    }
  });

  it("src/ uses none of them", () => {
    const found: string[] = [];
    for (const { path, text } of sources(SRC)) {
      text.split("\n").forEach((line, i) => {
        for (const { what, pattern } of BANNED) {
          if (pattern.test(line)) found.push(`${path}:${i + 1}: ${what} — ${line.trim()}`);
        }
      });
    }
    expect(found).toEqual([]);
  });
});
