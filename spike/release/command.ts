import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const fullSha = /^[0-9a-f]{40}$/;

const repository = "uberblick-ai/ablauf";
const workflow = "release.yml";
const steps = ["preflight", "dispatch publication", "confirm npm publication", "create local tag", "push tag", "create GitHub release"];
type Run = (command: string, args: string[]) => string;
type WorkflowRun = { databaseId: number; displayTitle: string; status: string; conclusion: string; url: string };

export function releaseNotes(changelog: string, version: string): string {
	const escaped = version.replaceAll(".", "\\.");
	const headings = [...changelog.matchAll(new RegExp(`^##[ \\t]+${escaped}(?=[ \\t\\r\\n]|$)[^\\n]*`, "gm"))];
	if (headings.length !== 1) throw new Error(`Expected exactly one CHANGELOG.md heading for ${version}`);
	const heading = headings[0];
	const date = heading[0].match(new RegExp(`^## ${escaped} — (\\d{4}-\\d{2}-\\d{2})\\r?$`))?.[1];
	if (!date || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
		throw new Error(`Expected heading ## ${version} — YYYY-MM-DD with a valid calendar date`);
	}
	const start = heading.index + heading[0].length;
	// Exclude the heading's line ending, retaining every byte of its body.
	const rest = changelog.slice(start + (changelog[start] === "\n" ? 1 : 0));
	const end = rest.search(/^ {0,3}##(?:[ \t]+|\r?$)/m);
	const notes = end < 0 ? rest : rest.slice(0, end);
	if (!notes.trim()) throw new Error(`CHANGELOG.md section ${version} is empty`);
	return notes;
}

export class Release {
	readonly completed: string[] = [];
	readonly artifacts: string[] = [];
	step = steps[0];
	sha = "";
	notes = "";
	readonly version: string;
	readonly root: string;
	readonly run: Run;
	readonly output: (text: string) => void;
	readonly pause: () => Promise<unknown>;
	readonly expectedCommit: string | undefined;
	constructor(
		version: string,
		root = process.cwd(),
		run: Run = (command, args) => execFileSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
		output: (text: string) => void = (text) => process.stdout.write(text),
		pause: () => Promise<unknown> = () => setTimeout(5000),
		expectedCommit?: string,
	) {
		this.version = version;
		this.root = root;
		this.run = run;
		this.output = output;
		this.pause = pause;
		this.expectedCommit = expectedCommit;
	}

	call(command: string, ...args: string[]): string {
		return this.run(command, args).trim();
	}

	done() {
		this.completed.push(this.step);
		this.output(`Completed: ${this.step}\n`);
	}

	preflight() {
		if (!stableVersion.test(this.version) || this.version.trim() !== this.version) throw new Error("Version must be stable X.Y.Z (no leading zeros or prerelease)");
		if (this.call("git", "status", "--porcelain", "--untracked-files=all")) throw new Error("Checkout must be clean, including untracked files");
		this.call("git", "fetch", "--no-tags", "origin", "+refs/heads/main:refs/remotes/origin/main");
		this.sha = this.call("git", "rev-parse", "HEAD");
		if (this.expectedCommit !== undefined && (!fullSha.test(this.expectedCommit) || this.expectedCommit.trim() !== this.expectedCommit || this.sha !== this.expectedCommit)) {
			throw new Error("HEAD differs from the explicitly confirmed commit; run --check and obtain confirmation again");
		}
		if (!fullSha.test(this.sha) || this.sha !== this.call("git", "rev-parse", "refs/remotes/origin/main")) {
			throw new Error("HEAD must equal current origin/main");
		}
		const manifest = JSON.parse(readFileSync(join(this.root, "package.json"), "utf8"));
		if (manifest.name !== "@uberblick/ablauf" || manifest.version !== this.version) throw new Error("package.json does not match requested package and version");
		const tag = `refs/tags/v${this.version}`;
		if (this.call("git", "tag", "--list", `v${this.version}`)) throw new Error(`${tag} already exists locally`);
		if (this.call("git", "ls-remote", "--tags", "origin", tag)) throw new Error(`${tag} already exists on origin`);
		const ci = JSON.parse(this.call("gh", "run", "list", "--repo", repository, "--workflow", "ci.yml", "--commit", this.sha,
			"--limit", "1", "--json", "headSha,status,conclusion,databaseId"));
		if (ci.length !== 1 || ci[0].headSha !== this.sha || ci[0].status !== "completed" || ci[0].conclusion !== "success") {
			throw new Error(`Latest CI run for ${this.sha} must be completed successfully`);
		}
		this.notes = releaseNotes(readFileSync(join(this.root, "CHANGELOG.md"), "utf8"), this.version);
		this.done();
		this.output(`Checked version: ${this.version}\nChecked commit: ${this.sha}\nRelease notes (verbatim):\n${this.notes}`);
	}

	async publish() {
		const title = `Release ${this.version} @ ${this.sha} (${randomUUID()})`;
		this.step = steps[1];
		// Record uncertainty before the network request: a failed response can still dispatch.
		this.artifacts.push(`Publication request: ${title}; npm may already be published; inspect https://github.com/${repository}/actions/workflows/${workflow} even if dispatch fails`);
		this.call("gh", "workflow", "run", workflow, "--repo", repository, "--ref", "main", "-f", `version=${this.version}`, "-f", `commit=${this.sha}`, "-f", `request=${title}`);
		this.done();
		this.step = steps[2];
		let found: WorkflowRun | undefined;
		for (let attempt = 0; attempt < 24; attempt++) {
			const runs: WorkflowRun[] = JSON.parse(this.call("gh", "run", "list", "--repo", repository, "--workflow", workflow, "--event", "workflow_dispatch",
				"--limit", "100", "--json", "databaseId,displayTitle,status,conclusion,url"));
			const matches = runs.filter((run) => run.displayTitle === title);
			if (matches.length > 1) throw new Error("Ambiguous publication run; inspect workflow state");
			if (matches.length === 1) { found = matches[0]; break; }
			await this.pause();
		}
		if (!found) throw new Error("Publication run not found within two minutes; inspect workflow state");
		this.artifacts.push(`Workflow: ${found.url}`);
		this.output(`Waiting for ${found.url}\nApprove the npm environment deployment if requested.\n`);
		this.call("gh", "run", "watch", String(found.databaseId), "--repo", repository, "--exit-status");
		const finished: WorkflowRun = JSON.parse(this.call("gh", "run", "view", String(found.databaseId), "--repo", repository,
			"--json", "databaseId,displayTitle,status,conclusion,url"));
		if (finished.databaseId !== found.databaseId || finished.displayTitle !== title || finished.status !== "completed" || finished.conclusion !== "success") {
			throw new Error("Publication did not succeed for the checked version and commit");
		}
		this.artifacts.push(`npm publication workflow succeeded: https://www.npmjs.com/package/@uberblick/ablauf/v/${this.version} (checked commit ${this.sha}); registry confirmation pending`);
		let confirmed = false;
		for (let attempt = 0; attempt < 12; attempt++) {
			try {
				const published = JSON.parse(this.call("npm", "view", `@uberblick/ablauf@${this.version}`, "version", "gitHead", "--json"));
				if (published.version !== this.version || published.gitHead !== this.sha) throw new Error("Published npm identity differs from checked version/commit");
				confirmed = true;
				break;
			} catch (error) {
				if (error instanceof Error && error.message.includes("identity differs")) throw error;
				if (attempt === 11) throw error;
				await this.pause();
			}
		}
		if (!confirmed) throw new Error("Could not confirm npm publication");
		this.done();
		const tag = `v${this.version}`;
		this.step = steps[3];
		this.call("git", "tag", "-a", tag, this.sha, "-m", `@uberblick/ablauf ${this.version}`);
		this.artifacts.push(`Local tag: ${tag} at ${this.sha}`);
		this.done();
		this.step = steps[4];
		this.artifacts.push(`Tag push attempted: https://github.com/${repository}/tree/${tag}; inspect origin if it fails`);
		this.call("git", "push", "origin", `refs/tags/${tag}:refs/tags/${tag}`);
		this.done();
		this.step = steps[5];
		const temporary = mkdtempSync(join(process.env.UB_AGENTS_SCRATCH ?? tmpdir(), "ablauf-release-"));
		try {
			const notesPath = join(temporary, "notes.md");
			writeFileSync(notesPath, this.notes);
			this.artifacts.push(`GitHub release attempted: https://github.com/${repository}/releases/tag/${tag}; inspect it if creation fails`);
			this.call("gh", "release", "create", tag, "--repo", repository, "--verify-tag", "--title", `@uberblick/ablauf ${this.version}`, "--notes-file", notesPath);
			this.done();
		} finally {
			rmSync(temporary, { recursive: true, force: true });
		}
		this.output(`${this.artifacts.join("\n")}\n`);
	}

	failure(error: unknown): string {
		return `Release failed during ${this.step}: ${error instanceof Error ? error.message : String(error)}\n` +
			`Checked version: ${this.version}; checked commit: ${this.sha || "not established"}\n` +
			`Completed: ${this.completed.join(", ") || "none"}\nRemaining: ${steps.filter((step) => !this.completed.includes(step)).join(", ")}\n` +
			`Artifacts and possibly completed remote requests:\n${this.artifacts.join("\n") || "none"}\n` +
			"Stop and inspect remote state using docs/releases.md. Never blindly repeat npm publication or move/delete a pushed tag.\n";
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const args = process.argv.slice(2);
	const version = args.shift();
	let check = false;
	let commit: string | undefined;
	let valid = version !== undefined;
	while (args.length) {
		const arg = args.shift();
		if (arg === "--check" && !check) check = true;
		else if (arg === "--commit" && commit === undefined && args.length) commit = args.shift();
		else { valid = false; break; }
	}
	if (!valid || version === undefined) {
		console.error("Usage: mise run release X.Y.Z [--check] [--commit CONFIRMED_FULL_SHA]");
		process.exitCode = 1;
	} else {
		const release = new Release(version, process.cwd(), undefined, undefined, undefined, commit);
		try {
			release.preflight();
			if (!check) await release.publish();
		} catch (error) {
			console.error(release.failure(error));
			process.exitCode = 1;
		}
	}
}
