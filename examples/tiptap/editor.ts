import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { AblaufCodeBlock } from "./ablauf-block";

export const editor = (element: HTMLElement, markdown: string) =>
  new Editor({
    element,
    extensions: [StarterKit.configure({ codeBlock: false }), AblaufCodeBlock, Markdown],
    content: markdown,
    contentType: "markdown",
  });
