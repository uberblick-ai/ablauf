import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { render } from "./flow/index.ts";

test("the packed package works for an isolated production consumer", (t) => {
	const root = resolve(import.meta.dirname, "..");
	const consumer = mkdtempSync(join(process.env.UB_AGENTS_SCRATCH ?? tmpdir(), "ablauf-consumer-"));
	t.after(() => rmSync(consumer, { recursive: true, force: true }));
	const run = (command: string, args: string[], cwd = consumer, status = 0) => {
		const result = spawnSync(command, args, { cwd, encoding: "utf8" });
		assert.ifError(result.error);
		assert.equal(result.status, status, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
		return result;
	};
	// Exercise prepack too: consumers must never need a build or a TS loader.
	run("npm", ["pack", "--pack-destination", consumer], root);
	const tarballs = readdirSync(consumer).filter((name) => name.endsWith(".tgz"));
	assert.equal(tarballs.length, 1);
	writeFileSync(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
	run("npm", ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", join(consumer, tarballs[0])]);
	const installed = join(consumer, "node_modules", "@uberblick", "ablauf");
	const manifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
	assert.equal(manifest.version, "0.2.0");
	assert.ok(!manifest.private);
	assert.deepEqual(manifest.dependencies ?? {}, {});
	assert.deepEqual(manifest.optionalDependencies ?? {}, {});
	assert.deepEqual(manifest.peerDependencies ?? {}, {});
	assert.deepEqual(readdirSync(join(consumer, "node_modules")).sort(), [".package-lock.json", "@uberblick"]);
	assert.deepEqual(readdirSync(installed).sort(), ["LICENSE", "README.md", "dist", "package.json"]);
	assert.ok(readdirSync(join(installed, "dist")).every((name) => name.endsWith(".js") || name.endsWith(".d.ts")));

	const source = readFileSync(join(root, "spike/examples/deploy.flow"), "utf8");
	const broken = "flow v0\nbox a\na --> missing\n";
	writeFileSync(join(consumer, "valid.flow"), source);
	writeFileSync(join(consumer, "broken.flow"), broken);
	// Execute the documentation verbatim so it cannot drift from the public API.
	const readme = readFileSync(join(installed, "README.md"), "utf8");
	const script = readme.match(/```js\n([\s\S]*?)\n```/)?.[1];
	assert.ok(script, "the README has a complete JavaScript build script");
	writeFileSync(join(consumer, "render-flow.mjs"), script);
	const options = { idPrefix: "build-flow", scheme: "light" } as const;
	const valid = run(process.execPath, ["render-flow.mjs", "valid.flow", "valid.svg"]);
	assert.equal(valid.stderr, "");
	assert.deepEqual(render(source, options).diagnostics, []);
	assert.equal(readFileSync(join(consumer, "valid.svg"), "utf8"), render(source, options).svg);
	const invalid = run(process.execPath, ["render-flow.mjs", "broken.flow", "broken.svg"], consumer, 1);
	assert.equal(readFileSync(join(consumer, "broken.svg"), "utf8"), render(broken, options).svg);
	assert.equal(invalid.stderr, "broken.flow:3 error: unknown node `missing`; edge dropped\n");
	assert.match(readFileSync(join(consumer, "broken.svg"), "utf8"), /^<svg /);

	// Compare default, pinned dark and custom font options through the package.
	const custom = {
		idPrefix: "host:flow",
		fonts: { mono: { family: "Host Mono", measureText: (text: string) => [...text].length * 7 } },
	};
	writeFileSync(join(consumer, "expected.json"), JSON.stringify({
		defaultSvg: render(source).svg,
		darkSvg: render(source, { scheme: "dark" }).svg,
		customSvg: render(source, custom).svg,
		diagnostics: render(broken).diagnostics,
	}));
	writeFileSync(join(consumer, "public-api.mjs"), `
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render, LIGHT, DARK } from "@uberblick/ablauf";
const source = readFileSync("valid.flow", "utf8");
const expected = JSON.parse(readFileSync("expected.json", "utf8"));
assert.equal(render(source).svg, expected.defaultSvg);
assert.equal(render(source, { scheme: "dark" }).svg, expected.darkSvg);
assert.equal(render(source, {
  idPrefix: "host:flow",
  fonts: { mono: { family: "Host Mono", measureText: (text) => [...text].length * 7 } },
}).svg, expected.customSvg);
const result = render(readFileSync("broken.flow", "utf8"));
assert.match(result.svg, /^<svg /);
assert.deepEqual(result.diagnostics, expected.diagnostics);
assert.equal(result.diagnostics[0].line, 3);
assert.notDeepEqual(LIGHT, DARK);
`);
	run(process.execPath, ["public-api.mjs"]);

	// Only the producer uses tsc. The consumer's declarations resolve using
	// the installed tarball, with no repository types or source imports.
	writeFileSync(join(consumer, "types.mts"), `
import { render, type RenderOptions, type Diagnostic, type FontsOptions,
  type FontOptions, type TextStyle } from "@uberblick/ablauf";
const measureText = (text: string, { fontSize }: TextStyle) => text.length * fontSize;
const font: FontOptions = { family: "Host Mono", measureText };
const fonts: FontsOptions = { mono: font, text: font };
const options: RenderOptions = { idPrefix: "types", scheme: "light", fonts };
const result = render("flow v0\\nbox a\\n", options);
const svg: string = result.svg;
const diagnostics: Diagnostic[] = result.diagnostics;
const line: number | undefined = diagnostics[0]?.line;
`);
	run(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--module", "nodenext", "--target", "es2023", "types.mts"]);
});
