import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import { Release, releaseNotes } from "./release/command.ts";

const version = "0.3.0";
const body = "\nFirst paragraph.\n\n### Details\n\n- Complete notes.  \n\n";
const changelog = `# Changelog\n\n## Unreleased\n\nLater.\n\n## ${version} — 2026-10-19\n${body}## 0.2.0 — 2026-10-01\n\nEarlier.\n`;
const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
const commandPath = resolve(import.meta.dirname, "release/command.ts");
type Call = { command: string; args: string[] };

function fixture(t: TestContext) {
	const base = mkdtempSync(join(process.env.UB_AGENTS_SCRATCH ?? tmpdir(), "ablauf-release-test-"));
	t.after(() => rmSync(base, { recursive: true, force: true }));
	const root = join(base, "checkout");
	const origin = join(base, "origin.git");
	mkdirSync(root);
	const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
	git("init", "--bare", origin);
	git("init", "-b", "main");
	git("config", "user.name", "Release Test");
	git("config", "user.email", "release-test@example.invalid");
	git("remote", "add", "origin", origin);
	writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@uberblick/ablauf", version }));
	writeFileSync(join(root, "CHANGELOG.md"), changelog);
	const commit = () => { git("add", "."); git("commit", "--allow-empty", "-m", "fixture"); };
	commit();
	git("push", "-u", "origin", "main");
	const sha = git("rev-parse", "HEAD");
	const calls: Call[] = [];
	let output = "";
	let title = "";
	let savedNotes = "";
	let injected: ((call: Call) => string | undefined) | undefined;
	const run = (command: string, args: string[]) => {
		const call = { command, args };
		calls.push(call);
		const overridden = injected?.(call);
		if (overridden !== undefined) return overridden;
		if (command === "git") return git(...args);
		if (command === "gh" && args[0] === "workflow") {
			assert.ok(args.includes(`version=${version}`));
			assert.ok(args.includes(`commit=${sha}`));
			assert.equal(args[args.indexOf("--ref") + 1], "main");
			title = args.find((arg) => arg.startsWith("request="))?.slice(8) ?? "";
			assert.match(title, new RegExp(`^Release ${version} @ ${sha} \\(.+\\)$`));
			return "";
		}
		if (command === "gh" && args[0] === "run") {
			if (args[1] === "list" && args.includes("ci.yml")) {
				assert.equal(args[args.indexOf("--commit") + 1], sha);
				assert.equal(args[args.indexOf("--limit") + 1], "1");
				return JSON.stringify([{ headSha: sha, status: "completed", conclusion: "success" }]);
			}
			const publication = { databaseId: 42, displayTitle: title, status: "completed", conclusion: "success", url: "https://example.invalid/runs/42" };
			if (args[1] === "list") return JSON.stringify([
				{ ...publication, databaseId: 99, displayTitle: "Another release at newer main" }, publication,
			]);
			assert.equal(args[2], "42", "only watch/view the correlated dispatch, never the newest run");
			if (args[1] === "watch") return "";
			if (args[1] === "view") return JSON.stringify(publication);
		}
		if (command === "npm" && args[0] === "view") {
			assert.deepEqual(args, ["view", `@uberblick/ablauf@${version}`, "version", "gitHead", "--json"]);
			return JSON.stringify({ version, gitHead: sha });
		}
		if (command === "gh" && args[0] === "release" && args[1] === "create") {
			assert.equal(args[2], `v${version}`);
			assert.ok(args.includes("--verify-tag"));
			savedNotes = readFileSync(args[args.indexOf("--notes-file") + 1], "utf8");
			return "https://example.invalid/releases/0.3.0";
		}
		throw new Error(`Unexpected external service: ${command} ${args.join(" ")}`);
	};
	const release = new Release(version, root, run, (text) => { output += text; }, async () => {});
	return {
		base, root, origin, sha, calls, git, commit, release,
		inject: (value: typeof injected) => { injected = value; },
		output: () => output, notes: () => savedNotes,
		advanceMain: () => { commit(); git("push", "origin", "main"); git("checkout", "--detach", sha); },
	};
}

test("release notes retain the complete body verbatim and stop at the next level-two heading", () => {
	assert.equal(releaseNotes(changelog, version), body);
	assert.equal(releaseNotes(`## ${version} — 2024-02-29\r\n\r\nA  \r\n\r\n### Nested\r\nB`, version), "\r\nA  \r\n\r\n### Nested\r\nB");
	assert.equal(releaseNotes(`## ${version} — 2026-10-19\n${body}   ## Next\nignored`, version), body);
});

test("release notes refuse absent, duplicate, malformed, invalid-date and empty sections", () => {
	for (const source of [
		"", "## Unreleased\nNotes", `## ${version}\nNotes`, `## ${version} — 2026-02-29\nNotes`,
		`## ${version} — 2026-13-01\nNotes`, `## ${version} — 2026-04-31\nNotes`,
		`## ${version} — 2026-1-01\nNotes`, `## ${version} — 2026-10-19 extra\nNotes`,
		`## ${version} — 2026-10-19\n \t\r\n## Next\nNotes`,
		`## ${version} — 2026-10-19`, `${changelog}\n## ${version} — 2026-10-20\nDuplicate`,
		`${changelog}\n## ${version}\nMalformed duplicate`,
	]) assert.throws(() => releaseNotes(source, version), Error, source);
});

test("preflight is read-only, prints checked identity and unmodified notes, and requires no publication services", (t) => {
	const f = fixture(t);
	const before = f.git("status", "--porcelain");
	const files = readdirSync(f.root).sort();
	f.release.preflight();
	assert.equal(f.output(), `Completed: preflight\nChecked version: ${version}\nChecked commit: ${f.sha}\nRelease notes (verbatim):\n${body}`);
	assert.equal(f.git("status", "--porcelain"), before);
	assert.deepEqual(readdirSync(f.root).sort(), files);
	assert.equal(f.git("tag", "--list"), "");
	assert.equal(f.git("ls-remote", "--tags", "origin"), "");
	assert.equal(readFileSync(join(f.root, "CHANGELOG.md"), "utf8"), changelog);
	assert.deepEqual(f.calls.filter((call) => call.command !== "git").map((call) => call.args.slice(0, 2)), [["run", "list"]]);
});

test("preflight refuses unstable version spellings before external calls", (t) => {
	const f = fixture(t);
	for (const invalid of ["v0.3.0", "0.3", "0.3.0-rc.1", "0.3.0+build", "00.3.0", "0.03.0", "0.3.00", "0.3.0\n"]) {
		const release = new Release(invalid, f.root, () => { assert.fail("must refuse before external calls"); });
		assert.throws(() => release.preflight(), /stable X.Y.Z/);
	}
});

test("preflight refuses dirty files, stale/ahead main, package mismatch, existing tags and missing changelog", async (t) => {
	const cases: [string, (f: ReturnType<typeof fixture>) => void, RegExp][] = [
		["untracked", (f) => writeFileSync(join(f.root, "untracked"), "x"), /clean/],
		["unstaged", (f) => writeFileSync(join(f.root, "package.json"), "changed"), /clean/],
		["staged", (f) => { writeFileSync(join(f.root, "package.json"), "changed"); f.git("add", "."); }, /clean/],
		["main advanced", (f) => f.advanceMain(), /HEAD must equal/],
		["HEAD ahead", (f) => f.commit(), /HEAD must equal/],
		["package mismatch", (f) => { writeFileSync(join(f.root, "package.json"), '{"name":"@uberblick/ablauf","version":"0.2.0"}'); f.commit(); f.git("push", "origin", "main"); }, /package.json/],
		["local tag", (f) => { f.git("tag", `v${version}`); }, /exists locally/],
		["remote tag", (f) => { f.git("--git-dir", f.origin, "update-ref", `refs/tags/v${version}`, f.sha); }, /exists on origin/],
		["missing changelog", (f) => { f.git("rm", "CHANGELOG.md"); f.commit(); f.git("push", "origin", "main"); }, /ENOENT/],
	];
	for (const [name, change, expected] of cases) await t.test(name, (t) => {
		const f = fixture(t);
		change(f);
		// These cases can change the commit, so supply matching successful CI to reach the intended guard.
		f.inject((call) => call.command === "gh" ? JSON.stringify([{ headSha: f.git("rev-parse", "HEAD"), status: "completed", conclusion: "success" }]) : undefined);
		assert.throws(() => f.release.preflight(), expected);
		assert.deepEqual(f.release.completed, []);
		assert.ok(!f.calls.some((call) => call.command === "npm" || call.args.includes("-a") || call.args[0] === "workflow"));
	});
});

test("preflight requires the latest CI run to be successful for the exact commit", async (t) => {
	for (const state of [[], [{ status: "in_progress", conclusion: null }], [{ status: "completed", conclusion: "failure" }], [{ status: "completed", conclusion: "cancelled" }], [{ headSha: "a".repeat(40), status: "completed", conclusion: "success" }]]) {
		await t.test(JSON.stringify(state), (t) => {
			const f = fixture(t);
			f.inject((call) => call.command === "gh" ? JSON.stringify(state.map((run) => ({ headSha: f.sha, ...run }))) : undefined);
			assert.throws(() => f.release.preflight(), /Latest CI run/);
		});
	}
});

test("fetch, remote-tag lookup and CI service errors fail closed", async (t) => {
	for (const fail of ["fetch", "ls-remote", "list"]) await t.test(fail, (t) => {
		const f = fixture(t);
		f.inject((call) => { if (call.args.includes(fail)) throw new Error("service unavailable"); return undefined; });
		assert.throws(() => f.release.preflight(), /service unavailable/);
		assert.match(f.release.failure(new Error("service unavailable")), /Completed: none\nRemaining: preflight/);
	});
});

test("publication orders npm before tagging and retains checked commit when main advances", async (t) => {
	const f = fixture(t);
	f.release.preflight();
	f.inject((call) => {
		if (call.command === "gh" && call.args[1] === "watch") f.advanceMain();
		return undefined;
	});
	await f.release.publish();
	assert.notEqual(f.git("rev-parse", "refs/remotes/origin/main"), f.sha);
	assert.equal(f.git("rev-parse", `v${version}^{commit}`), f.sha);
	assert.equal(f.git("--git-dir", f.origin, "rev-parse", `v${version}^{commit}`), f.sha);
	assert.equal(f.notes(), body);
	const publication = f.calls.filter((call) =>
		call.command === "npm" || call.args[0] === "workflow" || ["watch", "view", "create"].includes(call.args[1]) || call.args.includes("-a") || call.args[0] === "push");
	assert.deepEqual(publication.map((call) => `${call.command} ${call.args.slice(0, 2).join(" ")}`), [
		"gh workflow run", "gh run watch", "gh run view", "npm view @uberblick/ablauf@0.3.0", "git tag -a", "git push origin", "gh release create",
	]);
	assert.deepEqual(f.release.completed, ["preflight", "dispatch publication", "confirm npm publication", "create local tag", "push tag", "create GitHub release"]);
});

test("publication finds a delayed run and waits for registry propagation without redispatch", async (t) => {
	const f = fixture(t);
	let lists = 0;
	let views = 0;
	f.inject((call) => {
		if (call.command === "gh" && call.args[1] === "list" && call.args.includes("release.yml") && lists++ === 0) return "[]";
		if (call.command === "npm" && views++ === 0) throw new Error("registry not updated");
	});
	f.release.preflight();
	await f.release.publish();
	assert.equal(f.calls.filter((call) => call.args[0] === "workflow").length, 1);
	assert.equal(views, 2);
});

test("every publication failure stops, reports progress/artifacts and performs no later step", async (t) => {
	const cases: [string, (call: Call) => boolean, string, number][] = [
		["dispatch", (c) => c.args[0] === "workflow", "dispatch publication", 1],
		["discovery", (c) => c.args[1] === "list" && c.args.includes("release.yml"), "confirm npm publication", 2],
		["publication workflow", (c) => c.args[1] === "watch", "confirm npm publication", 2],
		["completion lookup", (c) => c.command === "gh" && c.args[1] === "view", "confirm npm publication", 2],
		["npm registry", (c) => c.command === "npm", "confirm npm publication", 2],
		["local tag", (c) => c.args[0] === "tag" && c.args.includes("-a"), "create local tag", 3],
		["tag push", (c) => c.args[0] === "push", "push tag", 4],
		["GitHub release", (c) => c.args[0] === "release", "create GitHub release", 5],
	];
	for (const [name, fails, step, count] of cases) await t.test(name, async (t) => {
		const f = fixture(t);
		f.release.preflight();
		f.inject((call) => { if (fails(call)) throw new Error(`failure at ${name}`); return undefined; });
		await assert.rejects(f.release.publish(), new RegExp(`failure at ${name}`));
		assert.equal(f.release.step, step);
		assert.equal(f.release.completed.length, count);
		assert.ok(fails(f.calls.at(-1) as Call), "no later external command runs");
		const report = f.release.failure(new Error(`failure at ${name}`));
		assert.match(report, new RegExp(`Release failed during ${step}`));
		assert.match(report, /Completed: preflight/);
		assert.match(report, /Remaining:/);
		assert.match(report, /Publication request:/);
		assert.match(report, /Never blindly repeat npm publication or move\/delete a pushed tag/);
		if (count >= 3) assert.match(report, /npm publication workflow succeeded:/);
		assert.equal(f.git("tag", "--list"), count >= 4 ? `v${version}` : "");
		assert.equal(Boolean(f.git("ls-remote", "--tags", "origin")), count >= 5);
	});
});

test("ambiguous/missing runs, wrong completion identity/status and mismatched npm identity refuse tagging", async (t) => {
	for (const scenario of ["missing", "ambiguous", "wrong title", "wrong run", "failed", "pending", "wrong npm version", "wrong npm commit"]) {
		await t.test(scenario, async (t) => {
			const f = fixture(t);
			let title = "";
			f.inject((call) => {
				if (call.args[0] === "workflow") title = call.args.find((arg) => arg.startsWith("request="))?.slice(8) ?? "";
				const run = { databaseId: 42, displayTitle: title, status: "completed", conclusion: "success", url: "https://example.invalid/42" };
				if (call.args[1] === "list" && call.args.includes("release.yml")) {
					if (scenario === "missing") return "[]";
					if (scenario === "ambiguous") return JSON.stringify([run, run]);
				}
				if (call.command === "gh" && call.args[1] === "view") return JSON.stringify({ ...run,
					...(scenario === "wrong title" ? { displayTitle: "other commit" } : {}),
					...(scenario === "wrong run" ? { databaseId: 99 } : {}),
					...(scenario === "failed" ? { conclusion: "failure" } : {}),
					...(scenario === "pending" ? { status: "in_progress" } : {}),
				});
				if (call.command === "npm") return JSON.stringify({ version: scenario === "wrong npm version" ? "0.2.0" : version, gitHead: scenario === "wrong npm commit" ? "b".repeat(40) : f.sha });
			});
			f.release.preflight();
			await assert.rejects(f.release.publish());
			assert.equal(f.git("tag", "--list"), "");
			assert.ok(!f.calls.some((call) => call.args[0] === "release"));
		});
	}
});

test("the CLI check mode exits successfully without mutation; refusal exits unsuccessfully", (t) => {
	const f = fixture(t);
	const stubs = join(f.base, "stubs");
	mkdirSync(stubs);
	// A real CLI process with only gh stubbed; Git is the isolated repository.
	writeFileSync(join(stubs, "gh"), `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(JSON.stringify([{ headSha: f.sha, status: "completed", conclusion: "success" }]))});\n`, { mode: 0o755 });
	const env = { ...process.env, PATH: `${stubs}:${process.env.PATH}` };
	const result = spawnSync(process.execPath, [commandPath, version, "--check", "--commit", f.sha], { cwd: f.root, env, encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	assert.ok(result.stdout.endsWith(body));
	assert.match(result.stdout, new RegExp(f.sha));
	assert.equal(f.git("status", "--porcelain"), "");
	assert.equal(f.git("tag", "--list"), "");
	const mismatch = spawnSync(process.execPath, [commandPath, version, "--commit", "f".repeat(40)], { cwd: f.root, env, encoding: "utf8" });
	assert.equal(mismatch.status, 1);
	assert.match(mismatch.stderr, /explicitly confirmed commit/);
	assert.equal(f.git("tag", "--list"), "");
	writeFileSync(join(f.root, "untracked"), "dirty");
	const refused = spawnSync(process.execPath, [commandPath, version, "--check"], { cwd: f.root, env, encoding: "utf8" });
	assert.equal(refused.status, 1);
	assert.match(refused.stderr, /Checkout must be clean/);
	assert.match(refused.stderr, /Completed: none/);
	assert.equal(spawnSync(process.execPath, [commandPath, version, "--unknown"], { cwd: f.root, encoding: "utf8" }).status, 1);
});

test("the workflow packs the checked gitHead into the actual tarball without publication", (t) => {
	const f = fixture(t);
	const pack = workflow.match(/ {6}- name: Pack once[^\n]+\n[\s\S]*? {8}run: \|\n((?: {10}[^\n]*\n)+)/)?.[1].replace(/^ {10}/gm, "");
	assert.ok(pack);
	const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", pack], {
		cwd: f.root, encoding: "utf8", env: { ...process.env, RELEASE_COMMIT: f.sha, RUNNER_TEMP: f.base },
	});
	assert.equal(result.status, 0, result.stderr);
	const manifest = JSON.parse(execFileSync("tar", ["-xOf", join(f.base, "package/uberblick-ablauf-0.3.0.tgz"), "package/package.json"], { encoding: "utf8" }));
	assert.equal(manifest.gitHead, f.sha);
	assert.equal(manifest.version, version);
	assert.equal(manifest.name, "@uberblick/ablauf");
	assert.equal(f.git("ls-remote", "--tags", "origin"), "");
});

test("workflow's own guards refuse outside-main, wrong-version and wrong-identity inputs before publication", async (t) => {
	const guard = workflow.match(/ {6}- name: Refuse[^\n]+\n[\s\S]*? {8}run: \|\n((?: {10}[^\n]*\n)+)/)?.[1].replace(/^ {10}/gm, "");
	assert.ok(guard, "execute the actual workflow guard, not a reimplementation");
	for (const scenario of ["valid", "main advanced", "outside main", "mismatched version", "wrong SHA", "unstable version", "not full SHA", "wrong ref"]) {
		await t.test(scenario, (t) => {
			const f = fixture(t);
			if (scenario === "main advanced") f.advanceMain();
			if (scenario === "outside main") { f.git("checkout", "-b", "unmerged"); f.commit(); }
			const sha = f.git("rev-parse", "HEAD");
			const published = join(f.base, "publication-reached");
			const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", `${guard}\nnode -e 'require("node:fs").writeFileSync(process.argv[1], "stub publication")' '${published}'`], {
				cwd: f.root, encoding: "utf8", env: { ...process.env,
					RELEASE_REF: scenario === "wrong ref" ? "refs/heads/feature" : "refs/heads/main",
					RELEASE_VERSION: scenario === "mismatched version" ? "0.4.0" : scenario === "unstable version" ? "0.3.0-rc.1" : version,
					RELEASE_COMMIT: scenario === "wrong SHA" ? "a".repeat(40) : scenario === "not full SHA" ? sha.slice(0, 7) : sha,
				},
			});
			const allowed = scenario === "valid" || scenario === "main advanced";
			assert.equal(result.status, allowed ? 0 : 1, result.stderr);
			assert.equal(readdirSync(f.base).includes("publication-reached"), allowed, "publication must not be reached on refusal");
		});
	}
});
