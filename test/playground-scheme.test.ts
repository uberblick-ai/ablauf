import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { DARK, LIGHT } from "../src/index.ts";

const html = readFileSync(new URL("../tools/playground/index.html", import.meta.url), "utf8");
const app = stripTypeScriptTypes(readFileSync(new URL("../tools/playground/app.ts", import.meta.url), "utf8"))
	.replace(/^import .* from .*;$/gm, "");

for (const initial of ["light", "dark"] as const) {
	test(`playground defaults to automatic on a ${initial} system and tracks or pins live changes`, async () => {
		const radios = [...html.matchAll(/<input type="radio" name="scheme" value="([^"]+)"([^>]*)>/g)]
			.map(([, value, attributes]) => ({ value, checked: attributes.includes("checked"), change: () => {}, addEventListener(_type: string, listener: () => void) { this.change = listener; } }));
		assert.deepEqual(radios.map(radio => [radio.value, radio.checked]), [["auto", true], ["light", false], ["dark", false]]);
		const palette = new Map<string, string>();
		const root = { dataset: { scheme: "" } };
		const element = {
			value: "", checked: false, style: { setProperty: (key: string, value: string) => palette.set(key, value) },
			addEventListener() {}, replaceChildren() {}, querySelector() { return null; },
		};
		const media = {
			matches: initial === "dark", change: () => {},
			addEventListener(type: string, listener: () => void) { assert.equal(type, "change"); this.change = listener; },
		};
		let draws = 0;
		// Execute the actual page entry with an empty sidebar and scratch preview.
		// Browser verification separately covers CSS, the SVG and mounted controls.
		await runInNewContext(`(async () => { ${app}\n })()`, {
			LIGHT, DARK,
			render: () => { draws++; return { svg: "", diagnostics: [], layout: { nodes: [] }, timelines: [] }; },
			document: {
				documentElement: root, getElementById: () => element,
				querySelector: () => radios.find(radio => radio.checked),
				querySelectorAll: (selector: string) => selector === 'input[name="scheme"]' ? radios : [],
			},
			window: { matchMedia: (query: string) => { assert.equal(query, "(prefers-color-scheme: dark)"); return media; }, addEventListener() {} },
			location: { hash: "" }, fetch: async () => ({ json: async () => [] }),
		});
		function check(expected: "light" | "dark") {
			assert.equal(root.dataset.scheme, expected);
			assert.deepEqual(Object.fromEntries(palette), Object.fromEntries(Object.entries(expected === "dark" ? DARK : LIGHT).map(([key, value]) => [`--ab-${key}`, value])));
			assert.equal(draws, 1, "scheme changes preserve the preview and playback mount");
		}
		function system(scheme: "light" | "dark") { media.matches = scheme === "dark"; media.change(); }
		function select(value: string) {
			for (const radio of radios) radio.checked = radio.value === value;
			const checked = radios.find(radio => radio.checked);
			assert.ok(checked);
			checked.change();
		}
		check(initial);
		system("dark"); check("dark");
		system("light"); check("light");
		for (const pinned of ["light", "dark"] as const) {
			select(pinned); check(pinned);
			system("dark"); check(pinned);
			system("light"); check(pinned);
			select("auto"); check("light");
			system("dark"); check("dark");
			system("light"); check("light");
		}
	});
}
