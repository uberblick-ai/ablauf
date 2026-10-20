import CodeBlock from "@tiptap/extension-code-block";
import { render } from "@uberblick/ablauf";

let diagrams = 0;

// A code block that draws itself when its language is ablauf. The source
// stays the editable content, so Markdown keeps the fence as it is.
export const AblaufCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      const picture = document.createElement("div");
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      picture.className = "ablauf";
      picture.contentEditable = "false";
      pre.append(code);
      dom.append(picture, pre);

      // Ids inside one SVG must not clash with another diagram's.
      const idPrefix = `ablauf-${++diagrams}`;
      let drawn: string | null = null;
      const draw = (n: typeof node) => {
        const language = n.attrs.language;
        code.className = language ? `language-${language}` : "";
        picture.hidden = language !== "ablauf";
        if (picture.hidden || n.textContent === drawn) return;
        drawn = n.textContent;
        const { svg, diagnostics } = render(drawn, { idPrefix });
        picture.innerHTML = svg;
        picture.title = diagnostics.map((d) => `line ${d.line}: ${d.message}`).join("\n");
      };
      draw(node);

      return {
        dom,
        contentDOM: code,
        update(updated) {
          if (updated.type !== node.type) return false;
          draw(updated);
          return true;
        },
        // The picture is ours, not ProseMirror's to re-read.
        ignoreMutation: (m) => picture.contains(m.target),
      };
    };
  },
});
