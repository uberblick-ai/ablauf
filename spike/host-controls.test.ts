import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { render } from "./flow/index.ts";
import { mountPlayback } from "./flow/playback.ts";
import { Doc, El } from "./test-dom.ts";

// Observe declarations emitted by real mounts. This limited cascade evaluator
// covers inheritance, layer precedence and the selectors used below. It does
// not claim to measure layout, browser scheme negotiation or pointer hit areas.
function rules(css: string, coarse: boolean, layer = false): { selector: string; body: string; layer: boolean }[] {
	const result: ReturnType<typeof rules> = [];
	let start = 0;
	while (start < css.length) {
		const open = css.indexOf("{", start);
		if (open < 0) break;
		let end = open + 1, depth = 1;
		while (depth && end < css.length) {
			if (css[end] === "{") depth++;
			if (css[end] === "}") depth--;
			end++;
		}
		assert.equal(depth, 0);
		const selector = css.slice(start, open).trim(), body = css.slice(open + 1, end - 1);
		if (selector.startsWith("@layer")) {
			assert.equal(selector, "@layer ablauf-playback");
			result.push(...rules(body, coarse, true));
		} else if (selector.startsWith("@media")) {
			assert.match(selector, /^@media \(any-pointer:coarse\)$/);
			if (coarse) result.push(...rules(body, coarse, layer));
		} else for (const item of selector.split(",")) result.push({ selector: item, body, layer });
		start = end;
	}
	return result;
}

function matches(el: El, selector: string): boolean {
	if (selector.includes(":") || selector.includes(">")) return false;
	const parts = selector.trim().split(/\s+/);
	const simple = (el: El, part: string) => {
		const attr = /\[([\w-]+)(?:="([^"]*)")?\]/.exec(part);
		if (attr && (attr[2] === undefined ? el.getAttribute(attr[1]) === null : el.getAttribute(attr[1]) !== attr[2])) return false;
		if (![...part.matchAll(/\.([\w-]+)/g)].every(m => el.classList.contains(m[1]))) return false;
		const tag = /^[\w-]+/.exec(part)?.[0];
		return !tag || tag === el.tag;
	};
	if (!simple(el, parts.pop() ?? "")) return false;
	let ancestor = el.parent;
	while (parts.length) {
		const part = parts.pop() ?? "";
		while (ancestor && !simple(ancestor, part)) ancestor = ancestor.parent;
		if (!ancestor) return false;
		ancestor = ancestor.parent;
	}
	return true;
}

function values(el: El, css: string, coarse = false, host = ""): Record<string, string> {
	const parent = el.parent ? values(el.parent, css, coarse, host) : {};
	const inherited = Object.fromEntries(Object.entries(parent).filter(([key]) => key.startsWith("--") || ["color-scheme", "font", "color"].includes(key)));
	const result = { ...inherited };
	const applicable = [...rules(host, coarse), ...rules(css, coarse)].filter(r => matches(el, r.selector));
	const specificity = (selector: string) => (selector.match(/\.|\[/g)?.length ?? 0) * 10 + (selector.match(/\bbutton\b/g)?.length ?? 0);
	applicable.sort((a, b) => Number(b.layer) - Number(a.layer) || specificity(a.selector) - specificity(b.selector));
	for (const rule of applicable) for (const declaration of rule.body.split(";").filter(Boolean)) {
		const colon = declaration.indexOf(":");
		const key = declaration.slice(0, colon), value = declaration.slice(colon + 1);
		result[key] = value === "inherit" ? parent[key] ?? "normal" : value;
	}
	for (const [key, value] of el.style.properties) result[key] = value;
	return result;
}

function resolved(el: El, property: string, css: string, coarse = false, host = "", preferDark = false): string {
	const style = values(el, css, coarse, host);
	let value = style[property] ?? "";
	const scheme = style["color-scheme"] ?? "normal";
	const dark = scheme === "dark" || scheme === "light dark" && preferDark;
	for (let i = 0; i < 10 && /var\(|light-dark\(/.test(value); i++) {
		value = value.replace(/light-dark\(([^,]+),([^()]+)\)/g, (_, light, darkValue) => dark ? darkValue : light);
		value = value.replace(/var\((--[\w-]+)(?:,([^()]*))?\)/g, (_, key, fallback) => style[key] ?? fallback ?? "");
	}
	return value;
}

const source = readFileSync(new URL("./examples/claim-play.flow", import.meta.url), "utf8");
function fixture(shadow: boolean, scheme: string) {
	const doc = new Doc(), host = new El("main", doc);
	const container = new El(shadow ? "#shadow-root" : "div", doc);
	host.append(container);
	const svg = new El("svg", doc); svg.className = `ab ab-${scheme}`; container.append(svg);
	const mount = mountPlayback(container as unknown as HTMLElement, svg as unknown as SVGSVGElement, render(source).timelines, { layout: "side", expand: true });
	const css = container.children.find(el => el.tag === "style")?.textContent ?? "";
	const find = (name: string) => container.all().find(el => el.classList.contains(name)) as El;
	return { host, container, svg, mount, css, find };
}

test("host schemes, palette overrides and both font roles stay live through document/shadow mounts and expansion", t => {
	for (const shadow of [false, true]) for (const scheme of ["auto", "light", "dark"]) {
		const f = fixture(shadow, scheme); t.after(() => f.mount.destroy());
		assert.ok(rules(f.css, true).every(r => r.layer), "all injected defaults belong to a layer");
		for (const hostScheme of ["light", "dark", "light dark", "normal"]) for (const preferDark of [false, true]) {
			f.host.style.setProperty("color-scheme", hostScheme);
			const root = f.find("ab-playback");
			const effective = scheme === "auto" ? hostScheme : scheme;
			assert.equal(values(root, f.css)["color-scheme"], effective);
			const dark = effective === "dark" || effective === "light dark" && preferDark;
			for (const [token, light, night] of [["bg", "#ffffff", "#171c24"], ["ink", "#17202c", "#e5e9ef"], ["muted", "#5a6575", "#98a2b0"], ["line", "#d3d9e2", "#2c3440"], ["play", "#0a7a60", "#6ff0cf"]]) {
				assert.equal(resolved(root, `--abp-${token}`, f.css, false, "", preferDark), dark ? night : light);
				f.host.style.setProperty(`--ab-${token}`, "#123456");
				assert.equal(resolved(root, `--abp-${token}`, f.css), "#123456");
				f.host.style.properties.delete(`--ab-${token}`);
			}
			assert.equal(values(root, f.css).background, "transparent");
		}
		for (const expanded of [false, true]) {
			if (expanded) f.mount.expand();
			f.host.style.setProperty("--font-sans", "Georgia,serif");
			f.host.style.setProperty("--ab-font-text", "var(--font-sans)");
			f.host.style.properties.delete("--ab-font-mono");
			assert.ok(resolved(f.find(expanded ? "abp-caption" : "abp-remark"), "font", f.css).endsWith("Georgia,serif"));
			assert.ok(resolved(f.find(expanded ? "abp-toggle" : "abp-who"), "font", f.css).endsWith("ui-monospace,monospace"));
			for (const font of ["", "Georgia,serif", "monospace"]) {
				for (const role of ["text", "mono"]) {
					if (font) f.host.style.setProperty(`--ab-font-${role}`, font);
					else f.host.style.properties.delete(`--ab-font-${role}`);
				}
				for (const name of ["ab-playback", "abp-caption", ...(expanded ? [] : ["abp-remark"])]) assert.ok(resolved(f.find(name), "font", f.css).endsWith(font || "system-ui,sans-serif"), name);
				for (const name of ["abp-toggle", "abp-counter", "abp-actor", ...(expanded ? [] : ["abp-row", "abp-number", "abp-who"])]) assert.ok(resolved(f.find(name), "font", f.css).endsWith(font || "ui-monospace,monospace"), name);
			}
		}
	}
});

test("coarse targets cover every mounted button and segment; preceding ordinary host rules win", t => {
	for (const shadow of [false, true]) for (const scheme of ["auto", "light", "dark"]) {
		const f = fixture(shadow, scheme); t.after(() => f.mount.destroy());
		for (const expanded of [false, true]) {
			if (expanded) f.mount.expand();
			const targets = f.container.all().filter(el => el.tag === "button" || el.classList.contains("abp-segment"));
			if (!expanded) assert.ok(targets.some(el => el.classList.contains("abp-row")));
			assert.ok(targets.some(el => el.getAttribute("role") === "tab"));
			if (expanded) assert.ok(targets.some(el => el.textContent === "Close"));
			for (const el of targets) {
				assert.equal(values(el, f.css, true)["min-height"], "44px");
				assert.ok(Number.parseFloat(values(el, f.css, true)["min-width"]) >= 44);
				assert.notEqual(values(el, f.css)["min-height"], "44px");
				const host = '.ab-playback{color-scheme:light;background:#eee}.ab-playback button{min-width:48px;min-height:48px;font:18px serif}.ab-playback .abp-segment{min-width:52px;min-height:52px}';
				const size = el.tag === "button" ? "48px" : "52px";
				assert.equal(values(el, f.css, true, host)["min-height"], size);
				assert.equal(values(el, f.css, true, host)["min-width"], size);
				assert.equal(values(f.find("ab-playback"), f.css, true, host)["color-scheme"], "light");
				assert.equal(values(f.find("ab-playback"), f.css, true, host).background, "#eee");
			}
			for (const name of ["abp-actions", "abp-segments"]) {
				assert.equal(values(f.find(name), f.css, true)["flex-wrap"], "wrap");
				assert.equal(values(f.find(name), f.css)["flex-wrap"], undefined);
			}
			assert.equal(values(f.find("abp-tabs"), f.css, true)["overflow-x"], "auto");
			assert.equal(values(f.find("abp-navigation"), f.css, true)["flex-basis"], "100%");
		}
	}
});

test("browser fixture keeps host scheme and width independent, without font corrections reaching controls", () => {
	const html = readFileSync(new URL("./playground/playback-review.html", import.meta.url), "utf8");
	const css = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
	assert.match(css, /body\[data-host="normal"\]\{color-scheme:normal\}/);
	assert.match(css, /body\[data-host="light dark"\]\{color-scheme:light dark/);
	assert.doesNotMatch(css, /\.ab-playback|\.abp-/);
	// A global unlayered `button { font: inherit }` would now override the
	// library's mono role, masking the defaults this fixture is meant to show.
	for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
		if (!body.includes("font:")) continue;
		for (const selector of selectors.split(",")) assert.match(selector.trim(), /^(?:body|header )/);
	}
	assert.match(html, /id="review-width"/);
	assert.match(html, /value="352px"/);
});
