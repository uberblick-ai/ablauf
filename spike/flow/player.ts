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
	select(scenario: number | string): void;
	subscribe(fn: (state: PlayerState) => void): () => void;
	destroy(): void;
}

interface PlayerOptions {
	loop?: boolean;
	pauseWhenOffscreen?: boolean;
	onChange?: (state: PlayerState) => void;
}

/** Play resolved parts on one inline SVG. Nothing starts until play() is called. */
export function createPlayer(svg: SVGSVGElement, timelines: Timeline[], options: PlayerOptions = {}): Player {
	return createPlayerBinding(svg, timelines, options).player;
}

// Internal binding API; the package entry exports only createPlayer.
export function createPlayerBinding(
	svg: SVGSVGElement,
	timelines: Timeline[],
	options: PlayerOptions & { autoplay?: boolean; synchronize?: (state: PlayerState) => void } = {},
) {
	let state: PlayerState = Object.freeze({ scenario: 0, step: -1, status: "idle" });
	let destroyed = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let timerVersion = 0;
	let bindingVersion = 0;
	let preference: MediaQueryList | undefined;
	let motionListener: ((event: MediaQueryListEvent) => void) | undefined;
	let observer: IntersectionObserver | undefined;
	let removeVisibility = () => {};
	let offscreen = false;
	let initialAutoplay = !!options.autoplay;
	let pausedByView = false;
	const listeners = new Set<(state: PlayerState) => void>();
	const notifications: { state: PlayerState; listeners: ((state: PlayerState) => void)[] }[] = [];
	let notifying = false;
	const steps = () => timelines[state.scenario]?.steps ?? [];
	const lifecycleReady = () => svg.isConnected && !svg.ownerDocument.hidden && svg.ownerDocument.visibilityState !== "hidden";
	const canPlay = () => !destroyed && lifecycleReady() && !offscreen;

	function paint(clear = false) {
		svg.classList.toggle("ab-playing", !clear && state.status === "playing");
		svg.classList.toggle("ab-in-progress", !clear && state.step >= 0);
		const current = new Set(clear ? [] : steps()[state.step]?.parts);
		const played = new Set(clear ? [] : steps().slice(0, Math.max(0, state.step)).flatMap(step => step.parts));
		for (const wrapper of svg.querySelectorAll("[data-ab-part]")) {
			const part = wrapper.getAttribute("data-ab-part") ?? "";
			wrapper.classList.toggle("ab-current", current.has(part));
			wrapper.classList.toggle("ab-played", !current.has(part) && played.has(part));
		}
	}
	function unobserveMotion() {
		if (motionListener) preference?.removeEventListener("change", motionListener);
		preference = undefined; motionListener = undefined;
	}
	function cancel() {
		++timerVersion;
		clearTimeout(timer);
		timer = undefined;
		unobserveMotion();
	}
	function manual() { initialAutoplay = false; pausedByView = false; }
	function change(scenario: number, step: number, status: PlayerState["status"], refresh = false) {
		const changed = state.scenario !== scenario || state.step !== step || state.status !== status;
		if (changed) state = Object.freeze({ scenario, step, status });
		if (changed || refresh) { paint(); options.synchronize?.(state); }
		// Arm before notifying so a listener can pause, navigate or destroy safely.
		if (status === "playing") {
			const version = ++timerVersion;
			timer = setTimeout(() => { if (version === timerVersion) advance(); }, steps()[step].ms);
		}
		if (!changed) return;
		notifications.push({ state, listeners: [...listeners] });
		if (notifying) return;
		notifying = true;
		try {
			while (notifications.length && !destroyed) {
				const next = notifications.shift();
				if (!next) break;
				options.onChange?.(next.state);
				for (const listener of next.listeners) if (!destroyed && listeners.has(listener)) listener(next.state);
			}
		} finally { notifying = false; }
	}
	function pause() {
		if (state.status !== "playing") return;
		cancel();
		change(state.scenario, state.step, "paused");
	}
	function lifecyclePause() { manual(); pause(); }
	function advance() {
		timer = undefined;
		if (destroyed || state.status !== "playing") return;
		if (!lifecycleReady()) { lifecyclePause(); return; }
		if (offscreen) { pause(); return; }
		if (state.step < steps().length - 1) change(state.scenario, state.step + 1, "playing");
		else if (options.loop) change(state.scenario, 0, "playing");
		else { unobserveMotion(); change(state.scenario, state.step, "ended"); }
	}
	function reset() { manual(); cancel(); change(state.scenario, -1, "idle"); }
	function motionChanged(event: MediaQueryListEvent) {
		if (!destroyed && state.status === "playing" && event.matches) reset();
	}
	function seek(step: number) {
		if (destroyed || !Number.isInteger(step)) return;
		manual(); cancel();
		change(state.scenario, Math.max(-1, Math.min(step, steps().length - 1)), "paused");
	}
	function bind() {
		const version = ++bindingVersion;
		const doc = svg.ownerDocument;
		const visibility = () => {
			if (!destroyed && version === bindingVersion && !lifecycleReady()) lifecyclePause();
		};
		doc.addEventListener("visibilitychange", visibility);
		removeVisibility = () => doc.removeEventListener("visibilitychange", visibility);
		const Observer = doc.defaultView?.IntersectionObserver;
		if (!Observer || (!options.autoplay && !options.pauseWhenOffscreen)) return;
		observer = new Observer(entries => {
			if (destroyed || version !== bindingVersion) return;
			for (const entry of entries) {
				if (entry.target !== svg) continue;
				offscreen = !entry.isIntersecting;
				if (!lifecycleReady()) { lifecyclePause(); continue; }
				if (offscreen) {
					if (state.status === "playing") { pausedByView = !!options.autoplay; pause(); }
					continue;
				}
				if (options.autoplay && entry.intersectionRatio >= 0.5 && (initialAutoplay || pausedByView)) {
					if (doc.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches) continue;
					player.play();
				}
			}
		}, { threshold: [0, 0.5] });
		observer.observe(svg);
	}
	function unbind() { ++bindingVersion; removeVisibility(); observer?.disconnect(); observer = undefined; }
	const player: Player = {
		get state() { return state; },
		play() {
			if (!canPlay()) return;
			manual();
			const media = svg.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)");
			if (media?.matches || !steps().length) { reset(); return; }
			if (state.status === "playing") return;
			cancel(); preference = media;
			const listener = (event: MediaQueryListEvent) => {
				if (motionListener === listener) motionChanged(event);
			};
			motionListener = listener;
			preference?.addEventListener("change", listener);
			change(state.scenario, state.status === "paused" && state.step >= 0 ? state.step : 0, "playing");
		},
		pause() { if (!destroyed) { manual(); pause(); } },
		next() { seek(state.step + 1); },
		previous() { seek(state.step - 1); },
		seek,
		select(scenario) {
			const index = typeof scenario === "string" ? timelines.findIndex(timeline => timeline.slug === scenario) : scenario;
			if (destroyed || !Number.isInteger(index) || index < 0 || index >= timelines.length) return;
			manual(); cancel();
			change(index, timelines[index].steps.length ? 0 : -1, "paused");
		},
		subscribe(fn) {
			if (destroyed) return () => {};
			const listener = (snapshot: PlayerState) => fn(snapshot);
			listeners.add(listener);
			return () => { listeners.delete(listener); };
		},
		destroy() {
			if (destroyed) return;
			destroyed = true; cancel(); unbind(); listeners.clear(); notifications.length = 0;
			state = Object.freeze({ scenario: state.scenario, step: -1, status: "idle" });
			paint();
		},
	};
	paint(); bind();
	return {
		player, canPlay,
		update(nextSvg: SVGSVGElement, nextTimelines: Timeline[]) {
			if (destroyed) return;
			const slug = timelines[state.scenario]?.slug;
			manual(); cancel(); unbind(); paint(true);
			svg = nextSvg; timelines = nextTimelines; offscreen = false;
			const scenario = Math.max(0, timelines.findIndex(timeline => timeline.slug === slug));
			bind();
			change(scenario, timelines[scenario]?.steps.length ? 0 : -1, "paused", true);
		},
	};
}
