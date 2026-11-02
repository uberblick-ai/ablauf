import type { Scenario, Timeline } from "./play.ts";

// Scenario names and collision handling are shared by every resolver.
export function nameTimelines(scenarios: Scenario[]): Timeline[] {
	const used = new Set<string>();
	return scenarios.map(scenario => {
		const base = scenario.name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "scenario";
		let slug = base;
		for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
		used.add(slug);
		return { name: scenario.name, slug, steps: [] };
	});
}
