const test = require("node:test");
const assert = require("node:assert/strict");
const styles = require("../public/styles.js");

test("defaults cover every control", () => {
  const defaults = styles.defaults();
  for (const section of styles.SECTIONS) {
    for (const control of section.controls) assert.notEqual(defaults[section.id][control.key], undefined);
  }
});

test("normalize keeps valid values and drops invalid ones", () => {
  const settings = styles.normalize({
    page: { marginTop: 40, marginLeft: "wide", pageNumbers: "bogus" },
    body: { size: 999, color: "red", font: "Comic Sans" },
    unknown: { x: 1 },
  });
  const defaults = styles.defaults();
  assert.equal(settings.page.marginTop, 40);
  assert.equal(settings.page.marginLeft, defaults.page.marginLeft);
  assert.equal(settings.page.pageNumbers, defaults.page.pageNumbers);
  assert.equal(settings.body.size, 30, "clamped to the maximum");
  assert.equal(settings.body.color, defaults.body.color);
  assert.equal(settings.body.font, defaults.body.font);
  assert.equal(settings.unknown, undefined);
  assert.deepEqual(styles.normalize(null), defaults);
});

test("css reflects the settings", () => {
  const settings = styles.defaults();
  settings.page.marginTop = 30;
  settings.page.pageNumbers = "right";
  settings.body.font = "DejaVu Sans";
  settings.body.align = "justify";
  settings.links.underline = "no";
  const css = styles.buildCss(settings);
  assert.match(css, /@page \{ margin: 30mm 25mm 25mm 25mm;/);
  assert.match(css, /@bottom-right \{ content: counter\(page\)/);
  assert.match(css, /body \{[^}]*font-family: "DejaVu Sans", sans-serif;/);
  assert.match(css, /p, li, blockquote \{ text-align: justify; \}/);
  assert.match(css, /a \{[^}]*text-decoration: none/);
  assert.match(css, /strong, b \{ font-weight: bold; \}/);
});

test("headings follow the body font unless one is chosen", () => {
  const settings = styles.defaults();
  assert.match(styles.buildCss(settings), /h1, h2[^{]*\{ font-family: "STIX Two Text", serif;/);
  settings.headings.font = "DejaVu Sans";
  assert.match(styles.buildCss(settings), /h1, h2[^{]*\{ font-family: "DejaVu Sans", sans-serif;/);
});

test("no page number rule when switched off", () => {
  const settings = styles.defaults();
  settings.page.pageNumbers = "none";
  assert.doesNotMatch(styles.buildCss(settings), /@bottom/);
});

test("document wraps the body and escapes the title", () => {
  const html = styles.buildDocument("<p>x</p>\n", styles.defaults(), "A & <B>");
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<title>A &amp; &lt;B&gt;<\/title>/);
  assert.match(html, /<body>\n<p>x<\/p>\n<\/body>/);
});
