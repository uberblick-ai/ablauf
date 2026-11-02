import type { Timeline } from "./play.ts";
import { createPlayerBinding, type Player, type PlayerState } from "./player.ts";

export interface PlaybackMount {
	player: Player;
	update(svg: SVGSVGElement, timelines: Timeline[]): void;
	destroy(): void;
}

// Defaults belong to the controls too: SVG-internal variables cannot reach a
// sibling. Keep every selector under the mount class, including scheme rules.
const STYLE = `
.ab-playback{--abp-bg:var(--ab-bg,#ffffff);--abp-ink:var(--ab-ink,#17202c);--abp-muted:var(--ab-muted,#5a6575);--abp-line:var(--ab-line,#d3d9e2);--abp-play:var(--ab-play,#0a7a60);color-scheme:light;color:var(--abp-ink);background:var(--abp-bg);font:14px/1.5 system-ui,sans-serif;padding:0 0 12px;overflow-wrap:anywhere}
.ab-playback.ab-dark{--abp-bg:var(--ab-bg,#171c24);--abp-ink:var(--ab-ink,#e5e9ef);--abp-muted:var(--ab-muted,#98a2b0);--abp-line:var(--ab-line,#2c3440);--abp-play:var(--ab-play,#6ff0cf);color-scheme:dark}
@media (prefers-color-scheme:dark){.ab-playback.ab-auto{--abp-bg:var(--ab-bg,#171c24);--abp-ink:var(--ab-ink,#e5e9ef);--abp-muted:var(--ab-muted,#98a2b0);--abp-line:var(--ab-line,#2c3440);--abp-play:var(--ab-play,#6ff0cf);color-scheme:dark}}
.ab-playback button{font:12px/1 ui-monospace,monospace;color:var(--abp-ink);background:var(--abp-bg);border:1px solid var(--abp-line);border-radius:8px;height:30px;padding:0 10px;cursor:pointer}
.ab-playback .abp-tabs{display:flex;overflow-x:auto;border-bottom:1px solid var(--abp-line)}
.ab-playback .abp-tabs button{flex:none;font-weight:500;color:var(--abp-muted);background:none;border:0;border-bottom:2px solid transparent;border-radius:0;height:auto;padding:11px 16px;white-space:nowrap}
.ab-playback .abp-tabs button:hover{color:var(--abp-ink)}
.ab-playback .abp-tabs button[aria-selected="true"]{color:var(--abp-play);border-bottom-color:var(--abp-play);text-shadow:0 0 var(--ab-play-glow,10px) color-mix(in srgb,var(--abp-play) 50%,transparent)}
.ab-playback .abp-step{display:grid;grid-template-columns:54px minmax(0,1fr);grid-template-rows:20px auto;column-gap:14px;row-gap:2px;box-sizing:border-box;min-height:64px;padding:12px 12px 4px;align-content:start}
.ab-playback .abp-counter{grid-row:1/3;align-self:start;box-sizing:border-box;font:500 11px/20px ui-monospace,monospace;color:var(--abp-muted);border:1px solid var(--abp-line);border-radius:999px;padding:0 8px;text-align:center}
.ab-playback .abp-counter:empty{visibility:hidden}
.ab-playback .abp-actor{grid-column:2;font:500 13px/20px ui-monospace,monospace;color:var(--abp-play);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ab-playback .abp-caption{grid-column:2;font-size:16px;line-height:1.45;min-height:1.45em;white-space:pre-wrap}
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
.ab-playback button:focus-visible,.ab-playback .abp-navigation:focus-within,.ab-playback .abp-panel:focus-visible{outline:2px solid var(--abp-play);outline-offset:3px}
.ab-playback .abp-tabs button:focus-visible{outline-offset:-3px}
.ab-playback .abp-range,.ab-playback .abp-status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
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
	options: { loop?: boolean; autoplay?: boolean; pauseWhenOffscreen?: boolean } = {},
): PlaybackMount {
	const doc = container.ownerDocument;
	const removers: (() => void)[] = [];
	let root: HTMLDivElement | undefined;
	let style: HTMLStyleElement | undefined;
	let synchronize: (state: PlayerState) => void = () => {};
	const binding = createPlayerBinding(svg, timelines, { ...options, synchronize: state => synchronize(state) });
	const player = binding.player;
	let refresh = () => {};
	const destroyPlayer = player.destroy;
	let destroyed = false;
	function destroy() {
		if (destroyed) return;
		destroyed = true;
		destroyPlayer();
		for (const remove of removers.splice(0)) remove();
		root?.remove();
		style?.remove();
	}
	player.destroy = destroy;
	function update(nextSvg: SVGSVGElement, nextTimelines: Timeline[]) {
		if (destroyed) return;
		svg = nextSvg;
		timelines = nextTimelines;
		if (!timelines.length) {
			for (const remove of removers.splice(0)) remove();
			root?.remove(); style?.remove(); root = undefined; style = undefined;
			synchronize = () => {};
		} else if (!root) buildControls();
		else refresh();
		binding.update(svg, timelines);
	}
	if (timelines.length) buildControls();
	return { player, update, destroy };

	function buildControls() {
		const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") => {
			const el = doc.createElement(tag);
			el.className = className;
			el.textContent = text;
			return el;
		};
		function listen(el: HTMLElement, type: string, listener: (event: Event) => void) {
			el.addEventListener(type, listener);
			removers.push(() => el.removeEventListener(type, listener));
		}
		function button(text: string, action: () => void, className = "") {
			const el = make("button", className, text);
			el.type = "button";
			listen(el, "click", action);
			return el;
		}
		root = make("div", "ab-playback");
		style = make("style", "", STYLE);
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
			if (!binding.canPlay()) return;
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
		actions.append(previous, toggle, next, navigation);
		const stepLine = make("div", "abp-step");
		const counter = make("span", "abp-counter");
		counter.setAttribute("aria-hidden", "true");
		const actor = make("div", "abp-actor");
		const caption = make("div", "abp-caption");
		const status = make("div", "abp-status");
		status.setAttribute("role", "status");
		status.setAttribute("aria-live", "polite");
		status.setAttribute("aria-atomic", "true");
		stepLine.append(counter, actor, caption);
		panel.append(stepLine, actions);
		root.append(panel, status);
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
			actor.textContent = step?.actor ?? "";
			caption.textContent = steps.length ? step?.caption ?? "" : "No playable steps";
			const position = `${state.scenario}:${state.step}`;
			if (announced !== position) {
				announced = position;
				status.textContent = step ? [step.actor, step.caption].filter(Boolean).join(": ") : "";
			}
		};
		refresh = () => {
			const scheme = svg.classList.contains("ab-dark") ? "dark" : svg.classList.contains("ab-light") ? "light" : "auto";
			if (!root) return;
			root.className = `ab-playback ab-${scheme}`;
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
					root.insertBefore(tablist, panel);
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
					const click = () => choose(index);
					const keydown = (event: Event) => {
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
					tabRemovers.push(() => { tab.removeEventListener("click", click); tab.removeEventListener("keydown", keydown); });
					tabs.push(tab); tablist.append(tab);
				}
			} else {
				tablist?.remove(); tablist = undefined;
				panel.removeAttribute("role"); panel.removeAttribute("aria-labelledby");
			}
			for (const tab of oldTabs.values()) tab.remove();
			if (focusedTab) (tabs.includes(focusedTab) ? focusedTab : panel).focus();
			for (const remove of trackRemovers) remove();
			trackRemovers = [];
			for (const { track } of tracks) track.remove();
			tracks = timelines.map((timeline, scenario) => {
				const track = make("div", "abp-segments");
				track.setAttribute("aria-hidden", "true");
				const segments = timeline.steps.map((_, index) => {
					const segment = make("span", "abp-segment");
					const click = () => { if (player.state.scenario === scenario) player.seek(index); };
					segment.addEventListener("click", click);
					trackRemovers.push(() => segment.removeEventListener("click", click));
					track.append(segment); return segment;
				});
				navigation.append(track); return { track, segments };
			});
			announced = "";
		};
		container.append(style, root);
		refresh();
		if (player.state.status === "idle") synchronize(player.state);
	}
}
