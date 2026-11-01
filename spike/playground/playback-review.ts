import { render } from "../flow/index.ts";
import { mountPlayback, type PlaybackMount } from "../flow/playback.ts";

const scheme = document.getElementById("review-scheme") as HTMLSelectElement;
const hostScheme = document.getElementById("review-host") as HTMLSelectElement;
const loop = document.getElementById("review-loop") as HTMLInputElement;
const cases = document.getElementById("review-cases") as HTMLElement;
const mounts: PlaybackMount[] = [];
const figureCSS = ".review-figure svg{display:block;max-width:100%;height:auto}";

function addCase(title: string, source: string, idPrefix: string, shadow = false) {
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
	let mount = mountPlayback(figure, svg, result.timelines, { loop: loop.checked });
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
			mount = mountPlayback(figure, svg, result.timelines, { loop: loop.checked });
			mounts.push(mount);
			note.textContent = "Remounted, idle. No duplicate controls.";
		}), note);
	cases.append(section);
}

const response = await fetch("/api/flow/examples/loop-play");
if (!response.ok) throw new Error(`Cannot load loop-play: ${response.status}`);
const source = await response.text();
const single = 'flow v0\nbox a "Start"\nbox b "Finish"\na --> b\nplay "One scenario"\n step a actor="Author" "Start here"\n step b "Finish here"\n';

function draw() {
	for (const mount of mounts) mount.destroy();
	mounts.length = 0;
	cases.replaceChildren();
	addCase("Loop · light DOM", source, "review-light-dom");
	addCase("Loop · shadow root", source, "review-shadow", true);
	addCase("Single timeline · no tabs", single, "review-single");
	addCase("Tabbed · includes an empty scenario", `${single}play "Empty scenario"\n`, "review-empty");
}
scheme.addEventListener("change", draw);
loop.addEventListener("change", draw);
hostScheme.addEventListener("change", () => { document.body.dataset.host = hostScheme.value; });
draw();
