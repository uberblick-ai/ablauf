import type { Timeline } from "./play.ts";

export interface PlayerState {
	scenario: number;
	step: number;
	status: "idle" | "paused" | "playing" | "ended";
}

export interface Player {
	readonly state: PlayerState;
	play(): void;
	pause(): void;
	next(): void;
	previous(): void;
	seek(step: number): void;
	select(scenario: number): void;
	destroy(): void;
}

/** Play resolved parts on one inline SVG. Nothing starts until play() is called. */
export function createPlayer(
	svg: SVGSVGElement,
	timelines: Timeline[],
	options: { loop?: boolean; onChange?: (state: PlayerState) => void } = {},
): Player {
	let state: PlayerState = Object.freeze({ scenario: 0, step: -1, status: "idle" });
	let destroyed = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let preference: MediaQueryList | undefined;
	const steps = () => timelines[state.scenario]?.steps ?? [];

	function paint() {
		svg.classList.toggle("ab-in-progress", state.step >= 0);
		const current = new Set(steps()[state.step]?.parts);
		const played = new Set(steps().slice(0, Math.max(0, state.step)).flatMap(step => step.parts));
		for (const wrapper of svg.querySelectorAll("[data-ab-part]")) {
			const part = wrapper.getAttribute("data-ab-part") ?? "";
			wrapper.classList.toggle("ab-current", current.has(part));
			wrapper.classList.toggle("ab-played", !current.has(part) && played.has(part));
		}
	}

	function unobserve() {
		preference?.removeEventListener("change", motionChanged);
		preference = undefined;
	}

	function cancel() {
		clearTimeout(timer);
		timer = undefined;
		unobserve();
	}

	function change(scenario: number, step: number, status: PlayerState["status"]) {
		const changed = state.scenario !== scenario || state.step !== step || state.status !== status;
		if (changed) {
			state = Object.freeze({ scenario, step, status });
			paint();
		}
		// Arm before notifying so a callback can pause, navigate or destroy safely.
		if (status === "playing") timer = setTimeout(advance, steps()[step].ms);
		if (changed) options.onChange?.(state);
	}

	function advance() {
		timer = undefined;
		if (destroyed || state.status !== "playing") return;
		if (state.step < steps().length - 1) change(state.scenario, state.step + 1, "playing");
		else if (options.loop) change(state.scenario, 0, "playing");
		else {
			unobserve();
			change(state.scenario, state.step, "ended");
		}
	}

	function reset() {
		cancel();
		change(state.scenario, -1, "idle");
	}

	function motionChanged(event: MediaQueryListEvent) {
		if (!destroyed && state.status === "playing" && event.matches) reset();
	}

	function seek(step: number) {
		if (destroyed || !Number.isInteger(step)) return;
		cancel();
		change(state.scenario, Math.max(-1, Math.min(step, steps().length - 1)), "paused");
	}

	paint();
	return {
		get state() { return state; },
		play() {
			if (destroyed) return;
			const view = svg.ownerDocument.defaultView;
			const media = view?.matchMedia?.("(prefers-reduced-motion: reduce)");
			if (media?.matches || !steps().length) {
				reset();
				return;
			}
			if (state.status === "playing") return;
			cancel();
			preference = media;
			preference?.addEventListener("change", motionChanged);
			const step = state.status === "paused" && state.step >= 0 ? state.step : 0;
			change(state.scenario, step, "playing");
		},
		pause() {
			if (destroyed || state.status !== "playing") return;
			cancel();
			change(state.scenario, state.step, "paused");
		},
		next() { seek(state.step + 1); },
		previous() { seek(state.step - 1); },
		seek,
		select(scenario) {
			if (destroyed || !Number.isInteger(scenario) || scenario < 0 || scenario >= timelines.length) return;
			cancel();
			change(scenario, timelines[scenario].steps.length ? 0 : -1, "paused");
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			cancel();
			state = Object.freeze({ scenario: state.scenario, step: -1, status: "idle" });
			paint();
		},
	};
}
