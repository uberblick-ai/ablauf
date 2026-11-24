import { readFileSync, readdirSync } from "node:fs";
import type { RenderOptions } from "../src/index.ts";

// Shared by the one-time historical capture and its byte comparison. Do not
// regenerate the capture when changing the renderer.
export const malformed = [
	'outcome "Missing" reason="Only a reason"',
	'outcome "Empty" reason=" " destination=""',
	'outcome "Unquoted" reason=bare destination="Here"',
	'outcome "Unclosed reason="Broken" destination="Here"',
	'outcome "Duplicate" reason="First" reason="Second" destination="Here"',
	'outcome "Unknown" reason="Why" destination="Here" extra="Still visible"',
	'outcome "No gap"reason="Why" destination="Here"',
	'outcome "Bad escape" reason="\\q" destination="Here"',
	'outcome',
	'outcome "Tone" reason="Why" destination="Here" tone="loud"',
];

export function compatibilityOptions(profile: string): RenderOptions {
	return profile === "host" ? { fonts: { mono: {
		family: "Fixture Mono",
		measureText: (text, { fontSize, fontWeight }) => [...text].reduce((w, c) =>
			w + (c === "W" ? 1.3 : c === " " ? 0.4 : 0.65) * fontSize + fontWeight / 1000, 0),
	} } } : {};
}

export function compatibilitySources() {
	const sources: { name: string; source: string; exception?: "second-step" | "newer-header" }[] = [];
	for (const file of readdirSync(new URL("../examples/", import.meta.url)).sort()) {
		if (!file.endsWith(".flow")) continue;
		const source = readFileSync(new URL(`../examples/${file}`, import.meta.url), "utf8");
		if (source.startsWith("fan-out v0")) sources.push({ name: file, source });
	}
	for (const style of ["branches", "ladder"]) {
		const header = `fan-out v0\nstyle ${style}\n`;
		const step = `${header}step "Check"\n`;
		for (const [i, source] of malformed.entries()) sources.push({ name: `${style}-field-${i}`, source: step + source });
		for (const [name, source] of Object.entries({
			missing: header,
			emptyStep: `${header}step ""`,
			lateStep: `${header}outcome "Yes" reason="Why" destination="Here"\nstep "Late"`,
			styleTwice: `${header}style branches\nstep "Check"`,
			styleUnknown: `${header}style zigzag\nstep "Check"`,
			styleLate: `${step}style ladder`,
			rejected: `${step}<script> & "unrecognised"`,
			secondStep: `${step}step "Second"\noutcome "Late"`,
			// Same historical recovery output as the deliberate second-step
			// change, with a seven-character invalid keyword substituted.
			secondStepRecovery: `${step}step "Second"\nreject! "Late"`,
			newerHeader: `${step.replace("fan-out v0", "fan-out v9")}outcome "Yes" reason="Why" destination="Here"`,
		})) sources.push({ name: `${style}-${name}`, source,
			...(name === "secondStep" ? { exception: "second-step" as const } : name === "newerHeader" ? { exception: "newer-header" as const } : {}) });
	}
	for (const header of ["fan-out", "fan-out x", "fan-out v-1"])
		sources.push({ name: header, source: `${header}\nstep "Check"\noutcome "Yes" reason="Why" destination="Here"` });
	return sources;
}
