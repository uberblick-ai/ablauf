import { gzipSync } from "node:zlib";
import { build } from "esbuild";

export const PLAYBACK_LIMIT = 12_288;
export const ENTRIES = ["@uberblick/ablauf/playback", "@uberblick/ablauf"] as const;

export interface BundleEvidence {
	bytes: number;
	inputs: string[];
	exports: string[];
}

export interface EntrySize {
	entry: typeof ENTRIES[number];
	raw: BundleEvidence;
	minified: BundleEvidence;
	gzip: number;
}

export interface SizeReport {
	revision: string;
	dirty: boolean;
	versions: { node: string; esbuild: string; zlib: string };
	entries: EntrySize[];
}

export async function measureEntry(root: string, entry: EntrySize["entry"]): Promise<EntrySize> {
	async function bundle(minify: boolean) {
		const result = await build({
			absWorkingDir: root,
			// An ESM consumer retaining every runtime export, resolved by package exports.
			stdin: { contents: `export * from "${entry}";\n`, resolveDir: root, sourcefile: "size-consumer.js" },
			bundle: true,
			format: "esm",
			minify,
			// In-memory output and dependency evidence do not change bundle settings.
			write: false,
			metafile: true,
		});
		const output = result.outputFiles[0].contents;
		const evidence: BundleEvidence = {
			bytes: output.byteLength,
			inputs: Object.keys(result.metafile.inputs).sort(),
			exports: Object.values(result.metafile.outputs)[0].exports.sort(),
		};
		return { output, evidence };
	}
	const raw = await bundle(false);
	const minified = await bundle(true);
	return { entry, raw: raw.evidence, minified: minified.evidence, gzip: gzipSync(minified.output, { level: 9 }).byteLength };
}

export function violations(entries: EntrySize[]): string[] {
	const problems: string[] = [];
	for (const entry of ENTRIES) {
		const size = entries.find(size => size.entry === entry);
		if (!size) {
			problems.push(`Missing measurement: ${entry}`);
			continue;
		}
		const playback = entry === ENTRIES[0];
		if (playback && size.gzip > PLAYBACK_LIMIT) problems.push(`Playback exceeds ${PLAYBACK_LIMIT} gzip bytes by ${size.gzip - PLAYBACK_LIMIT} bytes.`);
		for (const variant of ["raw", "minified"] as const) {
			const evidence = size[variant];
			for (const module of ["dist/player.js", "dist/controls.js"]) {
				if (evidence.inputs.includes(module) !== playback) problems.push(`${entry} ${variant}: expected ${playback ? "presence" : "absence"} of ${module}.`);
			}
			const expected = playback ? ["createPlayer", "mountPlayback"] : ["render", "DARK", "LIGHT", "TOKENS", "checkPalette"];
			for (const name of expected) {
				if (!evidence.exports.includes(name)) problems.push(`${entry} ${variant}: missing runtime export ${name}.`);
			}
		}
	}
	return problems;
}

export function formatReport(report: SizeReport): string {
	const bytes = (n: number) => `${n} B (${(n / 1024).toFixed(3)} KiB)`;
	const lines = [
		"## Package JavaScript size",
		"",
		`Git revision: ${report.revision}${report.dirty ? " (working tree has changes)" : " (clean)"}`,
		`Tools: Node ${report.versions.node}; esbuild ${report.versions.esbuild}; zlib ${report.versions.zlib}.`,
		"Settings: separate ESM consumers, export * from each package specifier; built JavaScript resolved through package exports.",
		"esbuild: --bundle --format=esm; raw without --minify, minified with --minify; all other settings use pinned esbuild defaults (browser platform, no target override). In-memory output; metafile enabled for evidence.",
		"gzip: minified bundle, level 9 via Node zlib. 1 KiB = 1024 bytes.",
		"",
		"| Entry | Raw | Minified | Gzip | Budget |",
		"| --- | ---: | ---: | ---: | --- |",
		...report.entries.map(size => `| ${size.entry} | ${bytes(size.raw.bytes)} | ${bytes(size.minified.bytes)} | ${bytes(size.gzip)} | ${size.entry === ENTRIES[0] ? `${size.gzip <= PLAYBACK_LIMIT ? "PASS" : "FAIL"}: <= ${PLAYBACK_LIMIT} B (12 KiB) gzip` : "None"} |`),
		"",
		"### Bundle evidence (esbuild metafiles)",
		"",
	];
	for (const size of report.entries) {
		for (const variant of ["raw", "minified"] as const) {
			lines.push(`- ${size.entry} ${variant} exports: ${size[variant].exports.join(", ")}.`, `  Inputs: ${size[variant].inputs.join(", ")}.`);
		}
	}
	const problems = violations(report.entries);
	lines.push("", ...(problems.length ? problems : ["PASS: playback budget and runtime exports verified; core includes neither dist/player.js nor dist/controls.js."]), "");
	return lines.join("\n");
}

// Publish the complete report before returning a failing status, in local and CI runs.
export function publishReport(report: SizeReport, publish: (text: string) => void): number {
	publish(formatReport(report));
	return violations(report.entries).length ? 1 : 0;
}
