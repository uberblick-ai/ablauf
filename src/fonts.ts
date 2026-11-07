/** Pixel sizes and CSS weights used by the renderer. */
export interface TextStyle {
	fontSize: 11 | 12 | 13;
	fontWeight: 400 | 600;
}

export interface FontOptions {
	/** One literal family name, not a CSS font-family declaration. */
	family: string;
	/** Synchronous advance width in SVG pixels, without letter spacing. */
	measureText: (text: string, style: TextStyle) => number;
}

export interface FontsOptions {
	mono?: FontOptions;
	text?: FontOptions;
}

// Historical estimates, retained exactly when a role is not configured.
export const CHAR = {
	mono11: 6.6,
	mono12: 7.2,
	mono13: 7.8,
	sans11: 6.1,
	sans12: 6.7,
};

export class Typography {
	readonly mono?: FontOptions;
	readonly text?: FontOptions;

	constructor(fonts: FontsOptions = {}) {
		for (const role of ["mono", "text"] as const) {
			const font = fonts[role];
			if (font === undefined) continue;
			// A deliberately small literal-name grammar excludes CSS syntax,
			// escapes, markup and URLs. Names are always quoted in the SVG.
			if (typeof font.family !== "string" ||
				!font.family.trim() || /[^\p{L}\p{N} _-]/u.test(font.family) ||
				typeof font.measureText !== "function") {
				throw new TypeError(`Invalid ${role} font: supply a literal family name and measureText function`);
			}
			this[role] = { family: font.family, measureText: font.measureText };
		}
	}

	width(text: string, role: "mono" | "text", fontSize: TextStyle["fontSize"],
		fontWeight: TextStyle["fontWeight"] = 400, estimate?: number): number {
		const font = this[role];
		if (!font) {
			const perChar = estimate ?? (role === "mono"
				? CHAR[`mono${fontSize}`]
				: fontSize === 11 ? CHAR.sans11 : CHAR.sans12);
			return [...text].length * perChar;
		}
		const width = font.measureText(text, { fontSize, fontWeight });
		// Bound before any layout arithmetic; even finite extreme values can
		// otherwise overflow when dimensions are added together.
		if (typeof width !== "number" || !Number.isFinite(width) || width < 0 || width > 1_000_000)
			throw new RangeError(`${role} measureText must return a width between 0 and 1000000 pixels`);
		return Math.ceil(width);
	}

	pillWidth(text: string): number {
		return Math.round(36 + this.width(text, "mono", 12));
	}

	captionWidth(text: string, diagnostic = false): number {
		if (!this.mono && diagnostic)
			return Math.round([...text].length * CHAR.mono11 * 1.15) + 2;
		const upper = text.toUpperCase();
		if (!this.mono)
			return Math.round([...upper].length * (CHAR.mono11 + 0.88));
		const width = this.width(upper, "mono", 11) + [...upper].length * 0.88;
		return Math.ceil(width);
	}
}
