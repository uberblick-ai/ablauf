import { render } from "../flow/index.ts";
import { createPlayer, mountPlayback, type PlaybackMount } from "../flow/playback.ts";

const scheme = document.getElementById("review-scheme") as HTMLSelectElement;
const hostScheme = document.getElementById("review-host") as HTMLSelectElement;
const loop = document.getElementById("review-loop") as HTMLInputElement;
const accent = document.getElementById("review-accent") as HTMLSelectElement;
const zeroGlow = document.getElementById("review-zero-glow") as HTMLInputElement;
const cases = document.getElementById("review-cases") as HTMLElement;
const mounts: PlaybackMount[] = [];
const figureCSS = ".review-figure svg{display:block;max-width:100%;height:auto}";

function addCase(title: string, source: string, idPrefix: string, shadow = false, headless = false) {
	const section = document.createElement("section");
	section.className = "review-document";
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
	const svg = figure.querySelector("svg");
	if (!svg) throw new Error("Missing rendered SVG");
	const retained = document.createElement("p");
	retained.className = "review-note";
	retained.textContent = "Host content remains after either teardown entry point.";
	container.append(style, figure, retained);
	function makeMount(): PlaybackMount {
		if (!headless) return mountPlayback(figure, svg as SVGSVGElement, result.timelines, { loop: loop.checked });
		const player = createPlayer(svg as SVGSVGElement, result.timelines, { loop: loop.checked });
		return { player, destroy: () => player.destroy() };
	}
	let mount = makeMount();
	mounts.push(mount);
	const note = document.createElement("p");
	note.className = "review-note";
	note.textContent = "Mounted, idle. No autoplay.";
	function button(label: string, action: () => void) {
		const el = document.createElement("button");
		el.type = "button";
		el.textContent = label;
		el.addEventListener("click", action);
		return el;
	}
	section.append(heading, surface,
		button("mount.destroy()", () => { mount.destroy(); note.textContent = "Destroyed through mount."; }),
		button("player.destroy()", () => { mount.player.destroy(); note.textContent = "Destroyed through player."; }),
		button("Remount", () => {
			mount.destroy();
			mounts.splice(mounts.indexOf(mount), 1);
			mount = makeMount();
			mounts.push(mount);
			note.textContent = "Remounted, idle. No duplicate controls.";
		}), note);
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
const [source, fade, crossings] = await Promise.all([
	load("/api/flow/examples/loop-play"),
	load("/api/flow/examples/playback-fade"),
	load("/playground/playback-crossings.flow"),
]);
const single = 'flow v0\nbox a "Start"\nbox b "Finish"\na --> b\nplay "One scenario"\n step a actor="Author" "Start here"\n step b "Finish here"\n';
const compact = [
	'flow v0\nbox a "Start"\nbox b "Finish"\na --> b\n',
	'play "Short captions"\n step a actor="Author" "Start here"\n step b actor="Reviewer" "Finish here"\n',
	'play "Single-line caption scrolling"\n step a actor="Author" "A short caption first"\n step b actor="Reviewer" "This deliberately long caption stays on one line at document width. Scroll horizontally to read every word using pointer, touch or keyboard. The actor and caption lines keep their space, and the buttons and segmented step bar stay stationary through short, overflowing and blank captions. This is the end of the caption."\n step a ""\n',
	'play "Caption without an actor"\n step a "The actor line still keeps its space"\n',
	'play "Another short scenario"\n step b actor="Reviewer" "A short caption again"\n',
	'play "An empty scenario at the end of the overflowing tabs"\n',
].join("");

function draw() {
	for (const mount of mounts) mount.destroy();
	mounts.length = 0;
	cases.replaceChildren();
	addCase("Loop · light DOM", source, "review-light-dom");
	addCase("Loop · shadow root", source, "review-shadow", true);
	addCase("Compact controls · overflowing tabs and single-line captions", compact, "review-compact");
	addCase("Fade · inline labels on canvas and band", fade, "review-fade");
	addCase("Fade · crossing knockouts (two expected warnings)", crossings, "review-crossings");
	addCase("Single timeline · no tabs", single, "review-single");
	addCase("Direct createPlayer · no built-in controls", single, "review-headless", false, true);
	addCase("Tabbed · includes an empty scenario", `${single}play "Empty scenario"\n`, "review-empty");
}
scheme.addEventListener("change", draw);
loop.addEventListener("change", draw);
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
