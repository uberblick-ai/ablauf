import assert from "node:assert/strict";

// Deliberately small DOM fakes: no parsing, innerHTML or browser dependency.
class Motion {
	matches = false;
	listeners = new Set<(event: MediaQueryListEvent) => void>();
	matchMedia = () => this;
	addEventListener(_type: string, listener: (event: MediaQueryListEvent) => void) { this.listeners.add(listener); }
	removeEventListener(_type: string, listener: (event: MediaQueryListEvent) => void) { this.listeners.delete(listener); }
	set(matches: boolean) {
		this.matches = matches;
		for (const listener of [...this.listeners]) listener({ matches } as MediaQueryListEvent);
	}
}

// One shared fake: `show(true|false)` reports every observed element in or out of view.
export class Viewport {
	observers = new Set<{ callback: (entries: { target: unknown; isIntersecting: boolean; intersectionRatio: number }[]) => void; targets: Set<unknown> }>();
	get IntersectionObserver() {
		const observers = this.observers;
		return class {
			entry = { callback: (_: { target: unknown; isIntersecting: boolean; intersectionRatio: number }[]) => {}, targets: new Set<unknown>() };
			constructor(callback: (entries: { target: unknown; isIntersecting: boolean; intersectionRatio: number }[]) => void) {
				this.entry.callback = callback;
				observers.add(this.entry);
			}
			observe(target: unknown) { this.entry.targets.add(target); }
			disconnect() { observers.delete(this.entry); }
		};
	}
	show(isIntersecting: boolean, intersectionRatio = isIntersecting ? 1 : 0) {
		for (const { callback, targets } of [...this.observers]) callback([...targets].map(target => ({ target, isIntersecting, intersectionRatio })));
	}
}

export class Doc {
	activeElement: El | null = null;
	hidden = false;
	visibilityState = "visible";
	listeners = new Map<string, Set<() => void>>();
	addEventListener(type: string, listener: () => void) {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)?.add(listener);
	}
	removeEventListener(type: string, listener: () => void) { this.listeners.get(type)?.delete(listener); }
	setHidden(hidden: boolean) {
		this.hidden = hidden; this.visibilityState = hidden ? "hidden" : "visible";
		for (const listener of [...this.listeners.get("visibilitychange") ?? []]) listener();
	}
	motion = new Motion();
	viewport = new Viewport();
	resize = new Resizes();
	frames = new Frames();
	defaultView = {
		matchMedia: this.motion.matchMedia, IntersectionObserver: this.viewport.IntersectionObserver, ResizeObserver: this.resize.ResizeObserver,
		requestAnimationFrame: this.frames.request, cancelAnimationFrame: this.frames.cancel,
	};
	createElement(tag: string): El { return new El(tag, this); }
	createComment(text: string): El { const el = new El("#comment", this); el.textContent = text; return el; }
}

class Frames {
	callbacks = new Map<number, FrameRequestCallback>();
	private nextId = 0;
	request = (callback: FrameRequestCallback) => {
		const id = ++this.nextId;
		this.callbacks.set(id, callback);
		return id;
	};
	cancel = (id: number) => { this.callbacks.delete(id); };
	flush() {
		const callbacks = [...this.callbacks.values()];
		this.callbacks.clear();
		for (const callback of callbacks) callback(0);
	}
}

export class Resizes {
	observers = new Set<{ callback: () => void; targets: Set<El> }>();
	get ResizeObserver() {
		const observers = this.observers;
		return class {
			entry: { callback: () => void; targets: Set<El> };
			constructor(callback: () => void) {
				this.entry = { callback, targets: new Set() };
				observers.add(this.entry);
			}
			observe(target: El) { this.entry.targets.add(target); }
			disconnect() { observers.delete(this.entry); }
		};
	}
	flush() { for (const { callback } of [...this.observers]) callback(); }
}

export class El {
	tag: string;
	ownerDocument: Doc;
	children: El[] = [];
	parent: El | null = null;
	attrs = new Map<string, string>();
	listeners = new Map<string, Set<(event: Event) => void>>();
	className = "";
	dataset: Record<string, string> = {};
	connected = true;
	contentEditable = "inherit";
	get isConnected(): boolean { return this.connected && (this.parent?.isConnected ?? true); }
	get isContentEditable(): boolean { return this.contentEditable === "true" || (this.contentEditable === "inherit" && (this.parent?.isContentEditable ?? false)); }
	activeElement: El | null = null;
	getRootNode(): Doc | El {
		let el: El | null = this;
		while (el) {
			if (el.tag === "#shadow-root") return el;
			el = el.parent;
		}
		return this.ownerDocument;
	}
	id = "";
	type = "";
	disabled = false;
	tabIndex = 0;
	min = "";
	max = "";
	step = "";
	value = "";
	hidden = false;
	scrollLeft = 0;
	scrollTop = 0;
	rect: { top: number; bottom: number; width: number } | undefined;
	style = { properties: new Map<string, string>(), setProperty(name: string, value: string) { this.properties.set(name, value); } };
	writes = 0;
	open = false;
	autofocus = false;
	private text = "";
	constructor(tag: string, doc: Doc) { this.tag = tag; this.ownerDocument = doc; }
	get firstElementChild() { return this.children[0] ?? null; }
	replaceWith(el: El) {
		const parent = this.parent;
		if (!parent) return;
		el.remove();
		parent.children.splice(parent.children.indexOf(this), 1, el);
		el.parent = parent;
		this.parent = null;
	}
	showModal() { this.open = true; }
	close() { this.open = false; this.fire("close"); }
	set innerHTML(_value: string) { assert.fail("Source text must never be parsed as HTML"); }
	get textContent(): string { return this.text + this.children.map(el => el.textContent).join(""); }
	set textContent(text: string) {
		this.writes++;
		this.text = text;
		for (const child of this.children) child.parent = null;
		this.children = [];
	}
	classList = {
		contains: (name: string) => this.className.split(" ").includes(name),
		toggle: (name: string, force: boolean) => {
			const names = new Set(this.className.split(" ").filter(Boolean));
			if (force) names.add(name); else names.delete(name);
			this.className = [...names].join(" ");
			return force;
		},
	};
	append(...els: El[]) { for (const el of els) { el.remove(); el.parent = this; this.children.push(el); } }
	get parentNode() { return this.parent; }
	get parentElement() { return this.parent; }
	get nextSibling(): El | null { return this.parent?.children[this.parent.children.indexOf(this) + 1] ?? null; }
	insertBefore(el: El, next: El | null) {
		el.remove();
		const index = next ? this.children.indexOf(next) : this.children.length;
		assert.ok(index >= 0);
		el.parent = this;
		this.children.splice(index, 0, el);
	}
	getBoundingClientRect(): { top: number; bottom: number; width: number } {
		return this.rect ?? this.parent?.getBoundingClientRect() ?? { top: 0, bottom: 0, width: 0 };
	}
	remove() {
		if (this.parent) {
			const root = this.getRootNode();
			if (root.activeElement && this.all().includes(root.activeElement)) root.activeElement = null;
			this.parent.children.splice(this.parent.children.indexOf(this), 1);
		}
		this.parent = null;
	}
	setAttribute(name: string, value: string) { this.attrs.set(name, value); }
	getAttribute(name: string) { return this.attrs.get(name) ?? null; }
	removeAttribute(name: string) { this.attrs.delete(name); }
	addEventListener(type: string, listener: (event: Event) => void) {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)?.add(listener);
	}
	removeEventListener(type: string, listener: (event: Event) => void) { this.listeners.get(type)?.delete(listener); }
	fire(type: string, key = "", extra: Record<string, unknown> = {}) {
		let prevented = false;
		const event = { type, key, target: this, ...extra, preventDefault() { prevented = true; } } as unknown as Event;
		let el: El | null = this;
		while (el) {
			for (const listener of el.listeners.get(type) ?? []) listener(event);
			el = el.parent;
		}
		return prevented;
	}
	click() { if (!this.disabled) this.fire("click"); }
	focus() {
		const root = this.getRootNode();
		root.activeElement = this;
		if (root instanceof El) this.ownerDocument.activeElement = root;
	}
	all(): El[] { return [this, ...this.children.flatMap(el => el.all())]; }
	contains(el: El): boolean { return this.all().includes(el); }
	querySelectorAll(selector: string) {
		assert.equal(selector, "[data-ab-part]");
		return this.all().filter(el => el.attrs.has("data-ab-part"));
	}
}
