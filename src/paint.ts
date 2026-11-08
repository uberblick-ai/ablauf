/** Public --ab-* names, in docs/theming.md table order. */
export const TOKENS = Object.freeze([
	"bg", "ink", "muted", "line", "band", "surface",
	"neutral", "neutral-bg", "agent", "agent-bg", "system", "system-bg",
	"done", "done-bg", "rework", "rework-bg", "stop", "stop-bg",
] as const);
export type Token = (typeof TOKENS)[number];
export type Palette = Record<Token, string>;

interface Paint<Ink extends Token | "play" = Token> {
	ink: Ink;
	/** Back to front, starting with the host canvas bg. */
	ground: Token[];
	/** Multiplies the alpha of the last ground layer only. */
	opacity?: number;
	/** Per-layer alpha multipliers, including 1 for bg; exclusive with opacity. */
	groundOpacities?: number[];
	where: string;
}

/** Effective playback values, resolved by the host before checking. */
export interface PlaybackContrast {
	play: string;
	unreachedOpacity: number | string;
	unreachedTextOpacity?: number | string;
}

type PlaybackPaint = Paint<Token | "play"> & {
	/** Multiplies text colour alpha, independently of the ground layers. */
	inkOpacity?: number;
	threshold: 3 | 4.5;
};
type StaticResult = { minimum: number; pairs: (Paint & { ratio: number })[] };
type PlaybackResult = { minimum: number; unreachedMinimum: number; pairs: (PlaybackPaint & { ratio: number })[] };

function playbackPaints(fade: number, textFade: number): PlaybackPaint[] {
	const result: PlaybackPaint[] = [];
	// Focus outlines and decorative glows do not change text paints. Keep
	// distinct state witnesses even where the CSS resolves to the same ink.
	for (const selected of [false, true]) for (const hover of [false, true]) for (const focus of [false, true]) {
		result.push({ threshold: 4.5, ink: selected ? "play" : hover ? "ink" : "muted", ground: ["bg"],
			where: `playback controls tab ${selected ? "selected" : "normal"}${hover ? " hover" : ""}${focus ? " keyboard-focused" : ""} on canvas` });
	}
	for (const disabled of [false, true]) for (const hover of [false, true]) for (const focus of disabled ? [false] : [false, true]) {
		result.push({ threshold: 4.5, ink: disabled ? "muted" : "ink", ground: ["bg", "bg"],
			where: `playback controls button ${disabled ? "disabled" : "enabled"}${hover ? " hover" : ""}${focus ? " keyboard-focused" : ""} on button background over canvas` });
	}
	for (const [element, ink] of [["actor", "play"], ["counter", "muted"], ["caption", "ink"], ["empty-state text", "ink"]] as const) {
		result.push({ threshold: 4.5, ink, ground: ["bg"], where: `playback controls ${element} on canvas` });
	}
	for (const state of ["current", "played", "unplayed"] as const) for (const band of [false, true]) {
		const canvas: Token[] = band ? ["bg", "band"] : ["bg"];
		const place = band ? "band" : "canvas";
		const opacity = state === "unplayed" ? fade : 1;
		const add = (ink: Token, layers: Token[], multipliers: number[], element: string, ground: string) => {
			const paint = {
				ink, ground: [...canvas, ...layers], groundOpacities: [...canvas.map(() => 1), ...multipliers],
				where: `playback SVG ${state} ${element} on ${ground} over ${place}`,
			};
			result.push({ ...paint, inkOpacity: state === "unplayed" ? textFade : 1, threshold: state === "unplayed" ? 3 : 4.5 });
			if (state === "unplayed") result.push({ ...paint, inkOpacity: 1, threshold: 4.5,
				where: `${paint.where} (full-opacity contrast preference witness)` });
		};
		for (const tone of ["ink", "muted", ...tones] as const) {
			const fill: Token = tone === "ink" || tone === "muted" ? "surface" : `${tone}-bg`;
			const foreground = tone === "ink" ? "muted" : tone;
			add("muted", [], [], `${tone} text node label`, place);
			add("ink", ["surface"], [opacity], `${tone} pill label`, "pill surface");
			add(foreground, [fill], [opacity], `${tone} box/end label`, fill);
			add("muted", [fill], [opacity], `${tone} box subtitle`, fill);
			for (const ink of ["ink", "muted"] as const) add(ink, [fill], [opacity], `${tone} panel ${ink} text`, fill);
			add("ink", [fill, "surface"], [opacity, opacity], `${tone} panel pill label`, `${fill} and pill surface`);
			for (const diamond of [false, true]) add(foreground, [...(diamond ? [fill] : []), "surface"], [...(diamond ? [opacity] : []), 0.82 * opacity],
				`${tone} decision label`, `${diamond ? `${fill} diamond and ` : ""}surface label-box`);
			add(tone, [], [], `${tone} edge label`, place);
			// Untoned ordinary edge text uses ink; inline text uses muted.
			add(foreground, [band ? "band" : "bg"], [1], `${tone} inline edge label`, "unfaded gap");
		}
	}
	return result;
}

// A text paint contract, independent of any particular diagram. Keep the
// renderer independent of this list so exposing it cannot change SVG bytes.
const paints: Paint[] = [];
const tones = ["neutral", "agent", "system", "done", "rework", "stop"] as const;
for (const band of [false, true]) {
	const canvas: Token[] = band ? ["bg", "band"] : ["bg"];
	const place = band ? "band" : "canvas";
	for (const ink of ["ink", "muted", ...tones] as const) {
		paints.push({ ink, ground: [...canvas], where: `${ink}-toned edge labels on ${place}${ink === "muted" ? "; captions, free text, legend descriptions and fan-out reasons" : ink === "ink" ? "; ordinary untoned edge labels and fan-out destinations/outcomes" : ink === "stop" ? "; visible fan-out diagnostics" : ""}` });
		if (ink !== "ink") paints.push({ ink, ground: [...canvas, band ? "band" : "bg"], where: `${ink}-toned inline edge labels on ${place} gaps` });
	}
	const fills: Token[] = ["surface", ...tones.map((tone): Token => `${tone}-bg`)];
	for (const fill of fills) {
		paints.push({ ink: "ink", ground: [...canvas, fill, "surface"], where: `pill labels inside ${fill} panels on ${place}` });
		for (const ink of ["ink", "muted"] as const) {
			paints.push({ ink, ground: [...canvas, fill], where: `${ink} node titles/subtitles, panel contents, pill labels or fan-out outcomes on ${fill} over ${place}` });
		}
	}
	for (const tone of ["ink", "muted", ...tones] as const) {
		const fill: Token = tone === "ink" || tone === "muted" ? "surface" : `${tone}-bg`;
		const foreground = tone === "ink" ? "muted" : tone;
		paints.push({ ink: foreground, ground: [...canvas, fill], where: `${tone} box/end titles and legend samples on ${place}` });
		// Both .t-ink and .t-muted resolve to the muted token.
		for (const diamond of [false, true]) {
			paints.push({
				ink: foreground, ground: [...canvas, ...(diamond ? [fill] : []), "surface"], opacity: 0.82,
				where: `${tone} decision label/legend sample over ${diamond ? "tone diamond and " : ""}${place}`,
			});
		}
	}
}

// Bounded sequence lanes tint only the ground, never the foreground text.
// ink/muted participant tones both use muted; message labels always use ink.
for (const tinted of [false, true]) {
	for (const ink of ["ink", "muted", ...tones] as const) paints.push({
		ink, ground: tinted ? ["bg", "neutral-bg"] : ["bg"],
		...(tinted ? { opacity: 0.15 } : {}),
		where: `sequence ${ink === "ink" ? "request/response labels" : ink === "muted" ? "ink/muted participant titles and step numbers" : `${ink} participant titles`}${ink === "stop" ? " and visible rejected source" : ""} on ${tinted ? "lane tint" : "canvas"}`,
	});
}

// Only the outermost two group depths paint. Deeper headings and messages
// therefore reuse the two-fill pairs, even with arbitrary syntax nesting.
for (const tinted of [false, true]) for (const depth of [0, 1, 2]) {
	const ground: Token[] = ["bg", ...(tinted ? ["neutral-bg" as const] : []), ...Array<Token>(depth).fill("neutral-bg")];
	const groundOpacities = [1, ...(tinted ? [0.15] : []), ...Array<number>(depth).fill(0.5)];
	if (depth) for (const ink of ["ink", "muted"] as const) paints.push({
		ink, ground, groundOpacities,
		where: `sequence group/else ${ink === "ink" ? "kinds and request/response labels" : "labels"} on ${tinted ? "lane tint" : "canvas"} and ${depth} group fills (also deeper groups without additional fill)`,
	});
	paints.push({ ink: "rework", ground: [...ground, "rework-bg"], groundOpacities: [...groundOpacities, 1],
		where: `sequence note text on rework fill over ${tinted ? "lane tint" : "canvas"} and ${depth} group fills` });
}

type Colour = [number, number, number, number];
const number = /^[+-]?(?:\d*\.\d+|\d+)(?:e[+-]?\d+)?$/i;

function colour(value: string, token: Token | "play"): Colour {
	const fail = (): never => { throw new TypeError(`Invalid or unsupported colour for ${token}: ${String(value)}`); };
	if (typeof value !== "string") return fail();
	const text = value.trim().toLowerCase();
	if (text === "transparent") return [0, 0, 0, 0];
	const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.exec(text);
	if (hex) {
		let digits = hex[1];
		if (digits.length <= 4) digits = [...digits].map((c) => c + c).join("");
		if (digits.length === 6) digits += "ff";
		return [0, 2, 4, 6].map((i) => Number.parseInt(digits.slice(i, i + 2), 16) / 255) as Colour;
	}
	const fn = /^(rgb|rgba|color)\((.*)\)$/s.exec(text);
	if (!fn) return fail();
	let body = fn[2].trim();
	const srgb = fn[1] === "color";
	if (srgb) {
		if (!/^srgb\s/.test(body)) return fail();
		body = body.slice(4).trim();
	}
	const comma = body.includes(",");
	if (comma && (srgb || body.includes("/"))) return fail();
	// Split the literal delimiter before trimming: an unanchored whitespace
	// regex can retry an entire whitespace run at each position without a slash.
	const parts = body.split(comma ? "," : "/").map((p) => p.trim());
	let channels: string[];
	let alpha: string;
	if (comma) {
		if (parts.length !== 3 && parts.length !== 4) return fail();
		channels = parts.slice(0, 3);
		alpha = parts[3] ?? "1";
	} else {
		if (parts.length > 2) return fail();
		channels = parts[0].trim().split(/\s+/);
		alpha = parts[1] ?? "1";
	}
	if (channels.length !== 3) return fail();
	if (comma && !channels.every((c) => c.endsWith("%") === channels[0].endsWith("%"))) return fail();
	const component = (part: string, scale: number) => {
		const percent = part.endsWith("%");
		const digits = percent ? part.slice(0, -1) : part;
		if (!number.test(digits)) return fail();
		const n = Number(digits) / (percent ? 100 : scale);
		if (!Number.isFinite(n) || n < 0 || n > 1) return fail();
		return n;
	};
	return [...channels.map((c) => component(c, srgb ? 1 : 255)), component(alpha, 1)] as Colour;
}

function unreachedOpacity(value: number | string, field = "unreachedOpacity"): number {
	const fail = (): never => { throw new TypeError(`Invalid or unsupported ${field}`); };
	if (typeof value === "string") {
		const text = value.trim();
		const percent = text.endsWith("%");
		const digits = percent ? text.slice(0, -1) : text;
		if (!number.test(digits) || !Number.isFinite(Number(digits))) return fail();
		value = Number(digits) / (percent ? 100 : 1);
	}
	if (typeof value !== "number" || !Number.isFinite(value)) return fail();
	return Math.max(0, Math.min(1, value));
}

// Source-over in gamma-encoded sRGB, followed by WCAG relative luminance.
const over = (top: Colour, bottom: Colour, opacity = 1): Colour => {
	const a = top[3] * opacity;
	return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1) as Colour;
};
function luminance(c: Colour): number {
	const linear = c.slice(0, 3).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
	return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

/** Check every text paint the renderer can emit, without a DOM. Throws on
 * missing, invalid or unsupported colours; bg must be an opaque host canvas.
 * Playback results separate the 4.5:1 minimum from the 3:1 unreachedMinimum;
 * callers must check every pair against its threshold.
 * Decorative text-shadow/glow and non-text contrast are excluded.
 * See https://ablauf.uberblick.ai/guides/testing for accepted forms and layers.
 */
export function checkPalette(palette: Palette): StaticResult;
export function checkPalette(palette: Palette, playback: undefined): StaticResult;
export function checkPalette(palette: Palette, playback: PlaybackContrast): PlaybackResult;
export function checkPalette(palette: Palette, playback: PlaybackContrast | undefined): StaticResult | PlaybackResult;
export function checkPalette(palette: Palette, playback?: PlaybackContrast) {
	if (!palette || typeof palette !== "object") throw new TypeError("Expected a complete palette");
	const colours = Object.fromEntries(TOKENS.map((token) => {
		if (!Object.hasOwn(palette, token)) throw new TypeError(`Missing palette colour: ${token}`);
		return [token, colour(palette[token], token)];
	})) as Record<Token, Colour>;
	if (colours.bg[3] !== 1) throw new TypeError("bg must be an opaque host canvas colour");
	let textPaints: (Paint<Token | "play"> & { inkOpacity?: number; threshold?: 3 | 4.5 })[] = paints;
	const inks: Record<Token | "play", Colour> = { ...colours, play: colours.ink };
	if (playback !== undefined) {
		if (!playback || typeof playback !== "object" || !Object.hasOwn(playback, "play") || !Object.hasOwn(playback, "unreachedOpacity")) throw new TypeError("Expected play and unreachedOpacity");
		inks.play = colour(playback.play, "play");
		const textFade = playback.unreachedTextOpacity === undefined ? 0.8 : unreachedOpacity(playback.unreachedTextOpacity, "unreachedTextOpacity");
		textPaints = [...paints.map(p => ({ ...p, threshold: 4.5 as const })), ...playbackPaints(unreachedOpacity(playback.unreachedOpacity), textFade)];
	}
	const pairs = textPaints.map((paint) => {
		let ground = colours.bg;
		for (let i = 1; i < paint.ground.length; i++) {
			ground = over(colours[paint.ground[i]], ground, paint.groundOpacities?.[i] ?? (i === paint.ground.length - 1 ? paint.opacity : 1));
		}
		const a = luminance(over(inks[paint.ink], ground, paint.inkOpacity));
		const b = luminance(ground);
		return { ...paint, ground: [...paint.ground], ...(paint.groundOpacities ? { groundOpacities: [...paint.groundOpacities] } : {}), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
	});
	if (playback === undefined) return { minimum: Math.min(...pairs.map(p => p.ratio)), pairs };
	return {
		minimum: Math.min(...pairs.filter(p => p.threshold === 4.5).map(p => p.ratio)),
		unreachedMinimum: Math.min(...pairs.filter(p => p.threshold === 3).map(p => p.ratio)), pairs,
	};
}
