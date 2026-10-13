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
process.exitCode = problems ? 1 : 0;
