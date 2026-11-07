// Browser entry; importing it does not access browser globals.

/** A host button in the viewer toolbar. The label is plain text, never HTML. */
export interface ViewerAction {
	label: string;
	onClick(viewer: Viewer): void;
}

export interface ViewerOptions {
	/** "auto" (default) opens at 100% when the figure fits, otherwise at Fit. */
	initialZoom?: "auto" | "fit";
	/** When supplied, even empty, a Copy button copies exactly this string. */
	source?: string;
	actions?: ViewerAction[];
	/** Called once, after cleanup, however the viewer closes. */
	onClose?(): void;
}

export interface Viewer {
	/** Current zoom as a ratio of natural size: 1 is 100%. */
	readonly zoom: number;
	readonly closed: boolean;
	close(): void;
}

// Internal: what a viewer moves into its dialog and zooms.
export interface ViewerHosting {
	svg(): SVGSVGElement;
	/** Swapped for a placeholder while open, then moved into the dialog. */
	content: HTMLElement;
	/** The scrolling drawing region that holds the SVG. */
	canvas: HTMLElement;
	/** Where the dialog goes; by default beside the placeholder. */
	container?: Node;
	opener?: HTMLElement;
	/** Focusable elements after the drawing region, for focus containment. */
	focusables?(): HTMLElement[];
	/** Runs as closing starts, before anything moves. */
	leaving?(): void;
	/** Runs after the content moves in or out of the dialog. */
	moved?(open: boolean): void;
}

export interface HostedViewer extends Viewer {
	/** Re-reads the hosted SVG's size, label and scheme after a rebind. */
	refresh(): void;
}

const MIN = 0.25;
const MAX = 4;
const STEP = 0.25;

// Colours follow the --ab-* host overrides with the same fallbacks as playback.
const STYLE = `@layer ablauf-viewer{
.ab-viewer{--abv-bg:var(--ab-bg,light-dark(#ffffff,#171c24));--abv-ink:var(--ab-ink,light-dark(#17202c,#e5e9ef));--abv-muted:var(--ab-muted,light-dark(#5a6575,#98a2b0));--abv-line:var(--ab-line,light-dark(#d3d9e2,#2c3440));--abv-play:var(--ab-play,light-dark(#0a7a60,#6ff0cf));color-scheme:inherit;box-sizing:border-box;position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;border:0;padding:0;overflow:hidden;color:var(--abv-ink);background:var(--abv-bg);font:14px/1.5 var(--ab-font-text,system-ui,sans-serif)}
.ab-viewer.ab-light{color-scheme:light}
.ab-viewer.ab-dark{color-scheme:dark}
.ab-viewer[open]{display:flex;flex-direction:column}
.ab-viewer::backdrop{background:var(--abv-bg)}
.ab-viewer .abv-toolbar{flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:4px 8px;border-bottom:1px solid var(--abv-line)}
.ab-viewer .abv-toolbar button{box-sizing:border-box;min-width:44px;min-height:44px;padding:0 12px;font:13px/1 var(--ab-font-mono,ui-monospace,monospace);color:var(--abv-ink);background:var(--abv-bg);border:1px solid var(--abv-line);border-radius:8px;cursor:pointer}
.ab-viewer .abv-toolbar button:disabled{color:var(--abv-muted);cursor:default}
.ab-viewer button:focus-visible,.ab-viewer .abv-canvas:focus-visible{outline:2px solid var(--abv-play);outline-offset:-2px}
.ab-viewer .abv-zoom{min-width:4.5ch;text-align:center;font:13px/1 var(--ab-font-mono,ui-monospace,monospace);font-variant-numeric:tabular-nums}
.ab-viewer .abv-status{color:var(--abv-muted);font-size:13px}
.ab-viewer .abv-gap{flex:1}
.ab-viewer .abv-canvas{display:flex;flex:1;min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain;touch-action:none;cursor:grab}
.ab-viewer .abv-canvas.abv-dragging{cursor:grabbing}
.ab-viewer .abv-canvas>svg{flex:none;display:block;margin:auto;width:var(--abv-width)!important;height:var(--abv-height)!important;max-width:none!important;max-height:none!important}
}
`;

const viewers = new Map<SVGSVGElement, HostedViewer>();
let locks = 0;
let pageOverflow = "";

/** The open viewer for an SVG, from either entry point. */
export function viewerFor(svg: SVGSVGElement): HostedViewer | undefined {
	return viewers.get(svg);
}

/**
 * Open a full-window, zoomable view of a rendered SVG. The SVG moves into a modal
 * dialog and returns to its place on close. Opening an SVG that is already open
 * returns its existing handle.
 */
export function openViewer(svg: SVGSVGElement, options: ViewerOptions = {}): Viewer {
	const open = viewers.get(svg);
	if (open) return open;
	const canvas = svg.ownerDocument.createElement("div");
	return hostViewer({ svg: () => svg, content: canvas, canvas }, options, svg);
}

/** Internal: open a viewer around host content. `anchor` is swapped out while open. */
export function hostViewer(hosting: ViewerHosting, options: ViewerOptions, anchor: Element = hosting.content): HostedViewer {
	const { content, canvas } = hosting;
	let svg = hosting.svg();
	const doc = svg.ownerDocument;
	const view = doc.defaultView;
	const scope = (anchor.getRootNode?.() ?? doc) as Document | ShadowRoot;
	const opener = hosting.opener ?? ((scope.activeElement ?? doc.activeElement) as HTMLElement | null) ?? undefined;
	const removers: (() => void)[] = [];
	const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") => {
		const el = doc.createElement(tag);
		el.className = className;
		el.textContent = text;
		return el;
	};
	function listen(el: EventTarget, type: string, listener: (event: Event) => void) {
		const guarded = (event: Event) => { if (!closed) listener(event); };
		// Ctrl/Cmd + wheel must be able to cancel the browser's page zoom.
		el.addEventListener(type, guarded, type === "wheel" ? { passive: false } : undefined);
		removers.push(() => el.removeEventListener(type, guarded));
	}
	function button(text: string, action: () => void, label?: string) {
		const el = make("button", "", text);
		el.type = "button";
		if (label) el.setAttribute("aria-label", label);
		listen(el, "click", action);
		return el;
	}

	let closed = false;
	let zoom = 1;
	let fitting = false;
	const handle: HostedViewer = {
		get zoom() { return zoom; },
		get closed() { return closed; },
		close: () => finish(),
		refresh: () => refresh(),
	};
	const dialog = make("dialog", "ab-viewer");
	const style = make("style", "", STYLE);
	const toolbar = make("div", "abv-toolbar");
	const close = button("Close", () => finish());
	close.autofocus = true;
	const percent = make("span", "abv-zoom");
	const minus = button("−", () => zoomTo(zoom - STEP), "Zoom out");
	const plus = button("+", () => zoomTo(zoom + STEP), "Zoom in");
	const fit = button("Fit", () => fitView(), "Fit to window");
	const status = make("span", "abv-status");
	status.setAttribute("role", "status");
	status.setAttribute("aria-live", "polite");
	const tools: HTMLButtonElement[] = [close, minus, plus, fit];
	toolbar.append(close, make("span", "abv-gap"), minus, percent, plus, fit);
	if (options.source !== undefined) {
		const source = options.source;
		const copy = button("Copy", async () => {
			let copied = false;
			try {
				const clipboard = view?.navigator?.clipboard;
				if (clipboard) { await clipboard.writeText(source); copied = true; }
			} catch {}
			if (!closed) status.textContent = copied ? "Copied source" : "Copy failed";
		}, "Copy source");
		tools.push(copy);
		toolbar.append(copy);
	}
	for (const action of options.actions ?? []) {
		const el = button(action.label, () => action.onClick(handle));
		tools.push(el);
		toolbar.append(el);
	}
	toolbar.append(status);
	canvas.classList.toggle("abv-canvas", true);
	canvas.setAttribute("role", "region");
	canvas.setAttribute("aria-label", "Figure");
	canvas.tabIndex = 0;

	const place = doc.createComment("ablauf viewer");
	anchor.replaceWith(place);
	if (anchor !== content) canvas.append(anchor);
	dialog.append(style, toolbar, content);
	const parent = hosting.container ?? place.parentNode ?? doc.body;
	parent.insertBefore(dialog, hosting.container || !place.parentNode ? null : place.nextSibling);
	viewers.set(svg, handle);
	hosting.moved?.(true);

	function natural(): [number, number] {
		const box = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
		return [Number(svg.getAttribute("width")) || box[2] || 300, Number(svg.getAttribute("height")) || box[3] || 150];
	}
	const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
	// Zoom around a point of the drawing region, in its client coordinates.
	function zoomTo(next: number, x = canvas.clientWidth / 2, y = canvas.clientHeight / 2, keepFit = false) {
		const [width, height] = natural();
		const [regionWidth, regionHeight] = [canvas.clientWidth, canvas.clientHeight];
		next = clamp(Math.round(next * 1000) / 1000, MIN, MAX);
		const offset = (size: number, region: number) => Math.max(0, (region - size) / 2);
		const fx = (canvas.scrollLeft + x - offset(width * zoom, regionWidth)) / (width * zoom);
		const fy = (canvas.scrollTop + y - offset(height * zoom, regionHeight)) / (height * zoom);
		zoom = next;
		fitting = keepFit;
		canvas.style.setProperty("--abv-width", `${width * zoom}px`);
		canvas.style.setProperty("--abv-height", `${height * zoom}px`);
		scroll(fx * width * zoom + offset(width * zoom, regionWidth) - x, fy * height * zoom + offset(height * zoom, regionHeight) - y);
		percent.textContent = `${Math.round(zoom * 100)}%`;
		minus.disabled = zoom <= MIN;
		plus.disabled = zoom >= MAX;
	}
	function scroll(left: number, top: number) {
		const [width, height] = natural();
		canvas.scrollLeft = clamp(left, 0, Math.max(0, width * zoom - canvas.clientWidth));
		canvas.scrollTop = clamp(top, 0, Math.max(0, height * zoom - canvas.clientHeight));
	}
	function fitZoom() {
		const [width, height] = natural();
		return clamp(Math.min(canvas.clientWidth / width, canvas.clientHeight / height) || MIN, MIN, 1);
	}
	function fitView() {
		zoomTo(fitZoom(), undefined, undefined, true);
		const [width, height] = natural();
		scroll((width * zoom - canvas.clientWidth) / 2, (height * zoom - canvas.clientHeight) / 2);
	}

	// Gestures: one pointer pans, two pinch around their midpoint. Ctrl/Cmd + wheel
	// (also a trackpad pinch) zooms at the pointer; a plain wheel scrolls natively.
	const pointers = new Map<number, { x: number; y: number }>();
	const local = (event: { clientX: number; clientY: number }) => {
		const rect = canvas.getBoundingClientRect();
		return { x: event.clientX - (rect.left ?? 0), y: event.clientY - (rect.top ?? 0) };
	};
	listen(canvas, "pointerdown", event => {
		const pointer = event as PointerEvent;
		if (pointer.pointerType === "mouse" && pointer.button !== 0) return;
		pointers.set(pointer.pointerId, local(pointer));
		try { canvas.setPointerCapture?.(pointer.pointerId); } catch {}
		canvas.classList.toggle("abv-dragging", true);
	});
	listen(canvas, "pointermove", event => {
		const pointer = event as PointerEvent;
		const before = pointers.get(pointer.pointerId);
		if (!before) return;
		const [first, second] = [...pointers.values()];
		const after = local(pointer);
		if (pointers.size === 1) {
			pointers.set(pointer.pointerId, after);
			scroll(canvas.scrollLeft - (after.x - before.x), canvas.scrollTop - (after.y - before.y));
			return;
		}
		const other = first === before ? second : first;
		const distance = Math.hypot(before.x - other.x, before.y - other.y);
		pointers.set(pointer.pointerId, after);
		const next = Math.hypot(after.x - other.x, after.y - other.y);
		const middle = { x: (before.x + other.x) / 2, y: (before.y + other.y) / 2 };
		if (distance > 0) zoomTo(zoom * next / distance, middle.x, middle.y);
		scroll(canvas.scrollLeft - ((after.x + other.x) / 2 - middle.x), canvas.scrollTop - ((after.y + other.y) / 2 - middle.y));
	});
	const release = (event: Event) => {
		pointers.delete((event as PointerEvent).pointerId);
		if (!pointers.size) canvas.classList.toggle("abv-dragging", false);
	};
	for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) listen(canvas, type, release);
	listen(canvas, "wheel", event => {
		const wheel = event as WheelEvent;
		if (!wheel.ctrlKey && !wheel.metaKey) return;
		event.preventDefault();
		const delta = wheel.deltaY * (wheel.deltaMode === 1 ? 16 : wheel.deltaMode === 2 ? 400 : 1);
		const at = local(wheel);
		zoomTo(zoom * Math.exp(-delta / 300), at.x, at.y);
	});

	// Modal semantics: Escape, a press and release on the backdrop, native close.
	let backdropPress = false;
	listen(dialog, "pointerdown", event => { backdropPress = event.target === dialog; });
	listen(dialog, "click", event => { if (backdropPress && event.target === dialog) finish(); backdropPress = false; });
	listen(dialog, "cancel", event => { event.preventDefault(); finish(); });
	listen(dialog, "close", () => finish());
	listen(dialog, "keydown", event => {
		const key = event as KeyboardEvent;
		if (key.key !== "Tab") return;
		const focusable = [...tools, canvas, ...(hosting.focusables?.() ?? [])].filter(el => !(el as HTMLButtonElement).disabled);
		const last = focusable[focusable.length - 1];
		const active = (dialog.getRootNode() as Document | ShadowRoot).activeElement ?? doc.activeElement;
		if (key.shiftKey && active === close) { event.preventDefault(); last.focus(); }
		else if (!key.shiftKey && active === last) { event.preventDefault(); close.focus(); }
	});

	const Resize = view?.ResizeObserver;
	if (view && Resize) {
		let frame: number | undefined;
		const observer = new Resize(() => {
			if (closed || frame !== undefined) return;
			frame = view.requestAnimationFrame(() => { frame = undefined; if (!closed) relayout(); });
		});
		observer.observe(canvas);
		removers.push(() => { observer.disconnect(); if (frame !== undefined) view.cancelAnimationFrame(frame); });
	}
	function relayout() {
		if (fitting) fitView(); else zoomTo(zoom);
	}

	const root = doc.documentElement as HTMLElement | null;
	if (root?.style && !locks++) { pageOverflow = root.style.overflow; root.style.overflow = "hidden"; }
	refresh();
	dialog.showModal();
	close.focus();
	const [width, height] = natural();
	if (options.initialZoom !== "fit" && width <= canvas.clientWidth && height <= canvas.clientHeight) zoomTo(1);
	else fitView();

	function refresh() {
		if (closed) return;
		const next = hosting.svg();
		if (next !== svg) { viewers.delete(svg); svg = next; viewers.set(svg, handle); }
		dialog.setAttribute("aria-label", svg.getAttribute("aria-label") ?? "Figure");
		for (const name of ["auto", "light", "dark"]) dialog.classList.toggle(`ab-${name}`, svg.classList.contains(`ab-${name}`));
		if (dialog.open) relayout();
	}
	function finish() {
		if (closed) return;
		closed = true;
		hosting.leaving?.();
		for (const remove of removers.splice(0)) remove();
		pointers.clear();
		if (dialog.open) dialog.close();
		place.replaceWith(anchor);
		dialog.remove();
		canvas.classList.toggle("abv-canvas", false);
		canvas.classList.toggle("abv-dragging", false);
		for (const name of ["role", "aria-label", "tabindex"]) canvas.removeAttribute(name);
		canvas.style.removeProperty?.("--abv-width");
		canvas.style.removeProperty?.("--abv-height");
		if (viewers.get(svg) === handle) viewers.delete(svg);
		if (root?.style && !--locks) root.style.overflow = pageOverflow;
		hosting.moved?.(false);
		opener?.focus?.();
		options.onClose?.();
	}
	return handle;
}
