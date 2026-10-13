// node check.ts <file.flow>: writes <file>.svg next to it and lists problems.
import { readFileSync, writeFileSync } from "node:fs";
import { render } from "./flow/index.ts";

const file = process.argv[2];
if (!file) {
	console.error("usage: node check.ts <file.flow>");
	process.exit(2);
}
const { svg, diagnostics } = render(readFileSync(file, "utf8"));
writeFileSync(`${file.replace(/\.flow$/, "")}.svg`, svg);
for (const d of diagnostics)
	console.log(`${file}:${d.line} ${d.severity}: ${d.message}`);
console.log(
	diagnostics.length ? `${diagnostics.length} problem(s)` : "no problems",
);
process.exitCode = diagnostics.length ? 1 : 0;
