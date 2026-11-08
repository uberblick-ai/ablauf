import { CHAR, type Typography, type TextStyle } from "./fonts.ts";

// Fixed-width cells use word wrapping and split long tokens. With host fonts
// measure whole strings at the rendered weight; keep historical default limits.
export function wrap(text: string, width: number, typography: Typography,
	fontSize: TextStyle["fontSize"] = 12, fontWeight: TextStyle["fontWeight"] = 400, bindPrefix = false): string[] {
	const limit = Math.floor(width / CHAR[`mono${fontSize}`]);
	const fits = (text: string) => typography.mono
		? typography.width(text, "mono", fontSize, fontWeight) <= width
		: [...text].length <= limit;
	const lines: string[] = [];
	let line = "";
	const words = text.split(/\s+/).filter(Boolean);
	if (bindPrefix && words.length > 1) words.splice(0, 2, `${words[0]} ${words[1]}`);
	for (const word of words) {
		if (line && !fits(`${line} ${word}`)) {
			lines.push(line);
			line = "";
		}
		const chars = [...word];
		while (chars.length && !fits(chars.join(""))) {
			let count = 1;
			while (count < chars.length && fits(chars.slice(0, count + 1).join(""))) count++;
			lines.push(chars.splice(0, count).join(""));
		}
		if (chars.length) line = line ? `${line} ${chars.join("")}` : chars.join("");
	}
	if (line || !lines.length) lines.push(line);
	return lines;
}
