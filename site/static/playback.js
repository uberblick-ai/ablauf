import { mountPlayback } from "./playback/playback.js";

for (const figure of document.querySelectorAll(".ex-pic[data-timelines]")) {
	const svg = figure.querySelector("svg");
	if (svg) mountPlayback(figure, svg, JSON.parse(figure.dataset.timelines), { layout: "auto" });
}
