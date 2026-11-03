// Markdown (markdown-it) with TeX math (Temml -> MathML), producing the HTML that helium renders.
//
// Works in the browser (globals `markdownit` and `temml`, exposed as `HeliumMarkdown`) and in Node
// (`require`), so it can be unit-tested.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("markdown-it"), require("temml"));
  } else {
    root.HeliumMarkdown = factory(root.markdownit, root.temml);
  }
})(typeof self !== "undefined" ? self : this, function (markdownit, temml) {
  "use strict";

  const DOLLAR = 0x24;
  const BACKSLASH = 0x5c;

  function isEscaped(src, index) {
    let backslashes = 0;
    while (index - 1 - backslashes >= 0 && src.charCodeAt(index - 1 - backslashes) === BACKSLASH) backslashes++;
    return backslashes % 2 === 1;
  }

  // $x^2$ is inline math and $$x^2$$ inline display math. Like pandoc, the opening $ must be followed
  // and the closing $ preceded by a non-space, and the closing $ must not be followed by a digit, so
  // that "costs $5 and $6" stays text.
  function mathInline(state, silent) {
    const src = state.src;
    const pos = state.pos;
    if (src.charCodeAt(pos) !== DOLLAR) return false;

    const marker = src.charCodeAt(pos + 1) === DOLLAR ? 2 : 1;
    const start = pos + marker;
    if (start >= state.posMax) return false;
    if (marker === 1 && /\s/.test(src[start])) return false;

    let end = -1;
    for (let i = src.indexOf("$", start); i !== -1 && i < state.posMax; i = src.indexOf("$", i + 1)) {
      if (isEscaped(src, i)) continue;
      if (marker === 2 && src.charCodeAt(i + 1) !== DOLLAR) continue;
      end = i;
      break;
    }
    if (end === -1 || end === start) return false;
    if (marker === 1 && (/\s/.test(src[end - 1]) || /\d/.test(src[end + 1] ?? ""))) return false;

    if (!silent) {
      const token = state.push("math_inline", "math", 0);
      token.content = src.slice(start, end);
      token.markup = "$".repeat(marker);
      token.meta = { display: marker === 2 };
    }
    state.pos = end + marker;
    return true;
  }

  // A line starting with $$ opens display math that ends at the next line ending with $$
  // (which may be the same line).
  function mathBlock(state, startLine, endLine, silent) {
    if (state.sCount[startLine] - state.blkIndent >= 4) return false;
    const lineText = (line) => state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);

    const first = lineText(startLine);
    if (!first.startsWith("$$")) return false;

    const lines = [];
    let nextLine = startLine;
    let found = false;
    let text = first.slice(2);
    for (;;) {
      const trimmed = text.trimEnd();
      if (trimmed.endsWith("$$") && !isEscaped(trimmed, trimmed.length - 2)) {
        lines.push(trimmed.slice(0, -2));
        found = true;
        break;
      }
      lines.push(text);
      if (++nextLine >= endLine) break;
      text = lineText(nextLine);
    }
    if (!found) return false;
    if (silent) return true;

    state.line = nextLine + 1;
    const token = state.push("math_block", "math", 0);
    token.block = true;
    token.content = lines.join("\n").trim();
    token.markup = "$$";
    token.map = [startLine, state.line];
    return true;
  }

  function mathPlugin(md) {
    md.inline.ruler.after("escape", "math_inline", mathInline);
    md.block.ruler.before("fence", "math_block", mathBlock, { alt: ["paragraph", "reference", "blockquote", "list"] });
    md.renderer.rules.math_inline = (tokens, index) => renderMath(tokens[index].content, tokens[index].meta.display);
    md.renderer.rules.math_block = (tokens, index) => `${renderMath(tokens[index].content, true)}\n`;
  }

  function renderMath(tex, display) {
    const mathml = temml.renderToString(tex, { displayMode: display, throwOnError: false });
    // helium styles math by its display attribute, which Temml leaves off inline math, and it cannot
    // parse the `display:block math` that Temml puts in a style attribute.
    return mathml.replace(/^<math\b[^>]*>/, (tag) => {
      tag = tag.replace(/\sstyle="[^"]*"/, "");
      return display ? tag : tag.replace("<math", '<math display="inline"');
    });
  }

  // helium collapses white space in <pre> (it cannot parse `white-space: pre`), so code blocks are
  // written as one block per line with runs of spaces made non-breaking.
  const escapeHtml = (text) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function codeBlock(code) {
    const lines = code.replace(/\n$/, "").split("\n").map((line) => {
      const html = escapeHtml(line.replace(/\t/g, "    ")).replace(/^ +| {2,}/g, (run) => "&#160;".repeat(run.length));
      return `<div>${html || "&#160;"}</div>`;
    });
    return `<div class="codeblock">${lines.join("")}</div>\n`;
  }

  const md = markdownit({ html: true, linkify: true, typographer: true });
  md.use(mathPlugin);
  md.renderer.rules.fence = (tokens, index) => codeBlock(tokens[index].content);
  md.renderer.rules.code_block = (tokens, index) => codeBlock(tokens[index].content);

  // Headings (level and text), used for the outline. Code blocks are skipped.
  function headings(source) {
    const result = [];
    const tokens = md.parse(source, {});
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "heading_open") continue;
      const text = tokens[i + 1].children
        .filter((child) => child.type === "text" || child.type === "code_inline" || child.type === "math_inline")
        .map((child) => child.content)
        .join("");
      result.push({ level: Number(tokens[i].tag.slice(1)), text, line: tokens[i].map ? tokens[i].map[0] : 0 });
    }
    return result;
  }

  return { render: (source) => md.render(source), headings, renderMath };
});
