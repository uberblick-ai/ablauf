// The playground page: a sidebar of flows, an editor, the render and its
// problems. Renders in the browser with the package's own code.

import { DARK, LIGHT, render } from "../flow/index.ts";

interface Group {
	folder: string;
	names: string[];
}

interface Flow {
	folder: string;
	name: string;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const editor = $<HTMLTextAreaElement>("pg-editor");
const target = $<HTMLDivElement>("pg-render");
const host = $<HTMLElement>("pg-host");
const problems = $<HTMLUListElement>("pg-diagnostics");
const save = $<HTMLButtonElement>("pg-save");
const status = $<HTMLSpanElement>("pg-status");
const grid = $<HTMLInputElement>("pg-grid");

let current: Flow | null = null;
let saved = "";
let saving = false;
let saveAgain: Flow | null = null;
const SCRATCH = "flow v0\ncolumns main\n\nbox start col=main \"say what happens first\"\nend done \"Finished\"\n\nstart --> done : then\n";

function setScheme(scheme: string) {
	const palette: Record<string, string> = scheme === "dark" ? DARK : LIGHT;
	for (const [key, value] of Object.entries(palette)) host.style.setProperty(`--ab-${key}`, value);
	document.documentElement.dataset.scheme = scheme;
}

function draw() {
	const { svg, diagnostics, layout } = render(editor.value, { idPrefix: "pg" });
	target.innerHTML = svg;
	const svgEl = target.querySelector("svg");
	if (grid.checked && svgEl) {
		// Built as elements, so an id in the source is only ever text.
		const NS = "http://www.w3.org/2000/svg";
		const make = (tag: string, attrs: Record<string, string | number>) => {
			const el = document.createElementNS(NS, tag);
			for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
			return el;
		};
		const group = make("g", {});
		for (const p of layout.nodes) {
			const label = make("text", { x: p.x + 2, y: p.y - 3, class: "pg-box-id" });
			label.textContent = p.node.id;
			group.append(make("rect", { x: p.x, y: p.y, width: p.w, height: p.h, class: "pg-box" }), label);
		}
		svgEl.append(group);
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
	updateSave();
}

function updateSave() {
	save.disabled = !current || (!saving && editor.value === saved);
}

function selectLine(line: number) {
	const lines = editor.value.split("\n");
	const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
	editor.focus();
	editor.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0));
	const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight) || 20;
	editor.scrollTop = Math.max(0, (line - 4) * lineHeight);
}

let shown = location.hash;
let loads = 0;

async function open() {
	// Leaving a flow with unsaved edits asks first; staying puts the address back.
	if (location.hash !== shown && current && editor.value !== saved && !confirm("Discard unsaved changes?")) {
		history.replaceState(null, "", shown || "#scratch");
		return;
	}
	shown = location.hash;
	const load = ++loads;
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
		const text = response.ok ? await response.text() : "";
		if (load !== loads) return; // a newer selection is loading
		if (!response.ok) {
			current = null;
			saved = editor.value = "";
			$("pg-title").textContent = `Unknown flow: ${hash}`;
			draw();
			return;
		}
		current = { folder, name };
		saved = text;
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

async function saveCurrent() {
	if (!current) return;
	if (saving) {
		saveAgain = current;
		return;
	}
	// Keep what was sent: typing or switching flows during the request must not count as saved.
	const flow = current;
	const body = editor.value;
	saving = true;
	updateSave();
	try {
		const response = await fetch(`/api/flow/${flow.folder}/${flow.name}`, { method: "PUT", body });
		const message = response.ok ? "Saved" : `Not saved: ${await response.text()}`;
		if (current === flow) {
			if (response.ok) saved = body;
			status.textContent = message;
		}
	} catch (error) {
		if (current === flow) status.textContent = `Not saved: ${error instanceof Error ? error.message : String(error)}`;
	} finally {
		saving = false;
		const next = saveAgain;
		saveAgain = null;
		// A queued save reads the latest text, and never follows a discarded flow.
		if (next && next === current) await saveCurrent();
		else updateSave();
	}
}

save.addEventListener("click", saveCurrent);
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
