import { render } from "../flow/index.ts";
import { createPlayer, mountPlayback, type PlaybackMount } from "../flow/playback.ts";

const scheme = document.getElementById("review-scheme") as HTMLSelectElement;
const hostScheme = document.getElementById("review-host") as HTMLSelectElement;
const loop = document.getElementById("review-loop") as HTMLInputElement;
const accent = document.getElementById("review-accent") as HTMLSelectElement;
const zeroGlow = document.getElementById("review-zero-glow") as HTMLInputElement;
const claimLayout = document.getElementById("review-claim-layout") as HTMLSelectElement;
const cases = document.getElementById("review-cases") as HTMLElement;
const mounts: { destroy(): void }[] = [];
const figureCSS = ".review-figure svg{display:block;max-width:100%;height:auto}";

function addCase(title: string, source: string, idPrefix: string, shadow = false, headless = false,
	playbackOptions: { autoplay?: boolean; pauseWhenOffscreen?: boolean; layout?: "below" | "side" | "auto" } = {}) {
	const section = document.createElement("section");
	section.className = "review-document";
	if (idPrefix.startsWith("review-claim")) section.classList.add("review-wide");
	const heading = document.createElement("h2");
	heading.textContent = title;
	const surface = document.createElement("div");
	const container = shadow ? surface.attachShadow({ mode: "open" }) : surface;
	const style = document.createElement("style");
	style.textContent = figureCSS;
	const figure = document.createElement("div");
	figure.className = "review-figure";
	const selectedScheme = scheme.value === "dark" ? "dark" : scheme.value === "light" ? "light" : undefined;
	const result = render(source, { idPrefix, scheme: selectedScheme });
	figure.innerHTML = result.svg;
	const initialSvg = figure.querySelector("svg");
	if (!initialSvg) throw new Error("Missing rendered SVG");
	let svg = initialSvg;
	let timelines = result.timelines;
	const retained = document.createElement("p");
	retained.className = "review-note";
	retained.textContent = "Host content remains after either teardown entry point.";
	container.append(style, figure, retained);
	function makeMount(): Pick<PlaybackMount, "player" | "destroy"> & Partial<Pick<PlaybackMount, "update">> {
		if (!headless) return mountPlayback(figure, svg, timelines, { loop: loop.checked, ...playbackOptions });
		const player = createPlayer(svg, timelines, { loop: loop.checked, pauseWhenOffscreen: playbackOptions.pauseWhenOffscreen });
		return { player, destroy: () => player.destroy() };
	}
	let mount = makeMount();
	let pending: ReturnType<typeof setTimeout> | undefined;
	const cleanup = { destroy() { clearTimeout(pending); mount.destroy(); } };
	mounts.push(cleanup);
	const note = document.createElement("p");
	note.className = "review-note";
	note.textContent = playbackOptions.autoplay ? "Autoplay: waits for half visibility." : "Mounted, idle. No autoplay.";
	const stateLine = document.createElement("p");
	stateLine.className = "review-note";
	const watch = () => mount.player.subscribe(state => {
		stateLine.textContent = `Scenario ${state.scenario}, step ${state.step}, ${state.status}; connected: ${svg.isConnected}; document: ${document.visibilityState}`;
	});
	let unsubscribe = watch();
	function button(label: string, action: () => void) {
		const el = document.createElement("button");
		el.type = "button";
		el.textContent = label;
		el.addEventListener("click", action);
		return el;
	}
	section.append(heading, surface,
		button("mount.destroy()", () => { cleanup.destroy(); note.textContent = "Destroyed through mount."; }),
		button("player.destroy()", () => { clearTimeout(pending); mount.player.destroy(); note.textContent = "Destroyed through player."; }),
		button("Remount", () => {
			cleanup.destroy(); unsubscribe();
			mount = makeMount();
			unsubscribe = watch();
			note.textContent = "Remounted, idle. No duplicate controls.";
		}),
		button("Remove SVG", () => { svg.remove(); note.textContent = "SVG removed. Wait beyond the current dwell before reinserting."; }),
		button("Reinsert SVG", () => { (figure.querySelector(".abp-figure") ?? figure).prepend(svg); note.textContent = "SVG reinserted. A lifecycle pause must wait for explicit Play."; }),
		note, stateLine);
	if (!headless) {
		const mode = document.createElement("select");
		mode.setAttribute("aria-label", `Replacement data for ${title}`);
		for (const [value, text] of [
			["reorder", "Reorder scenarios"], ["remove", "Remove selected scenario"],
			["single", "Keep selected scenario only"], ["empty", "Empty selected scenario"],
			["none", "No timelines"], ["refresh", "Refresh labels, counts and scheme"], ["restore", "Restore original data"],
		]) {
			const option = document.createElement("option"); option.value = value; option.textContent = text; mode.append(option);
		}
		let revision = 0;
		const rebind = () => {
			const fresh = render(source, { idPrefix, scheme: selectedScheme });
			const selected = timelines[mount.player.state.scenario];
			let next = [...timelines];
			if (mode.value === "reorder") next.reverse();
			else if (mode.value === "remove") next = next.filter(timeline => timeline.slug !== selected?.slug);
			else if (mode.value === "single") next = selected ? [selected] : [];
			else if (mode.value === "empty") next = next.map(timeline => timeline === selected ? { ...timeline, steps: [] } : timeline);
			else if (mode.value === "none") next = [];
			else if (mode.value === "refresh") next = next.map(timeline => ({ ...timeline, name: `${timeline.name} · refreshed`,
				steps: timeline.steps.slice(0, 1).map(step => ({ ...step, actor: "Refreshed actor", caption: "Refreshed caption" })) }));
			else next = fresh.timelines;
			const holder = document.createElement("div"); holder.innerHTML = fresh.svg;
			const replacement = holder.querySelector("svg");
			if (!replacement) throw new Error("Missing replacement SVG");
			if (mode.value === "refresh") {
				replacement.classList.remove("ab-auto", "ab-light", "ab-dark");
				replacement.classList.add(++revision % 2 ? "ab-dark" : "ab-light");
			}
			if (svg.parentNode) svg.replaceWith(replacement); else figure.prepend(replacement);
			svg = replacement; timelines = next;
			mount.update?.(svg, timelines);
			note.textContent = `Rebound: ${mode.selectedOptions[0].textContent}. Paused until explicit Play or scenario activation, including with autoplay.`;
		};
		section.append(mode, button("Rebind now", rebind), button("Rebind in 2 seconds (focus a control)", () => {
			clearTimeout(pending); pending = setTimeout(rebind, 2000);
			note.textContent = "Rebinding in two seconds: focus a tab, panel, action button, range or side-list row now.";
		}));
	}
	if (headless) section.append(
		button("Direct Play / Replay", () => mount.player.play()),
		button("Direct Pause", () => mount.player.pause()),
		button("Direct Previous", () => mount.player.previous()),
		button("Direct Next", () => mount.player.next()),
		button("Direct full figure", () => mount.player.seek(-1)),
	);
	if (result.diagnostics.length) {
		const diagnostics = document.createElement("p");
		diagnostics.className = "review-note";
		diagnostics.textContent = result.diagnostics.map(d => `Line ${d.line}: ${d.message}`).join("; ");
		section.append(diagnostics);
	}
	cases.append(section);
}

async function load(path: string) {
	const response = await fetch(path);
	if (!response.ok) throw new Error(`Cannot load ${path}: ${response.status}`);
	return response.text();
}
const [source, fade, crossings, claim, compact] = await Promise.all([
	load("/api/flow/examples/loop-play"),
	load("/api/flow/examples/playback-fade"),
	load("/playground/playback-crossings.flow"),
	load("/api/flow/examples/claim-play"),
	load("/playground/playback-compact.flow"),
]);
const single = 'flow v0\nbox a "Start"\nbox b "Finish"\na --> b\nplay "One scenario"\n step a actor="Author" "Start here"\n step b "Finish here"\n';

function draw() {
	for (const mount of mounts) mount.destroy();
	mounts.length = 0;
	cases.replaceChildren();
	const layout = claimLayout.value === "side" ? "side" : claimLayout.value === "below" ? "below" : "auto";
	addCase("Claim · responsive side captions", claim, "review-claim", false, false, { layout });
	addCase("Claim · side captions in shadow root", claim, "review-claim-shadow", true, false, { layout: "side" });
	addCase("Loop · light DOM", source, "review-light-dom");
	addCase("Loop · shadow root", source, "review-shadow", true);
	addCase("Compact controls · overflowing tabs and single-line captions", compact, "review-compact");
	addCase("Fade · inline labels on canvas and band", fade, "review-fade");
	addCase("Fade · crossing knockouts (two expected warnings)", crossings, "review-crossings");
	addCase("Single timeline · no tabs", single, "review-single");
	addCase("Direct createPlayer · no built-in controls", single, "review-headless", false, true);
	addCase("Tabbed · includes an empty scenario", `${single}play "Empty scenario"\n`, "review-empty");
	addCase("Viewport pause only · manual start", compact, "review-viewport", false, false, { pauseWhenOffscreen: true });
	addCase("Autoplay · half visibility", compact, "review-autoplay", false, false, { autoplay: true });
	addCase("Autoplay and viewport pause · shadow root", compact, "review-both", true, false, { autoplay: true, pauseWhenOffscreen: true });
	addCase("Direct createPlayer · viewport pause only", single, "review-direct-viewport", false, true, { pauseWhenOffscreen: true });
}
scheme.addEventListener("change", draw);
loop.addEventListener("change", draw);
claimLayout.addEventListener("change", draw);
hostScheme.addEventListener("change", () => { document.body.dataset.host = hostScheme.value; });
accent.addEventListener("change", () => {
	if (accent.value) document.body.style.setProperty("--ab-play", accent.value);
	else document.body.style.removeProperty("--ab-play");
});
zeroGlow.addEventListener("change", () => {
	if (zeroGlow.checked) document.body.style.setProperty("--ab-play-glow", "0");
	else document.body.style.removeProperty("--ab-play-glow");
});
draw();
