import assert from "node:assert/strict";
import { once } from "node:events";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createPlaygroundServer } from "../tools/playground/server.ts";

test("playground and browser fixture serve complete module graphs inside the existing sandbox", async t => {
	const root = mkdtempSync(join(process.env.UB_AGENTS_SCRATCH ?? tmpdir(), "ablauf-routes-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const path of ["src", "tools/playground", "examples", "docs/trials", "docs/reference"]) {
		cpSync(new URL(`../${path}`, import.meta.url), join(root, path), { recursive: true });
	}
	const server = createPlaygroundServer(root);
	try {
		server.listen(0, "127.0.0.1");
		await once(server, "listening");
		const address = server.address();
		assert.ok(address && typeof address === "object");
		const origin = `http://127.0.0.1:${address.port}`;
		const visited = new Set<string>();
		async function moduleGraph(path: string) {
			if (visited.has(path)) return;
			visited.add(path);
			const response = await fetch(`${origin}${path}`);
			assert.equal(response.status, 200, path);
			assert.match(response.headers.get("content-type") ?? "", /text\/javascript/);
			const js = await response.text();
			assert.doesNotMatch(js, /\binterface\s+\w+\s*\{/);
			for (const match of js.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
				assert.ok(match[1].startsWith("."), `browser import must be local: ${match[1]}`);
				await moduleGraph(new URL(match[1], `${origin}${path}`).pathname);
			}
		}
		for (const page of ["/", "/playback-review"]) {
			const response = await fetch(`${origin}${page}`);
			assert.equal(response.status, 200, page);
			assert.match(response.headers.get("content-type") ?? "", /text\/html/);
			const html = await response.text();
			const scripts = [...html.matchAll(/<script type="module" src="([^"]+)"/g)];
			assert.equal(scripts.length, 1);
			for (const script of scripts) await moduleGraph(script[1]);
		}
		for (const path of ["/src/index.ts", "/src/play-flow.ts", "/src/playback.ts", "/src/player.ts", "/src/controls.ts", "/playground/app.ts", "/playground/playback-review.ts"]) assert.ok(visited.has(path), path);
		const flow = await fetch(`${origin}/api/flow/examples/loop-play`);
		assert.equal(flow.status, 200);
		assert.equal(await flow.text(), readFileSync(new URL("../examples/loop-play.flow", import.meta.url), "utf8"));
		for (const [path, file] of [
			["/api/flow/examples/playback-fade", "../examples/playback-fade.flow"],
			["/playground/playback-crossings.flow", "../tools/playground/playback-crossings.flow"],
			["/playground/playback-compact.flow", "../tools/playground/playback-compact.flow"],
		]) {
			const response = await fetch(`${origin}${path}`);
			assert.equal(response.status, 200, path);
			assert.equal(await response.text(), readFileSync(new URL(file, import.meta.url), "utf8"));
		}
		assert.equal((await fetch(`${origin}/playground/playback-crossings.flow`, { method: "PUT", body: "no" })).status, 404);
		assert.equal((await fetch(`${origin}/playground/playback-compact.flow`, { method: "PUT", body: "no" })).status, 404);
		assert.equal(await (await fetch(`${origin}/reference/loop.svg`)).text(), readFileSync(new URL("../docs/reference/loop.svg", import.meta.url), "utf8"));
		const catalog = await (await fetch(`${origin}/api/catalog`)).json();
		assert.ok(catalog.flatMap((g: { flows: { folder: string; name: string }[] }) => g.flows).some((f: { folder: string; name: string }) => f.folder === "trials" && f.name === "edit-1"));
		const trial = await fetch(`${origin}/api/flow/trials/edit-1`);
		assert.equal(trial.status, 200);
		assert.equal(await trial.text(), readFileSync(new URL("../docs/trials/edit-1.flow", import.meta.url), "utf8"));
		const saved = join(root, "docs/trials/route-save-test.flow");
		assert.equal(existsSync(saved), false);
		try {
			const source = "flow v0\nbox saved\n";
			const response = await fetch(`${origin}/api/flow/trials/route-save-test`, { method: "PUT", headers: { origin }, body: source });
			assert.equal(response.status, 200);
			assert.equal(readFileSync(saved, "utf8"), source);
		} finally {
			rmSync(saved, { force: true });
		}
		for (const path of ["/playground.css", "/reference/loop.svg", "/api/catalog"]) assert.equal((await fetch(`${origin}${path}`)).status, 200, path);
		for (const path of ["/playground/server.ts", "/playground/catalog.ts", "/controls.test.ts", "/src/../../package.json", "/src/%2e%2e/%2e%2e/package.json", "/src/nested/module.ts", "/src/.hidden.ts", "/src/play-flow.ts/extra", "/package.json", "/api/flow/private/secret"]) {
			assert.ok([400, 404].includes((await fetch(`${origin}${path}`)).status), path);
		}
		assert.equal((await fetch(`${origin}/src/controls.ts`, { method: "PUT", body: "no" })).status, 404);
		assert.equal((await fetch(`${origin}/api/flow/examples/loop-play`, { method: "PUT", body: "no" })).status, 403);
		const missing = await fetch(`${origin}/src/missing-module.ts`);
		assert.equal(missing.status, 500);
		assert.equal(await missing.text(), "request failed", "filesystem errors must not expose local paths or stack information");
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	}
});
