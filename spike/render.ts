// Renders every example to spike/out/<name>.svg and prints its diagnostics.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "./flow/index.ts";

const here = import.meta.dirname;
let problems = 0;
for (const file of readdirSync(join(here, "examples"))
	.filter((f) => f.endsWith(".flow"))
	.sort()) {
	const name = file.replace(/\.flow$/, "");
	const { svg, diagnostics } = render(
		readFileSync(join(here, "examples", file), "utf8"),
		{ idPrefix: name },
	);
	writeFileSync(join(here, "out", `${name}.svg`), svg);
	console.log(`${name}: ${diagnostics.length} diagnostics`);
	for (const d of diagnostics)
		console.log(`  ${file}:${d.line} ${d.severity}: ${d.message}`);
	problems += diagnostics.length;
}
// The README shows these in GitHub's own theme, one file per scheme.
for (const name of ["primer", "loop"]) {
	const source = readFileSync(join(here, "examples", `${name}.flow`), "utf8");
	for (const scheme of ["light", "dark"] as const)
		writeFileSync(
			join(here, "..", "docs", "images", `${name}-${scheme}.svg`),
			render(source, { idPrefix: name, scheme }).svg,
		);
}
process.exitCode = problems ? 1 : 0;
