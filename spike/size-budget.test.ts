import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { version } from "esbuild";
import { ENTRIES, measureEntry, PLAYBACK_LIMIT, publishReport, type SizeReport, violations } from "./size-budget.ts";

const root = resolve(import.meta.dirname, "..");

function fixture(gzip: number): SizeReport {
	return {
		revision: "0123456789abcdef",
		dirty: false,
		versions: { node: process.versions.node, esbuild: version, zlib: process.versions.zlib },
		entries: ENTRIES.map((entry, index) => {
			const evidence = {
				bytes: 100_000,
				inputs: index === 0 ? ["dist/playback.js", "dist/player.js", "dist/controls.js"] : ["dist/index.js"],
				exports: index === 0 ? ["createPlayer", "mountPlayback"] : ["DARK", "LIGHT", "TOKENS", "checkPalette", "render"],
			};
			// Core is deliberately much larger than the playback limit.
			return { entry, raw: structuredClone(evidence), minified: structuredClone(evidence), gzip: index === 0 ? gzip : 100_000 };
		}),
	};
}

for (const [gzip, status] of [[12_287, 0], [12_288, 0], [12_289, 1]]) {
	test(`playback gzip ${gzip} bytes returns ${status} and publishes both results`, () => {
		let output = "";
		assert.equal(publishReport(fixture(gzip), text => { output += text; }), status);
		assert.match(output, /@uberblick\/ablauf\/playback \|/);
		assert.match(output, /@uberblick\/ablauf \|/);
		assert.match(output, /100000 B \(97\.656 KiB\) \| None/);
		assert.ok(output.includes(`${gzip} B (`));
		assert.match(output, /Git revision: 0123456789abcdef \(clean\)/);
		assert.match(output, status ? /FAIL: <= 12288 B/ : /PASS: <= 12288 B/);
		assert.equal(violations(fixture(gzip).entries).length, status);
	});
}

test("the gate rejects missing measurements, runtime exports and core contamination", () => {
	const missing = fixture(1);
	missing.entries.pop();
	assert.match(violations(missing.entries).join("\n"), /Missing measurement: @uberblick\/ablauf/);
	for (const variant of ["raw", "minified"] as const) {
		for (const module of ["dist/player.js", "dist/controls.js"]) {
			const contaminated = fixture(1);
			contaminated.entries[1][variant].inputs.push(module);
			assert.match(violations(contaminated.entries).join("\n"), /expected absence/);
		}
		for (const name of ["createPlayer", "mountPlayback"]) {
			const incomplete = fixture(1);
			incomplete.entries[0][variant].exports = incomplete.entries[0][variant].exports.filter(value => value !== name);
			assert.ok(violations(incomplete.entries).some(problem => problem.includes(`missing runtime export ${name}`)));
		}
	}
});

test("local and CI invoke the same build-and-measure command with pinned esbuild", () => {
	const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	assert.equal(manifest.devDependencies.esbuild, version);
	assert.equal(manifest.scripts.size, "node spike/size-budget-command.ts");
	const mise = readFileSync(join(root, "mise.toml"), "utf8");
	assert.match(mise, /\[tasks\.size\]\n[^[]*depends = \["setup"\]\nrun = "pnpm -s size"/);
	const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
	assert.match(ci, /name: lint, typecheck and tests/);
	assert.match(ci, /name: Package JavaScript size budget\n\s+run: mise run size/);
	assert.match(readFileSync(join(root, "docs/size-budget.md"), "utf8"), new RegExp(`esbuild ${version.replaceAll(".", "\\.")}`));
});

test("the real command builds exported JavaScript and publishes sizes and isolation evidence", async t => {
	const scratch = mkdtempSync(join(process.env.UB_AGENTS_SCRATCH ?? tmpdir(), "ablauf-size-"));
	t.after(() => rmSync(scratch, { recursive: true, force: true }));
	const summary = join(scratch, "summary.md");
	writeFileSync(summary, "Existing summary\n");
	const command = spawnSync(process.execPath, ["spike/size-budget-command.ts"], {
		cwd: root,
		encoding: "utf8",
		env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
	});
	assert.ifError(command.error);
	assert.equal(command.status, 0, command.stdout + command.stderr);
	assert.equal(readFileSync(summary, "utf8"), `Existing summary\n${command.stdout.trimEnd()}\n`);
	assert.match(command.stdout, /Git revision: [a-f0-9]{40}/);
	assert.ok(command.stdout.includes(`esbuild ${version}`));
	assert.match(command.stdout, /gzip: minified bundle, level 9/);
	const sizes = await Promise.all(ENTRIES.map(entry => measureEntry(root, entry)));
	assert.deepEqual(violations(sizes), []);
	assert.ok(sizes[0].gzip <= PLAYBACK_LIMIT);
	for (const size of sizes) {
		assert.ok(size.raw.bytes > size.minified.bytes);
		assert.ok(size.minified.bytes > size.gzip);
		assert.ok(command.stdout.includes(`${size.raw.bytes} B (`));
		assert.ok(command.stdout.includes(`${size.minified.bytes} B (`));
		assert.ok(command.stdout.includes(`${size.gzip} B (`));
		for (const variant of ["raw", "minified"] as const) {
			assert.ok(size[variant].inputs.includes(size.entry === ENTRIES[0] ? "dist/playback.js" : "dist/index.js"));
			assert.ok(size[variant].inputs.every(input => input.endsWith(".js")));
			assert.ok(command.stdout.includes(`Inputs: ${size[variant].inputs.join(", ")}.`));
			assert.deepEqual(size[variant].exports, size.entry === ENTRIES[0] ? ["createPlayer", "mountPlayback"] : ["DARK", "LIGHT", "TOKENS", "checkPalette", "render"]);
		}
	}
});
