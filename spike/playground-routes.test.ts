import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createPlaygroundServer } from "./playground/server.ts";

test("playground and browser fixture serve complete module graphs inside the existing sandbox", async () => {
	const server = createPlaygroundServer();
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
		for (const path of ["/flow/index.ts", "/flow/play-flow.ts", "/flow/playback.ts", "/flow/player.ts", "/flow/controls.ts", "/playground/app.ts", "/playground/playback-review.ts"]) assert.ok(visited.has(path), path);
		const flow = await fetch(`${origin}/api/flow/examples/loop-play`);
		assert.equal(flow.status, 200);
		assert.equal(await flow.text(), readFileSync(new URL("./examples/loop-play.flow", import.meta.url), "utf8"));
		for (const path of ["/playground.css", "/reference/loop.svg", "/api/catalog"]) assert.equal((await fetch(`${origin}${path}`)).status, 200, path);
		for (const path of ["/playground/server.ts", "/playground/catalog.ts", "/controls.test.ts", "/flow/../../package.json", "/flow/%2e%2e/%2e%2e/package.json", "/flow/nested/module.ts", "/flow/.hidden.ts", "/flow/play-flow.ts/extra", "/package.json", "/api/flow/private/secret"]) {
			assert.ok([400, 404].includes((await fetch(`${origin}${path}`)).status), path);
		}
		assert.equal((await fetch(`${origin}/flow/controls.ts`, { method: "PUT", body: "no" })).status, 404);
		assert.equal((await fetch(`${origin}/api/flow/examples/loop-play`, { method: "PUT", body: "no" })).status, 403);
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	}
});
