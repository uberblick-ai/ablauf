import type { Timeline } from "./play.ts";
import { createPlayer, type Player, type PlayerState } from "./player.ts";

export interface PlaybackMount {
	player: Player;
	destroy(): void;
}

// Defaults belong to the controls too: SVG-internal variables cannot reach a
// sibling. Keep every selector under the mount class, including scheme rules.
const STYLE = `
.ab-playback{--abp-bg:var(--ab-bg,#ffffff);--abp-ink:var(--ab-ink,#17202c);--abp-muted:var(--ab-muted,#5a6575);--abp-line:var(--ab-line,#d3d9e2);--abp-play:var(--ab-play,#2869b8);color-scheme:light;color:var(--abp-ink);background:var(--abp-bg);font:14px/1.5 system-ui,sans-serif;padding:12px 0;overflow-wrap:anywhere}
.ab-playback.ab-dark{--abp-bg:var(--ab-bg,#171c24);--abp-ink:var(--ab-ink,#e5e9ef);--abp-muted:var(--ab-muted,#98a2b0);--abp-line:var(--ab-line,#2c3440);--abp-play:var(--ab-play,#88baff);color-scheme:dark}
@media (prefers-color-scheme:dark){.ab-playback.ab-auto{--abp-bg:var(--ab-bg,#171c24);--abp-ink:var(--ab-ink,#e5e9ef);--abp-muted:var(--ab-muted,#98a2b0);--abp-line:var(--ab-line,#2c3440);--abp-play:var(--ab-play,#88baff);color-scheme:dark}}
.ab-playback .abp-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;border-bottom:1px solid var(--abp-line)}
.ab-playback button{font:inherit;color:inherit;background:var(--abp-bg);border:1px solid var(--abp-line);border-radius:4px;padding:5px 9px;cursor:pointer}
.ab-playback button[aria-selected="true"]{border-color:var(--abp-play);box-shadow:inset 0 -2px var(--abp-play)}
.ab-playback .abp-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
.ab-playback .abp-toggle{min-width:5em}
.ab-playback .abp-range{display:flex;align-items:center;gap:8px;flex:1;min-width:140px;white-space:nowrap}
.ab-playback input{accent-color:var(--abp-play);min-width:0;width:100%}
.ab-playback button:disabled{color:var(--abp-muted);cursor:default}
.ab-playback button:focus-visible,.ab-playback input:focus-visible,.ab-playback .abp-panel:focus-visible{outline:2px solid var(--abp-play);outline-offset:3px}
.ab-playback .abp-actor{font-weight:600;margin-top:10px}
.ab-playback .abp-caption{color:var(--abp-muted);white-space:pre-wrap}
.ab-playback .abp-status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
`;

let mountId = 0;

/** Mount controls beside an inline SVG. Both destroy entry points tear down the mount. */
export function mountPlayback(
	container: HTMLElement | ShadowRoot,
	svg: SVGSVGElement,
	timelines: Timeline[],
	options: { loop?: boolean } = {},
): PlaybackMount {
	const doc = container.ownerDocument;
	const removers: (() => void)[] = [];
	let root: HTMLDivElement | undefined;
	let style: HTMLStyleElement | undefined;
	let synchronize: (state: PlayerState) => void = () => {};
	const player = createPlayer(svg, timelines, { loop: options.loop, onChange: state => synchronize(state) });
	const destroyPlayer = player.destroy;
	let destroyed = false;
	function destroy() {
		if (destroyed) return;
		destroyed = true;
		destroyPlayer();
		for (const remove of removers) remove();
		root?.remove();
		style?.remove();
	}
	player.destroy = destroy;
	if (!timelines.length) return { player, destroy };

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
	const scheme = svg.classList.contains("ab-dark") ? "dark" : svg.classList.contains("ab-light") ? "light" : "auto";
	root = make("div", `ab-playback ab-${scheme}`);
	style = make("style", "", STYLE);
	const panel = make("div", "abp-panel");
	const tabs: HTMLButtonElement[] = [];
	if (timelines.length > 1) {
		const id = `ab-playback-${++mountId}`;
		const tablist = make("div", "abp-tabs");
		tablist.setAttribute("role", "tablist");
		tablist.setAttribute("aria-label", "Scenarios");
		panel.id = `${id}-panel`;
		panel.setAttribute("role", "tabpanel");
		panel.tabIndex = 0;
		for (const [index, timeline] of timelines.entries()) {
			const tab = button(timeline.name, () => player.select(index));
			tab.id = `${id}-tab-${index}`;
			tab.setAttribute("role", "tab");
			tab.setAttribute("aria-controls", panel.id);
			listen(tab, "keydown", event => {
				const key = (event as KeyboardEvent).key;
				let target: number;
				if (key === "ArrowLeft") target = (index + tabs.length - 1) % tabs.length;
				else if (key === "ArrowRight") target = (index + 1) % tabs.length;
				else if (key === "Home") target = 0;
				else if (key === "End") target = tabs.length - 1;
				else if (key === "Enter" || key === " ") target = index;
				else return;
				event.preventDefault();
				tabs[target].focus();
				player.select(target);
			});
			tabs.push(tab);
			tablist.append(tab);
		}
		root.append(tablist);
	}
	const actions = make("div", "abp-actions");
	const previous = button("Previous", () => player.previous());
	const toggle = button("Play", () => player.state.status === "playing" ? player.pause() : player.play(), "abp-toggle");
	const next = button("Next", () => player.next());
	const rangeLabel = make("label", "abp-range", "Step");
	const range = make("input");
	range.type = "range";
	range.min = "-1";
	range.step = "1";
	listen(range, "input", () => player.seek(Number(range.value)));
	rangeLabel.append(range);
	actions.append(previous, toggle, next, rangeLabel);
	const actor = make("div", "abp-actor");
	const caption = make("div", "abp-caption");
	const status = make("div", "abp-status");
	status.setAttribute("role", "status");
	status.setAttribute("aria-live", "polite");
	status.setAttribute("aria-atomic", "true");
	panel.append(actions, actor, caption);
	root.append(panel, status);
	let announced = "";
	synchronize = state => {
		const steps = timelines[state.scenario].steps;
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
		actor.textContent = step?.actor ?? "";
		caption.textContent = steps.length ? step?.caption ?? "" : "No playable steps";
		const position = `${state.scenario}:${state.step}`;
		if (announced !== position) {
			announced = position;
			status.textContent = step ? [step.actor, step.caption].filter(Boolean).join(": ") : "";
		}
	};
	synchronize(player.state);
	container.append(style, root);
	return { player, destroy };
}
