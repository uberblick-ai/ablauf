import { cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { TestContext } from "node:test";

// Each real build owns its package root and dist for its entire lifetime,
// including subsequent measurement or packing. Only dependencies and read-only
// Git metadata are shared; no test builds into the checkout.
export function buildFixture(t: TestContext): string {
	const checkout = resolve(import.meta.dirname, "..");
	const root = mkdtempSync(join(process.env.UB_AGENTS_SCRATCH ?? tmpdir(), "ablauf-build-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const path of ["package.json", "README.md", "LICENSE", "tsconfig.json", "tsconfig.build.json", "src", "tools"]) {
		cpSync(join(checkout, path), join(root, path), { recursive: true });
	}
	symlinkSync(join(checkout, "node_modules"), join(root, "node_modules"), "dir");
	symlinkSync(join(checkout, ".git"), join(root, ".git"));
	return root;
}
