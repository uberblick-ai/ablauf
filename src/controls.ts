import type { Timeline } from "./play.ts";
import { createPlayerBinding, type Player, type PlayerState } from "./player.ts";

export interface PlaybackMount {
	player: Player;
	readonly isOpen: boolean;
	open(): void;
	close(): void;
	update(svg: SVGSVGElement, timelines: Timeline[]): void;
	expand(): void;
	destroy(): void;
}

// Defaults belong to the controls too: SVG-internal variables cannot reach a
// sibling. Keep every selector under the mount class, including scheme rules.
// Always reserve the native horizontal scrollbar; the empty pseudo-element
// keeps a real text line above it even when there is no caption.
// nowrap also collapses JSON-escaped line breaks; pre would create extra rows.
// Unlayered host rules win even when installed before this mount's defaults.
const STYLE = `@layer ablauf-playback{
.ab-playback{--abp-bg:var(--ab-bg,light-dark(#ffffff,#171c24));--abp-ink:var(--ab-ink,light-dark(#17202c,#e5e9ef));--abp-muted:var(--ab-muted,light-dark(#5a6575,#98a2b0));--abp-line:var(--ab-line,light-dark(#d3d9e2,#2c3440));--abp-play:var(--ab-play,light-dark(#0a7a60,#6ff0cf));color-scheme:inherit;color:var(--abp-ink);background:transparent;font:14px/1.5 var(--ab-font-text,system-ui,sans-serif);padding:0 0 12px;overflow-wrap:anywhere}
.ab-playback.ab-light{color-scheme:light}
.ab-playback.ab-dark{color-scheme:dark}
.ab-playback button{font:12px/1 var(--ab-font-mono,ui-monospace,monospace);color:var(--abp-ink);background:var(--abp-bg);border:1px solid var(--abp-line);border-radius:8px;height:30px;padding:0 10px;cursor:pointer}
.ab-playback .abp-tabs{display:flex;overflow-x:auto;border-bottom:1px solid var(--abp-line)}
.ab-playback .abp-tabs button{flex:none;font-weight:500;color:var(--abp-muted);background:none;border:0;border-bottom:2px solid transparent;border-radius:0;height:auto;padding:11px 16px;white-space:nowrap}
.ab-playback .abp-tabs button:hover{color:var(--abp-ink)}
.ab-playback .abp-tabs button[aria-selected="true"]{color:var(--abp-play);border-bottom-color:var(--abp-play);text-shadow:0 0 var(--ab-play-glow,10px) color-mix(in srgb,var(--abp-play) 50%,transparent)}
.ab-playback .abp-step{display:grid;grid-template-columns:54px minmax(0,1fr);grid-template-rows:20px auto;column-gap:14px;row-gap:2px;box-sizing:border-box;min-height:64px;padding:12px 12px 4px;align-content:start}
.ab-playback .abp-counter{grid-row:1/3;align-self:start;box-sizing:border-box;font:500 11px/20px var(--ab-font-mono,ui-monospace,monospace);color:var(--abp-muted);border:1px solid var(--abp-line);border-radius:999px;padding:0 8px;text-align:center}
.ab-playback .abp-counter:empty{visibility:hidden}
.ab-playback .abp-actor{grid-column:2;font:500 13px/20px var(--ab-font-mono,ui-monospace,monospace);color:var(--abp-play);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ab-playback .abp-caption{grid-column:2;min-width:0;font-size:16px;line-height:1.45;min-height:1.45em;white-space:nowrap;overflow-x:scroll;overflow-y:hidden;scroll-behavior:auto}
.ab-playback .abp-caption:empty::before{content:"\\00a0"}
.ab-playback .abp-actions{display:flex;align-items:center;gap:8px;padding:6px 12px 0}
.ab-playback .abp-toggle{min-width:68px}
.ab-playback .abp-navigation{position:relative;flex:1;min-width:0;border-radius:4px}
.ab-playback .abp-segments{display:flex;gap:3px}
.ab-playback .abp-segments.abp-inactive{display:none}
.ab-playback .abp-segment{display:flex;align-items:center;flex:1;min-width:0;height:30px;cursor:pointer}
.ab-playback .abp-segment::before{content:"";width:100%;height:4px;border-radius:2px;background:var(--abp-line)}
.ab-playback .abp-segment.abp-played::before{background:color-mix(in srgb,var(--abp-play) 45%,var(--abp-line))}
.ab-playback .abp-segment.abp-current::before{background:var(--abp-play);box-shadow:0 0 var(--ab-play-glow,8px) color-mix(in srgb,var(--abp-play) 70%,transparent)}
.ab-playback button:disabled{color:var(--abp-muted);cursor:default}
.ab-playback button:focus-visible,.ab-playback .abp-navigation:focus-within,.ab-playback .abp-panel:focus-visible,.ab-playback .abp-caption:focus-visible{outline:2px solid var(--abp-play);outline-offset:3px}
.ab-playback .abp-tabs button:focus-visible{outline-offset:-3px}
.ab-playback .abp-range,.ab-playback .abp-status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.ab-playback .abp-figure{min-width:0}
.ab-playback .abp-figure svg{display:block;max-width:100%;height:auto}
.ab-playback .abp-controls{min-width:0}
.ab-playback .abp-controls[hidden],.ab-playback .abp-entry[hidden]{display:none}
.ab-playback .abp-entry{padding:6px 12px 0}
.ab-playback.abp-side{display:grid;grid-template-columns:minmax(0,var(--abp-figure-width)) minmax(296px,1fr);gap:24px;align-items:start}
.ab-playback.abp-side .abp-controls{position:sticky;top:0;max-height:100vh;max-height:100dvh;overflow-y:auto;overscroll-behavior-y:contain;scrollbar-gutter:stable}
.ab-playback.abp-side .abp-step{display:none}
.ab-playback.abp-side .abp-actions{padding-top:12px}
.ab-playback .abp-list{list-style:none;margin:0;padding:8px 12px 12px;display:grid;gap:2px}
.ab-playback .abp-list[hidden]{display:none}
.ab-playback .abp-row{display:grid;grid-template-columns:28px minmax(0,1fr);column-gap:10px;width:100%;height:auto;padding:5px 8px;text-align:left;border:0;color:var(--abp-muted);background:none;line-height:1.5}
.ab-playback .abp-row:hover{background:color-mix(in srgb,var(--abp-line) 40%,transparent)}
.ab-playback .abp-number{grid-row:1/3;font:500 11px/20px var(--ab-font-mono,ui-monospace,monospace)}
.ab-playback .abp-who{font:12px/20px var(--ab-font-mono,ui-monospace,monospace);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ab-playback .abp-remark{font:14px/1.4 var(--ab-font-text,system-ui,sans-serif);white-space:pre-wrap}
.ab-playback .abp-row.abp-played{color:var(--abp-ink)}
.ab-playback .abp-row.abp-played .abp-who{color:var(--abp-muted)}
.ab-playback .abp-row[aria-current="step"]{background:color-mix(in srgb,var(--abp-play) 10%,transparent);color:var(--abp-ink)}
.ab-playback .abp-row[aria-current="step"] .abp-number,.ab-playback .abp-row[aria-current="step"] .abp-who{color:var(--abp-play)}
.ab-playback .abp-row[aria-current="step"] .abp-remark{font-weight:600}
.ab-playback .abp-row:focus-visible{outline-offset:-2px}
.ab-playback .abp-empty{padding:12px;color:var(--abp-muted)}
.ab-playback .abp-expand,.ab-playback .abp-close{display:flex;justify-content:flex-end;padding:6px 12px}
.ab-playback .abp-expand[hidden]{display:none}
.ab-playback.abp-dialog{box-sizing:border-box;position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;border:0;padding:8px;overflow:hidden}
.ab-playback.abp-dialog::backdrop{background:var(--abp-bg)}
.ab-playback .abp-content{display:flex;flex-direction:column;height:100%;min-height:0}
.ab-playback.abp-expanded{display:flex;flex:1;flex-direction:column;min-height:0;padding:0;overflow:hidden}
.ab-playback.abp-expanded>.abp-figure{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}
.ab-playback.abp-expanded>.abp-figure>svg{display:block;width:var(--abp-width)!important;height:var(--abp-height)!important;max-width:none!important;max-height:none!important;margin:0 auto}
.ab-playback.abp-expanded>.abp-controls{flex:none;position:static;max-height:50%;overflow:auto}
@media (any-pointer:coarse){
.ab-playback button,.ab-playback .abp-segment{box-sizing:border-box;min-width:44px;min-height:44px}
.ab-playback .abp-actions,.ab-playback .abp-segments{flex-wrap:wrap}
.ab-playback .abp-navigation{flex-basis:100%}
}
}
`;

let mountId = 0;

/**
 * Mount controls beside an inline SVG. Both destroy entry points tear down the mount.
 * With `autoplay`, the figure plays when half of it scrolls into view, pauses when it
 * leaves and resumes when it returns, unless the reader paused it in between.
 */
export function mountPlayback(
	container: HTMLElement | ShadowRoot,
	svg: SVGSVGElement,
	timelines: Timeline[],
	options: { loop?: boolean; autoplay?: boolean; pauseWhenOffscreen?: boolean; layout?: "below" | "side" | "auto"; expand?: boolean } = {},
): PlaybackMount {
	const doc = container.ownerDocument;
	const removers: (() => void)[] = [];
	let root: HTMLDivElement | undefined;
	let style: HTMLStyleElement | undefined;
	let closeExpanded: (() => void) | undefined;
	let openExpanded = () => {};
	let refreshExpanded = () => {};
	let viewportTarget: Element | undefined;
	let synchronize: (state: PlayerState) => void = () => {};
	let isOpen = false;
	let showControls = () => {};
	let focusEntry = () => {};
	let controlsContainFocus = () => false;
	let suppressModalFocus = false;
	function open() {
		if (destroyed || !timelines.length || isOpen) return;
		isOpen = true;
		showControls();
	}
	const binding = createPlayerBinding(svg, timelines, { ...options, beforeChange: open, synchronize: state => synchronize(state), viewportTarget: () => viewportTarget ?? svg });
	const player = binding.player;
	// An absent timeline has no playback entry or state to expose.
	for (const key of ["play", "pause", "next", "previous", "seek", "select"] as const) {
		const action = player[key] as (...args: never[]) => void;
		player[key] = (...args: never[]) => { if (timelines.length) action(...args); };
	}
	let refresh = () => {};
	let placeSvg = (_next: SVGSVGElement) => {};
	const destroyPlayer = player.destroy;
	let destroyed = false;
	function close() {
		if (destroyed) return;
		const returnFocus = controlsContainFocus();
		suppressModalFocus = true;
		try { closeExpanded?.(); } finally { suppressModalFocus = false; }
		isOpen = false;
		binding.reset();
		showControls();
		if (returnFocus) focusEntry();
	}
	function destroy() {
		if (destroyed) return;
		destroyed = true;
		isOpen = false;
		closeExpanded?.();
		destroyPlayer();
		for (const remove of removers.splice(0)) remove();
		root?.remove();
		style?.remove();
	}
	player.destroy = destroy;
	function update(nextSvg: SVGSVGElement, nextTimelines: Timeline[]) {
		if (destroyed) return;
		if (!nextTimelines.length) { closeExpanded?.(); isOpen = false; }
		if (root) placeSvg(nextSvg);
		svg = nextSvg;
		timelines = nextTimelines;
		if (!timelines.length) {
			for (const remove of removers.splice(0)) remove();
			root?.remove(); style?.remove(); root = undefined; style = undefined;
			synchronize = () => {};
			viewportTarget = undefined;
		} else if (!root) buildControls();
		else refresh();
		refreshExpanded();
		binding.update(svg, timelines);
	}
	if (timelines.length) { buildControls(); binding.refreshViewport(); }
	return { player, get isOpen() { return isOpen; }, open, close, update, expand: () => { if (!destroyed && root) { open(); openExpanded(); } }, destroy };

	function buildControls() {
		let live = true;
		removers.push(() => { live = false; });
		const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") => {
			const el = doc.createElement(tag);
			el.className = className;
			el.textContent = text;
			return el;
		};
		function listen(el: HTMLElement, type: string, listener: (event: Event) => void) {
			const guarded = (event: Event) => { if (live && !destroyed) listener(event); };
			el.addEventListener(type, guarded);
			removers.push(() => el.removeEventListener(type, guarded));
		}
		function button(text: string, action: () => void, className = "") {
			const el = make("button", className, text);
			el.type = "button";
			listen(el, "click", action);
			return el;
		}
		root = make("div", "ab-playback");
		style = make("style", "", STYLE);
		const figure = make("div", "abp-figure");
		viewportTarget = figure;
		const column = make("div", "abp-controls");
		const entry = make("div", "abp-entry");
		const play = button("Play", () => {
			open();
			binding.reset();
			player.play();
			if (!destroyed && isOpen) panel.focus({ preventScroll: true });
		});
		play.setAttribute("aria-label", "Play diagram");
		entry.append(play);
		root.append(figure, entry, column);
		focusEntry = () => play.focus({ preventScroll: true });
		controlsContainFocus = () => {
			const active = (column.getRootNode() as Document | ShadowRoot).activeElement;
			return !!active && (column.contains(active) || !!closeExpanded && !!root?.parentElement?.parentElement?.contains(active));
		};
		showControls = () => {
			column.hidden = !isOpen;
			entry.hidden = isOpen;
			updateLayout();
		};
		const expandRow = make("div", "abp-expand");
		const expandButton = button("Expand", () => expand(expandButton));
		if (options.expand) { expandRow.append(expandButton); column.append(expandRow); }
		let mountedSvg: SVGSVGElement | undefined;
		let svgParent: ParentNode | null = null;
		let svgNext: ChildNode | null = null;
		placeSvg = next => {
			if (next !== mountedSvg) {
				// Replacements already in our figure (or supplied detached) inherit
				// its host position. External replacements retain their own position.
				if (!mountedSvg || (next.parentNode && next.parentNode !== figure)) {
					svgParent = next.parentNode;
					svgNext = next.nextSibling;
				}
				if (mountedSvg?.parentNode === figure) mountedSvg.remove();
				mountedSvg = next;
			}
			if (next.parentNode !== figure) figure.append(next);
		};
		removers.push(() => {
			if (!mountedSvg) return;
			if (svgParent) svgParent.insertBefore(mountedSvg, svgNext?.parentNode === svgParent ? svgNext : null);
			else mountedSvg.remove();
		});
		const panel = make("div", "abp-panel");
		panel.tabIndex = 0;
		const id = `ab-playback-${++mountId}`;
		panel.id = `${id}-panel`;
		let tabs: HTMLButtonElement[] = [];
		let tablist: HTMLDivElement | undefined;
		let tabRemovers: (() => void)[] = [];
		let trackRemovers: (() => void)[] = [];
		removers.push(() => { for (const remove of [...tabRemovers, ...trackRemovers]) remove(); });
		const choose = (index: number) => {
			if (!binding.canActivate()) return;
			player.select(index);
			if (!svg.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches) player.play();
		};
		listen(panel, "keydown", event => {
			const key = event as KeyboardEvent;
			if (key.target !== panel || panel.isContentEditable || key.altKey || key.ctrlKey || key.metaKey || key.shiftKey) return;
			if (key.key === " ") { event.preventDefault(); player.state.status === "playing" ? player.pause() : player.play(); }
			else if (key.key === "ArrowLeft") { event.preventDefault(); player.previous(); }
			else if (key.key === "ArrowRight") { event.preventDefault(); player.next(); }
		});
		const actions = make("div", "abp-actions");
		const previous = button("<", () => player.previous());
		previous.setAttribute("aria-label", "Previous");
		const toggle = button("Play", () => player.state.status === "playing" ? player.pause() : player.play(), "abp-toggle");
		const next = button(">", () => player.next());
		next.setAttribute("aria-label", "Next");
		const stop = button("Stop", close);
		const navigation = make("div", "abp-navigation");
		const rangeLabel = make("label", "abp-range", "Step");
		const range = make("input");
		range.type = "range";
		range.min = "-1";
		range.step = "1";
		listen(range, "input", () => player.seek(Number(range.value)));
		rangeLabel.append(range);
		navigation.append(rangeLabel);
		let tracks: { track: HTMLDivElement; segments: HTMLSpanElement[] }[] = [];
		actions.append(previous, toggle, next, stop, navigation);
		const stepLine = make("div", "abp-step");
		const counter = make("span", "abp-counter");
		counter.setAttribute("aria-hidden", "true");
		const actor = make("div", "abp-actor");
		const caption = make("div", "abp-caption");
		caption.tabIndex = 0;
		caption.setAttribute("role", "region");
		caption.setAttribute("aria-label", "Step caption");
		const status = make("div", "abp-status");
		status.setAttribute("role", "status");
		status.setAttribute("aria-live", "polite");
		status.setAttribute("aria-atomic", "true");
		stepLine.append(counter, actor, caption);
		panel.append(stepLine, actions);
		column.append(panel, status);
		let side = false;
		let lists: { slug: string; list: HTMLOListElement; rows: HTMLButtonElement[] }[] | undefined;
		let rowRemovers: (() => void)[] = [];
		removers.push(() => { for (const remove of rowRemovers) remove(); });
		const empty = make("div", "abp-empty", "No playable steps");
		function ensureLists() {
			if (!lists) refreshLists();
		}
		function refreshLists() {
			const active = (panel.getRootNode() as Document | ShadowRoot).activeElement;
			const focusedRow = lists?.flatMap(({ rows }) => rows).find(row => row === active);
			const oldLists = new Map(lists?.map(list => [list.slug, list]));
			for (const remove of rowRemovers) remove();
			rowRemovers = [];
			lists = timelines.map((timeline, scenario) => {
				const previous = oldLists.get(timeline.slug);
				oldLists.delete(timeline.slug);
				const list = previous?.list ?? make("ol", "abp-list");
				list.setAttribute("aria-label", `${timeline.name} steps`);
				const rows = timeline.steps.map((step, index) => {
					const row = previous?.rows[index] ?? make("button", "abp-row");
					row.type = "button";
					const item = row.parentElement ?? make("li");
					let current = true;
					const click = () => { if (current && live && !destroyed && player.state.scenario === scenario) player.seek(index); };
					row.addEventListener("click", click);
					rowRemovers.push(() => { current = false; row.removeEventListener("click", click); });
					const number = step.kind === "message" ? step.target.padStart(2, "0") : String(index + 1);
					row.textContent = "";
					row.append(make("span", "abp-number", number), make("span", "abp-who", step.actor), make("span", "abp-remark", step.caption));
					item.append(row);
					list.append(item);
					return row;
				});
				for (const row of previous?.rows.slice(rows.length) ?? []) row.parentElement?.remove();
				return { slug: timeline.slug, list, rows };
			});
			for (const { list } of oldLists.values()) list.remove();
			if (side) for (const { list } of lists) panel.append(list);
			if (focusedRow) (lists.some(({ rows }) => rows.includes(focusedRow)) ? focusedRow : panel).focus({ preventScroll: true });
		}
		function keepCurrentVisible() {
			if (!side) return;
			const row = lists?.[player.state.scenario]?.rows[player.state.step];
			if (!row) return;
			// scrollIntoView can scroll every ancestor, including the page. Change
			// only the column's own scroll position and never move keyboard focus.
			const bounds = column.getBoundingClientRect();
			const current = row.getBoundingClientRect();
			if (current.top < bounds.top) column.scrollTop += current.top - bounds.top;
			else if (current.bottom > bounds.bottom) column.scrollTop += Math.min(current.top - bounds.top, current.bottom - bounds.bottom);
		}
		let announced = "";
		synchronize = state => {
			const steps = timelines[state.scenario]?.steps ?? [];
			const step = steps[state.step];
			for (const [index, tab] of tabs.entries()) {
				tab.setAttribute("aria-selected", String(index === state.scenario));
				tab.tabIndex = index === state.scenario ? 0 : -1;
			}
			if (tabs.length) panel.setAttribute("aria-labelledby", tabs[state.scenario].id);
			toggle.textContent = state.status === "playing" ? "Pause" : state.status === "ended" ? "Replay" : "Play";
			for (const control of [previous, toggle, next, range]) control.disabled = steps.length === 0;
			range.max = String(steps.length - 1);
			range.value = String(state.step);
			range.setAttribute("aria-valuetext", step ? `Step ${state.step + 1} of ${steps.length}` : steps.length ? "Full figure" : "No playable steps");
			counter.textContent = step ? `${state.step + 1}/${steps.length}` : "";
			for (const [scenario, { track, segments }] of tracks.entries()) {
				track.classList.toggle("abp-inactive", scenario !== state.scenario);
				for (const [index, segment] of segments.entries()) {
					segment.classList.toggle("abp-current", scenario === state.scenario && index === state.step);
					segment.classList.toggle("abp-played", scenario === state.scenario && index < state.step);
				}
			}
			for (const [scenario, { list, rows }] of (lists ?? []).entries()) {
				list.hidden = scenario !== state.scenario;
				for (const [index, row] of rows.entries()) {
					const current = scenario === state.scenario && index === state.step;
					row.classList.toggle("abp-played", scenario === state.scenario && index < state.step);
					if (current) row.setAttribute("aria-current", "step"); else row.removeAttribute("aria-current");
				}
			}
			empty.hidden = steps.length !== 0;
			const position = `${state.scenario}:${state.step}`;
			if (announced !== position) {
				announced = position;
				actor.textContent = step?.actor ?? "";
				caption.textContent = steps.length ? step?.caption ?? "" : "No playable steps";
				caption.scrollLeft = 0;
				status.textContent = step ? [step.actor, step.caption].filter(Boolean).join(": ") : "";
				keepCurrentVisible();
			}
		};
		refresh = () => {
			const scheme = svg.classList.contains("ab-dark") ? "dark" : svg.classList.contains("ab-light") ? "light" : "auto";
			if (!root) return;
			for (const name of ["auto", "light", "dark"]) root.classList.toggle(`ab-${name}`, name === scheme);
			const active = (panel.getRootNode() as Document | ShadowRoot).activeElement;
			const focusedTab = tabs.find(tab => tab === active);
			const oldTabs = new Map(tabs.map(tab => [tab.dataset.slug ?? "", tab]));
			for (const remove of tabRemovers) remove();
			tabRemovers = [];
			tabs = [];
			if (timelines.length > 1) {
				if (!tablist) {
					tablist = make("div", "abp-tabs");
					tablist.setAttribute("role", "tablist");
					tablist.setAttribute("aria-label", "Scenarios");
					column.insertBefore(tablist, panel);
				}
				panel.setAttribute("role", "tabpanel");
				for (const [index, timeline] of timelines.entries()) {
					const tab = oldTabs.get(timeline.slug) ?? make("button");
					oldTabs.delete(timeline.slug);
					tab.type = "button"; tab.textContent = timeline.name;
					tab.dataset.slug = timeline.slug;
					tab.id = `${id}-tab-${index}`;
					tab.setAttribute("role", "tab");
					tab.setAttribute("aria-controls", panel.id);
					let current = true;
					const click = () => { if (current && live) choose(index); };
					const keydown = (event: Event) => {
						if (!current || !live) return;
						const key = (event as KeyboardEvent).key;
						let target: number;
						if (key === "ArrowLeft") target = (index + tabs.length - 1) % tabs.length;
						else if (key === "ArrowRight") target = (index + 1) % tabs.length;
						else if (key === "Home") target = 0;
						else if (key === "End") target = tabs.length - 1;
						else if (key === "Enter" || key === " ") target = index;
						else return;
						event.preventDefault(); tabs[target].focus(); choose(target);
					};
					tab.addEventListener("click", click); tab.addEventListener("keydown", keydown);
					tabRemovers.push(() => { current = false; tab.removeEventListener("click", click); tab.removeEventListener("keydown", keydown); });
					tabs.push(tab); tablist.append(tab);
				}
			} else {
				tablist?.remove(); tablist = undefined;
				panel.removeAttribute("role"); panel.removeAttribute("aria-labelledby");
			}
			for (const tab of oldTabs.values()) tab.remove();
			if (focusedTab) (tabs.includes(focusedTab) ? focusedTab : panel).focus({ preventScroll: true });
			for (const remove of trackRemovers) remove();
			trackRemovers = [];
			for (const { track } of tracks) track.remove();
			tracks = timelines.map((timeline, scenario) => {
				const track = make("div", "abp-segments");
				track.setAttribute("aria-hidden", "true");
				const segments = timeline.steps.map((_, index) => {
					const segment = make("span", "abp-segment");
					let current = true;
					const click = () => { if (current && live && player.state.scenario === scenario) player.seek(index); };
					segment.addEventListener("click", click);
					trackRemovers.push(() => { current = false; segment.removeEventListener("click", click); });
					track.append(segment); return segment;
				});
				navigation.append(track); return { track, segments };
			});
			if (lists) refreshLists();
			updateLayout(false);
			announced = "";
		};
		function updateLayout(sync = true) {
			if (!live || destroyed || !root) return;
			const viewBox = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
			const width = Number(svg.getAttribute("width")) || viewBox[2] || 0;
			const height = Number(svg.getAttribute("height")) || viewBox[3] || 0;
			root.style.setProperty("--abp-figure-width", `${width || 678}px`);
			const selected = options.layout ?? "auto";
			side = isOpen && !closeExpanded && (selected === "side" || (selected === "auto" && height > width && width > 0 && root.getBoundingClientRect().width - width >= 320));
			root.classList.toggle("abp-side", side);
			root.classList.toggle("abp-below", !side);
			if (side) {
				ensureLists();
				for (const { list } of lists ?? []) if (list.parentNode !== panel) panel.append(list);
				if (empty.parentNode !== panel) panel.append(empty);
			} else {
				const active = (panel.getRootNode() as Document | ShadowRoot).activeElement;
				const focusedRow = lists?.some(({ rows }) => rows.some(row => row === active));
				for (const { list } of lists ?? []) list.remove();
				empty.remove();
				if (focusedRow) panel.focus({ preventScroll: true });
			}
			if (sync) { synchronize(player.state); keepCurrentVisible(); }
		}
		openExpanded = () => expand();
		function expand(opener?: HTMLElement) {
			if (!live || destroyed || !root || closeExpanded) return;
			const expandedRoot = root;
			const captionScroll = caption.scrollLeft;
			const scope = expandedRoot.getRootNode() as Document | ShadowRoot;
			opener ??= (scope.activeElement ?? doc.activeElement) as HTMLElement | undefined;
			const dialog = make("dialog", "ab-playback abp-dialog");
			const content = make("div", "abp-content");
			const header = make("div", "abp-close");
			const close = make("button", "", "Close");
			close.type = "button"; close.autofocus = true;
			header.append(close);
			const place = doc.createComment("ablauf playback");
			expandedRoot.replaceWith(place);
			content.append(header, expandedRoot);
			dialog.append(content);
			container.append(dialog);
			expandedRoot.classList.toggle("abp-expanded", true);
			expandRow.hidden = true;
			figure.setAttribute("role", "region");
			figure.setAttribute("aria-label", "Figure");
			figure.tabIndex = 0;
			refreshExpanded = () => {
				dialog.setAttribute("aria-label", svg.getAttribute("aria-label") ?? "Figure");
				for (const name of ["auto", "light", "dark"]) dialog.classList.toggle(`ab-${name}`, expandedRoot.classList.contains(`ab-${name}`));
				figure.style.setProperty("--abp-width", `${svg.getAttribute("width")}px`);
				figure.style.setProperty("--abp-height", `${svg.getAttribute("height")}px`);
			};
			// Keep the same SVG, controls, player and timer. Resize callbacks use
			// the expanded below layout until the root returns to its placeholder.
			const finish = () => {
				if (!closeExpanded) return;
				const captionScroll = caption.scrollLeft;
				closeExpanded = undefined;
				refreshExpanded = () => {};
				close.removeEventListener("click", finish);
				dialog.removeEventListener("close", finish);
				dialog.removeEventListener("cancel", cancel);
				dialog.removeEventListener("pointerdown", pointerdown);
				dialog.removeEventListener("click", backdrop);
				dialog.removeEventListener("keydown", containFocus);
				if (dialog.open) dialog.close();
				place.replaceWith(expandedRoot);
				expandedRoot.classList.toggle("abp-expanded", false);
				expandRow.hidden = false;
				figure.removeAttribute("role"); figure.removeAttribute("aria-label"); figure.removeAttribute("tabindex");
				dialog.remove();
				binding.setExpanded(false);
				updateLayout();
				if (!suppressModalFocus) opener?.focus?.();
				caption.scrollLeft = captionScroll;
			};
			const cancel = (event: Event) => { event.preventDefault(); finish(); };
			let backdropPress = false;
			const pointerdown = (event: Event) => { backdropPress = event.target === dialog; };
			const backdrop = (event: Event) => { if (backdropPress && event.target === dialog) finish(); backdropPress = false; };
			const containFocus = (event: KeyboardEvent) => {
				if (event.key !== "Tab") return;
				const focusable = [close, figure, ...tabs.filter(tab => tab.tabIndex === 0), panel, caption,
					...[previous, toggle, next, stop, range].filter(el => !el.disabled)];
				const last = focusable[focusable.length - 1];
				const active = scope.activeElement ?? doc.activeElement;
				if (event.shiftKey && active === close) { event.preventDefault(); last.focus(); }
				else if (!event.shiftKey && active === last) { event.preventDefault(); close.focus(); }
			};
			closeExpanded = finish;
			refreshExpanded();
			updateLayout();
			close.addEventListener("click", finish);
			dialog.addEventListener("close", finish);
			dialog.addEventListener("cancel", cancel);
			dialog.addEventListener("pointerdown", pointerdown);
			dialog.addEventListener("click", backdrop);
			dialog.addEventListener("keydown", containFocus);
			binding.setExpanded(true);
			dialog.showModal();
			close.focus();
			// Browsers reset scroll offsets when a subtree is detached and moved.
			caption.scrollLeft = captionScroll;
		}
		const view = doc.defaultView;
		const Resize = view?.ResizeObserver;
		if (view && Resize) {
			// Observe the mount's available width, including when its container is a
			// shadow root. The SVG's natural dimensions stay fixed in both layouts.
			// Layout changes can resize the observed root. Apply them next frame,
			// outside observer delivery, to avoid ResizeObserver loop error events.
			let frame: number | undefined;
			const observer = new Resize(() => {
				if (!live || destroyed || frame !== undefined) return;
				frame = view.requestAnimationFrame(() => {
					frame = undefined;
					updateLayout();
				});
			});
			observer.observe(root);
			removers.push(() => {
				observer.disconnect();
				if (frame !== undefined) view.cancelAnimationFrame(frame);
			});
		} else if (view) {
			const resize = () => updateLayout();
			view.addEventListener("resize", resize);
			removers.push(() => view.removeEventListener("resize", resize));
		}

		container.append(style);
		if (svg.parentNode === container) container.insertBefore(root, svg); else container.append(root);
		placeSvg(svg);
		refresh();
		showControls();
		if (player.state.status === "idle") synchronize(player.state);
	}
}
