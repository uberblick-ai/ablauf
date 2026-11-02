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
	observers = new Set<{ callback: (entries: { isIntersecting: boolean }[]) => void; targets: Set<unknown> }>();
	get IntersectionObserver() {
		const observers = this.observers;
		return class {
			entry = { callback: (_: { isIntersecting: boolean }[]) => {}, targets: new Set<unknown>() };
			constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
				this.entry.callback = callback;
				observers.add(this.entry);
			}
			observe(target: unknown) { this.entry.targets.add(target); }
			disconnect() { observers.delete(this.entry); }
		};
	}
	show(isIntersecting: boolean) {
		for (const { callback, targets } of [...this.observers]) callback([...targets].map(() => ({ isIntersecting })));
	}
}

export class Doc {
	activeElement: El | null = null;
	motion = new Motion();
	viewport = new Viewport();
	defaultView = { matchMedia: this.motion.matchMedia, IntersectionObserver: this.viewport.IntersectionObserver };
	createElement(tag: string): El { return new El(tag, this); }
}

export class El {
	tag: string;
	ownerDocument: Doc;
	children: El[] = [];
	parent: El | null = null;
	attrs = new Map<string, string>();
	listeners = new Map<string, Set<(event: Event) => void>>();
	className = "";
	id = "";
	type = "";
	disabled = false;
	tabIndex = 0;
	min = "";
	max = "";
	step = "";
	value = "";
	writes = 0;
	private text = "";
	constructor(tag: string, doc: Doc) { this.tag = tag; this.ownerDocument = doc; }
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
	remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
	setAttribute(name: string, value: string) { this.attrs.set(name, value); }
	getAttribute(name: string) { return this.attrs.get(name) ?? null; }
	addEventListener(type: string, listener: (event: Event) => void) {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type)?.add(listener);
	}
	removeEventListener(type: string, listener: (event: Event) => void) { this.listeners.get(type)?.delete(listener); }
	fire(type: string, key = "") {
		let prevented = false;
		const event = { type, key, preventDefault() { prevented = true; } } as unknown as Event;
		for (const listener of this.listeners.get(type) ?? []) listener(event);
		return prevented;
	}
	click() { if (!this.disabled) this.fire("click"); }
	focus() { this.ownerDocument.activeElement = this; }
	all(): El[] { return [this, ...this.children.flatMap(el => el.all())]; }
	querySelectorAll(selector: string) {
		assert.equal(selector, "[data-ab-part]");
		return this.all().filter(el => el.attrs.has("data-ab-part"));
	}
}

