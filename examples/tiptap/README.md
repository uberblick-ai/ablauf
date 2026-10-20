# ablauf in a Tiptap editor

A Tiptap code block that draws itself when its language is `ablauf`, as
described in the [Tiptap guide](https://ablauf.uberblick.ai/guides/tiptap).

- `ablauf-block.ts` extends Tiptap's code block with a node view that renders
  the source above the editable `<pre>`.
- `editor.ts` creates an editor with the starter kit's code block swapped for
  this one and with Markdown in and out.
- `ablauf.css` gives the picture room and your page's colours.

Written for Tiptap 3 with `@tiptap/markdown`, tried with 3.32:

```sh
npm install @uberblick/ablauf @tiptap/core @tiptap/pm @tiptap/starter-kit @tiptap/extension-code-block @tiptap/markdown
```

These files are an example to copy, not part of the npm package.
