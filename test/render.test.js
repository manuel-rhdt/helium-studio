// Calls the render function with the real helium binary (scripts/fetch-helium.sh).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const binary = path.join(__dirname, "../helium-bin/helium");
const needsBinary = { skip: fs.existsSync(binary) ? false : "helium-bin/helium is missing (run scripts/fetch-helium.sh)" };

async function render(html) {
  const { handler } = await import("../netlify/functions/render.mjs");
  const response = await handler({ httpMethod: "POST", body: typeof html === "string" ? JSON.stringify({ html }) : JSON.stringify(html) });
  return { status: response.statusCode, body: JSON.parse(response.body) };
}

const isPdf = (body) => Buffer.from(body.pdf, "base64").subarray(0, 5).toString() === "%PDF-";

test("renders a document to a PDF without noise in the log", needsBinary, async () => {
  const { status, body } = await render("<!DOCTYPE html><h1>Hello</h1><p>World</p>");
  assert.equal(status, 200);
  assert.ok(isPdf(body));
  assert.equal(body.log, "", "helium's built-in stylesheet warnings are filtered out");
});

test("renders the example document with math", needsBinary, async () => {
  global.window = {};
  require("../public/example.js");
  const markdown = require("../public/markdown.js");
  const styles = require("../public/styles.js");
  const html = styles.buildDocument(markdown.render(global.window.HELIUM_EXAMPLE), styles.defaults(), "Example");
  const { status, body } = await render(html);
  assert.equal(status, 200);
  assert.ok(isPdf(body));
  assert.ok(Buffer.from(body.pdf, "base64").length < 1024 * 1024, "the PDF is small because fonts are subset");
});

test("renders every font of the sidebar", needsBinary, async () => {
  const styles = require("../public/styles.js");
  for (const [family] of styles.FONTS) {
    const settings = styles.defaults();
    settings.body.font = family;
    const { status, body } = await render(styles.buildDocument("<p>Some <strong>bold</strong> and <em>italic</em> text.</p>", settings, family));
    assert.equal(status, 200, family);
    assert.ok(isPdf(body), family);
  }
});

test("a problem in the user's CSS shows up in the log", needsBinary, async () => {
  const { status, body } = await render("<style>p { colr: red }</style><p>x</p>");
  assert.equal(status, 200);
  assert.match(body.log, /colr/);
});

test("only POST is allowed", async () => {
  const { handler } = await import("../netlify/functions/render.mjs");
  assert.equal((await handler({ httpMethod: "GET" })).statusCode, 405);
});

test("bad requests are rejected before helium runs", async () => {
  const { handler } = await import("../netlify/functions/render.mjs");
  assert.equal((await handler({ httpMethod: "POST", body: "not json" })).statusCode, 400);
  assert.equal((await handler({ httpMethod: "POST", body: JSON.stringify({ html: "  " }) })).statusCode, 400);
  const tooBig = JSON.stringify({ html: "x".repeat(1024 * 1024 + 1) });
  assert.equal((await handler({ httpMethod: "POST", body: tooBig })).statusCode, 413);
});
