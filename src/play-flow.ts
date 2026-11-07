import type { Layout } from "./grid.ts";
import type { Scenario, Timeline } from "./play.ts";
import { nameTimelines } from "./play-timelines.ts";

// Index-based identities avoid ambiguity in arbitrary node ids and distinguish
// parallel edges. Each edge's stroke, head and label share one part identity.
export const nodePart = (index: number) => `node-${index}`;
export const edgePart = (index: number) => `edge-${index}`;

export function resolveFlow(scenarios: Scenario[], layout: Layout): Timeline[] {
	const nodes = new Map(layout.nodes.map((p, i) => [p.node.id, { node: p.node, part: nodePart(i) }]));
	return nameTimelines(scenarios).map((timeline, index) => {
		const scenario = scenarios[index];
		let previous: string | undefined;
		for (const step of scenario.steps) {
			const resolved = nodes.get(step.target);
			const error = (message: string) => layout.diagnostics.push({ line: step.line, severity: "error", message });
			if (!resolved) {
				error(`unknown playback target \`${step.target}\`; step skipped`);
				continue;
			}
			const parts = [resolved.part];
			if (previous !== undefined && previous !== step.target) {
				layout.routes.forEach((r, i) => {
					if (r.edge.from === previous && r.edge.to === step.target) parts.push(edgePart(i));
				});
				if (parts.length === 1) {
					error(`no playback edge from \`${previous}\` to \`${step.target}\`; step skipped`);
					continue;
				}
			}
			timeline.steps.push({ target: step.target, kind: resolved.node.kind, actor: step.actor ?? resolved.node.label, caption: step.caption, ms: step.ms, parts });
			previous = step.target;
		}
		return timeline;
	});
}
