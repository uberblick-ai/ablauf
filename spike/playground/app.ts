// The playground page: a sidebar of flows, an editor, the render and its
// problems. Renders in the browser with the package's own code.

import { DARK, LIGHT, render } from "../flow/index.ts";

interface Group {
	folder: string;
	names: string[];
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const editor = $<HTMLTextAreaElement>("pg-editor");
const target = $<HTMLDivElement>("pg-render");
const host = $<HTMLElement>("pg-host");
const problems = $<HTMLUListElement>("pg-diagnostics");
const save = $<HTMLButtonElement>("pg-save");
const status = $<HTMLSpanElement>("pg-status");
const grid = $<HTMLInputElement>("pg-grid");

let current: { folder: string; name: string } | null = null;
let saved = "";
const SCRATCH = "flow v0\ncolumns main\n\nbox start col=main \"say what happens first\"\nend done \"Finished\"\n\nstart --> done : then\n";

function setScheme(scheme: string) {
	const palette: Record<string, string> = scheme === "dark" ? DARK : LIGHT;
	for (const [key, value] of Object.entries(palette)) host.style.setProperty(`--ab-${key}`, value);
	document.documentElement.dataset.scheme = scheme;
}

function draw() {
	const { svg, diagnostics, layout } = render(editor.value, { idPrefix: "pg" });
	target.innerHTML = svg;
	if (grid.checked) {
		const svgEl = target.querySelector("svg");
		const boxes = layout.nodes
			.map(
				(p: { node: { id: string }; x: number; y: number; w: number; h: number }) =>
					`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" class="pg-box"/><text x="${p.x + 2}" y="${p.y - 3}" class="pg-box-id">${p.node.id}</text>`,
			)
			.join("");
		svgEl?.insertAdjacentHTML("beforeend", `<g>${boxes}</g>`);
	}
	problems.replaceChildren(
		...diagnostics.map((d: { line: number; severity: string; message: string }) => {
			const li = document.createElement("li");
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = `Line ${d.line}: ${d.message}`;
			button.className = d.severity;
			button.addEventListener("click", () => selectLine(d.line));
			li.append(button);
			return li;
		}),
	);
	status.textContent = diagnostics.length ? `${diagnostics.length} problem${diagnostics.length > 1 ? "s" : ""}` : "No problems";
	status.className = `pg-status ${diagnostics.length ? "bad" : "good"}`;
	save.disabled = !current || editor.value === saved;
}

function selectLine(line: number) {
	const lines = editor.value.split("\n");
	const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
	editor.focus();
	editor.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
	const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight) || 20;
	editor.scrollTop = Math.max(0, (line - 4) * lineHeight);
}

async function open() {
	const hash = decodeURIComponent(location.hash.slice(1));
	const match = /^([a-z]+)\/([a-z0-9-]+)$/.exec(hash);
	for (const a of document.querySelectorAll(".pg-item")) a.toggleAttribute("aria-current", a.getAttribute("href") === `#${hash || "scratch"}`);
	if (!match) {
		current = null;
		saved = "";
		$("pg-title").textContent = "Scratch";
		editor.value = SCRATCH;
	} else {
		const [, folder, name] = match;
		const response = await fetch(`/api/flow/${folder}/${name}`);
		if (!response.ok) {
			$("pg-title").textContent = `Unknown flow: ${hash}`;
			return;
		}
		current = { folder, name };
		saved = await response.text();
		editor.value = saved;
		$("pg-title").textContent = `${folder}/${name}.flow`;
	}
	$("pg-reference").hidden = !(current?.name === "loop" || current?.name === "loop-insert");
	draw();
}

async function sidebar() {
	const groups: Group[] = await (await fetch("/api/catalog")).json();
	$("pg-groups").replaceChildren(
		...groups.map((g) => {
			const details = document.createElement("details");
			details.open = true;
			const summary = document.createElement("summary");
			summary.textContent = g.folder;
			details.append(summary, ...g.names.map((n) => Object.assign(document.createElement("a"), { className: "pg-item", href: `#${g.folder}/${n}`, textContent: n })));
			return details;
		}),
	);
}

save.addEventListener("click", async () => {
	if (!current) return;
	const response = await fetch(`/api/flow/${current.folder}/${current.name}`, { method: "PUT", body: editor.value });
	if (response.ok) saved = editor.value;
	status.textContent = response.ok ? "Saved" : `Not saved: ${await response.text()}`;
	save.disabled = editor.value === saved;
});
editor.addEventListener("input", draw);
editor.addEventListener("keydown", (event) => {
	if ((event.metaKey || event.ctrlKey) && event.key === "s") {
		event.preventDefault();
		save.click();
	}
});
grid.addEventListener("change", draw);
for (const input of document.querySelectorAll<HTMLInputElement>('input[name="scheme"]')) input.addEventListener("change", () => setScheme(input.value));
for (const input of document.querySelectorAll<HTMLInputElement>('input[name="host"]')) input.addEventListener("change", () => host.classList.toggle("column", input.value === "column"));
window.addEventListener("hashchange", open);
window.addEventListener("beforeunload", (event) => {
	if (current && editor.value !== saved) event.preventDefault();
});

setScheme("light");
await sidebar();
await open();
