import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { catalog } from "./playground/catalog.ts";

test("the playground sidebar groups flows by kind, examples before trials", (t) => {
	const root = mkdtempSync(join(tmpdir(), "ablauf-catalog-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(join(root, "examples"));
	mkdirSync(join(root, "trials"));
	writeFileSync(join(root, "examples", "loop.flow"), "flow v0\n");
	writeFileSync(join(root, "examples", "approvals.flow"), "# a comment first\n\nfan-out v0\n");
	writeFileSync(join(root, "examples", "notes.txt"), "fan-out v0\n");
	writeFileSync(join(root, "trials", "edit-1.flow"), "flow v0\n");
	writeFileSync(join(root, "trials", "empty.flow"), "");
	assert.deepEqual(catalog(root), [
		{
			kind: "Flow",
			flows: [
				{ folder: "examples", name: "loop" },
				{ folder: "trials", name: "edit-1" },
				{ folder: "trials", name: "empty" },
			],
		},
		{ kind: "Fan-out", flows: [{ folder: "examples", name: "approvals" }] },
	]);
});

test("a kind with no files has no group", (t) => {
	const root = mkdtempSync(join(tmpdir(), "ablauf-catalog-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(join(root, "examples"));
	mkdirSync(join(root, "trials"));
	writeFileSync(join(root, "examples", "loop.flow"), "flow v0\n");
	assert.deepEqual(catalog(root), [{ kind: "Flow", flows: [{ folder: "examples", name: "loop" }] }]);
});

test("the real examples include both kinds", () => {
	const groups = catalog(import.meta.dirname);
	assert.deepEqual(groups.map((g) => g.kind), ["Flow", "Fan-out"]);
	const fanouts = groups[1].flows.map((f) => f.name);
	for (const name of ["approvals", "run-endings", "run-endings-ladder"]) assert.ok(fanouts.includes(name), name);
});
