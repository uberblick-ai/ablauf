// Plays a timeline on a rendered SVG by setting classes on its parts: the
// current step's parts are `ab-on`, earlier ones `ab-done`, and the SVG is
// `ab-playing` so later parts fade. It draws no controls; the host does.

import type { TimelineStep } from "./play.ts";

export interface Player {
	/** The current step, or -1 before the first. */
	readonly index: number;
	readonly playing: boolean;
	play(): void;
	pause(): void;
	/** Shows one step, and keeps playing from there if playing. */
	seek(index: number): void;
	next(): void;
	previous(): void;
	/** Clears every state, leaving the full, unfaded figure. */
	reset(): void;
	destroy(): void;
}

export interface PlayerOptions {
	/** Called after every change of step or of playing. */
	onChange?: (player: Player) => void;
	/** Start over at the end instead of stopping on the last step. */
	loop?: boolean;
}

export function createPlayer(svg: Element, timeline: TimelineStep[], options: PlayerOptions = {}): Player {
	const parts = new Map<string, Element[]>();
	for (const el of svg.querySelectorAll("[data-ab-part]")) {
		const name = el.getAttribute("data-ab-part") ?? "";
		parts.set(name, [...(parts.get(name) ?? []), el]);
	}
	let index = -1;
	let playing = false;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const paint = () => {
		for (const list of parts.values()) for (const el of list) el.classList.remove("ab-on", "ab-done");
		svg.classList.toggle("ab-playing", index >= 0);
		for (let k = 0; k <= index; k++) {
			for (const name of timeline[k].parts) {
				for (const el of parts.get(name) ?? []) {
					el.classList.toggle("ab-on", k === index);
					el.classList.toggle("ab-done", k < index);
				}
			}
		}
	};
	const schedule = () => {
		clearTimeout(timer);
		if (!playing || index < 0) return;
		timer = setTimeout(() => {
			if (index + 1 < timeline.length) show(index + 1);
			else if (options.loop) show(0);
			else {
				playing = false;
				options.onChange?.(player);
			}
		}, timeline[index].ms);
	};
	const show = (i: number) => {
		index = Math.max(-1, Math.min(i, timeline.length - 1));
		paint();
		schedule();
		options.onChange?.(player);
	};
	const player: Player = {
		get index() {
			return index;
		},
		get playing() {
			return playing;
		},
		play() {
			if (!timeline.length) return;
			playing = true;
			// Playing from the end starts over.
			show(index < 0 || index >= timeline.length - 1 ? 0 : index);
		},
		pause() {
			playing = false;
			clearTimeout(timer);
			options.onChange?.(player);
		},
		seek: show,
		next: () => show(index + 1),
		previous: () => show(Math.max(index - 1, 0)),
		reset() {
			playing = false;
			show(-1);
		},
		destroy() {
			clearTimeout(timer);
			playing = false;
		},
	};
	return player;
}
