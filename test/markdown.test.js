const test = require("node:test");
const assert = require("node:assert/strict");
const markdown = require("../public/markdown.js");

const render = (source) => markdown.render(source);

test("renders headings, emphasis and links", () => {
  const html = render("# Title\n\nSome *emphasis*, **strong** and [a link](https://example.com).");
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<em>emphasis<\/em>/);
  assert.match(html, /<strong>strong<\/strong>/);
  assert.match(html, /<a href="https:\/\/example.com">a link<\/a>/);
});

test("inline math becomes MathML", () => {
  const html = render("Euler: $e^{i\\pi} + 1 = 0$ done.");
  assert.match(html, /<p>Euler: <math display="inline"[^>]*>/);
  assert.match(html, /<msup>/);
  assert.doesNotMatch(html, /\$/);
});

test("display math, on one line and on several", () => {
  for (const source of ["$$\\frac{a}{b}$$", "$$\n\\frac{a}{b}\n$$", "$$ \\frac{a}{b}\n$$"]) {
    const html = render(source);
    assert.match(html, /<math[^>]*display="block"/, source);
    assert.match(html, /<mfrac>/, source);
    assert.doesNotMatch(html, /<p>/, source);
  }
});

test("math carries no style attribute", () => {
  assert.doesNotMatch(render("$$x$$ and $y$"), /style=/);
});

test("$$ inside a paragraph is inline display math", () => {
  const html = render("before $$x^2$$ after");
  assert.match(html, /<p>before <math[^>]*display="block"/);
});

test("dollar amounts and escaped dollars stay text", () => {
  assert.equal(render("It costs $5 and $6."), "<p>It costs $5 and $6.</p>\n");
  assert.equal(render("A \\$ sign and \\$x\\$."), "<p>A $ sign and $x$.</p>\n");
});

test("an unclosed $$ block is left alone", () => {
  assert.doesNotMatch(render("$$\nx^2\n\nno closing"), /<math/);
});

test("math is not parsed inside code", () => {
  const html = render("`$x$`\n\n```\n$$y$$\n```\n");
  assert.doesNotMatch(html, /<math/);
  assert.match(html, /<code>\$x\$<\/code>/);
});

test("invalid TeX renders an error instead of throwing", () => {
  const html = render("$\\notacommand{x}$");
  assert.match(html, /<math/);
});

test("code blocks keep indentation without <pre>", () => {
  const html = render("```\nif x:\n    y  =  <1>\n\nz\n```\n");
  assert.doesNotMatch(html, /<pre/);
  assert.match(html, /<div class="codeblock">/);
  assert.match(html, /<div>if x:<\/div>/);
  assert.match(html, /<div>&#160;&#160;&#160;&#160;y&#160;&#160;=&#160;&#160;&lt;1&gt;<\/div>/);
  assert.match(html, /<div>&#160;<\/div>/);
});

test("raw HTML passes through", () => {
  assert.match(render('<div class="x">hi</div>'), /<div class="x">hi<\/div>/);
});

test("headings lists level, text and line, ignoring code blocks", () => {
  const found = markdown.headings("# One\n\ntext\n\n```\n# not a heading\n```\n\n## Two with `code` and $x$\n");
  assert.deepEqual(found, [
    { level: 1, text: "One", line: 0 },
    { level: 2, text: "Two with code and x", line: 8 },
  ]);
});
