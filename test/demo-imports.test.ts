// The demo page's dependency gate (D22): the page and its JS may reach
// for the library's own build output and the repo's own data, and for nothing
// else. No framework, no CDN, no bundler, no bare specifier that would need
// one.
//
// It is a grep over raw source rather than a load-time check because that is
// the property worth holding: a `<script src="https://cdn…">` is a dependency
// whether or not it happens to resolve on the machine running the test. A
// reference is judged by where it *lands*, not by how it starts — resolved
// against the file that names it, then normalized — so
// `../dist/../../node_modules/x` is a `node_modules` import wearing a `dist/`
// prefix, and fails.
//
// `demo/serve.mjs` is deliberately not checked: it is the `mise run demo`
// static server, a Node script rather than part of the page, and its
// `node:`-prefixed imports are the stdlib, not a dependency.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEMO = join(ROOT, "demo");

/** The only directories outside `demo/` a reference may resolve into. */
const ALLOWED = ["dist", "fixtures", join("test", "golden")].map((d) => join(ROOT, d) + sep);

/** A string that names something to load, rather than a label or a class name. */
const REFERENCE = /^(\.{1,2}\/|\/|[a-z][a-z0-9+.-]*:)/;

/** Any quoted or backticked literal, up to its first `${` if it is a template. */
const LITERAL = /["'`]([^"'`$\n]*)/g;

/**
 * Everything that can pull a byte into the page. Module specifiers are taken
 * whatever they look like, so a bare `"react"` is caught; every other literal
 * is taken only when it looks like a path or a URL, so `"pointerdown"` is not.
 * Template literals are captured up to their first `${`, which is enough — the
 * interpolation is a fixture name and the directory it sits in is the part
 * that decides the question.
 */
const refs = (text: string, html: boolean): string[] => {
  const out: string[] = [];
  for (const re of [/\bfrom\s*["'`]([^"'`$\n]*)/g, /\bimport\s*\(\s*["'`]([^"'`$\n]*)/g]) {
    for (const m of text.matchAll(re)) out.push(m[1] ?? "");
  }
  if (html) {
    for (const m of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)/g)) out.push(m[1] ?? "");
  } else {
    for (const m of text.matchAll(LITERAL)) {
      const v = m[1] ?? "";
      if (REFERENCE.test(v)) out.push(v);
    }
  }
  return out;
};

/**
 * Allowed: resolved against the file that names it, it lands in one of the
 * allowed directories, or on a file that really sits in `demo/`. A bare
 * specifier, an absolute path and a URL are all rejected before resolving —
 * none of them is relative to anything in this repo.
 */
const ok = (ref: string, from: string): boolean => {
  if (!ref.startsWith("./") && !ref.startsWith("../")) return false;
  const path = normalize(join(from, ref));
  return (
    ALLOWED.some((dir) => path.startsWith(dir)) ||
    (path.startsWith(DEMO + sep) && existsSync(path))
  );
};

const pages = readdirSync(DEMO)
  .filter((name) => name.endsWith(".js") || name.endsWith(".html"))
  .sort();

describe("the demo loads only dist/ and the repo's own data", () => {
  it("catches the things it is meant to catch", () => {
    // Three contract cases, so the check cannot rot into one that never fails:
    // what the demo does, the traversal that dresses up as it, and a CDN.
    const cases: [string, boolean][] = [
      [`import { toSvg } from "../dist/index.js";`, true],
      [`await import("../dist/../../node_modules/elkjs/lib/elk.js");`, false],
      [`<script src="https://cdn.example.com/x.js"></script>`, false],
    ];
    for (const [line, want] of cases) {
      const found = refs(line, line.startsWith("<"));
      expect(found.length, line).toBeGreaterThan(0);
      expect(found.every((r) => ok(r, DEMO)), line).toBe(want);
    }
  });

  it("every reference in demo/ resolves to dist/, a fixture, a golden, or demo/ itself", () => {
    const bad: string[] = [];
    for (const name of pages) {
      const file = join(DEMO, name);
      const text = readFileSync(file, "utf8");
      for (const ref of refs(text, name.endsWith(".html"))) {
        if (!ok(ref, dirname(file))) bad.push(`demo/${name}: ${ref}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("contains no absolute URL anywhere, quoted or not", () => {
    // A blunt second pass: the literal scan reads one line at a time, and an
    // apostrophe in a comment can shadow the rest of its line. The page names
    // no scheme at all — not even in prose.
    for (const name of pages) {
      const text = readFileSync(join(DEMO, name), "utf8");
      const found = [...text.matchAll(/[a-z][a-z0-9+.-]*:\/\/\S*/g)].map((m) => m[0]);
      expect(found, `demo/${name}`).toEqual([]);
    }
  });

  it("looks at a page that uses the library at all", () => {
    expect(pages).toContain("index.html");
    expect(pages).toContain("demo.js");
    const all = pages.flatMap((n) => refs(readFileSync(join(DEMO, n), "utf8"), n.endsWith(".html")));
    expect(all.some((ref) => ref.startsWith("../dist/"))).toBe(true);
    expect(all.some((ref) => ref.startsWith("../fixtures/"))).toBe(true);
  });
});
