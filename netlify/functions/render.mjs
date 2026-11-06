// Renders an HTML document to PDF with helium.
//
// POST /api/render   body: { "html": "<!DOCTYPE html>..." }
// 200 -> { pdf: <base64>, log: <stderr>, ms: <render time> }
// 422 -> { error, log, ms }        helium failed on the document
import { execFile } from "node:child_process";
import { existsSync, accessSync, constants, copyFileSync, chmodSync, mkdirSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_INPUT_BYTES = 1024 * 1024;
// Netlify runs synchronous functions with a hard ~10 s cap. Time out below it so we fail with a
// clean 422 (and still clean up the temp dir) instead of being killed by the platform mid-render.
const RENDER_TIMEOUT_MS = 8_000;
const MAX_LOG_CHARS = 20_000;
// Lambda rejects any function response over 6 MB, and base64 inflates the PDF by 4/3. Cap the raw
// PDF so the JSON response stays under that limit; otherwise the platform returns an uncatchable 413.
const MAX_PDF_BYTES = 4 * 1024 * 1024;

// The helium binary (scripts/fetch-helium.sh) is shipped via `included_files`; where it lands relative
// to the bundle differs between `netlify dev`, the deployed function and a plain Lambda container.
function findBinary() {
  // Netlify bundles the function with esbuild into CommonJS, where import.meta.url is undefined
  // and __dirname exists instead; run as a plain ES module it is the other way around.
  const here =
    typeof __dirname === "string"
      ? __dirname
      : import.meta.url
        ? path.dirname(fileURLToPath(import.meta.url))
        : process.cwd();
  const candidates = [
    process.env.HELIUM_BINARY,
    process.env.LAMBDA_TASK_ROOT && path.join(process.env.LAMBDA_TASK_ROOT, "helium-bin/helium"),
    path.join(here, "helium-bin/helium"),
    path.join(here, "../../helium-bin/helium"),
    path.join(process.cwd(), "helium-bin/helium"),
  ].filter(Boolean);
  const found = candidates.find((file) => existsSync(file));
  if (!found) throw new Error(`helium binary not found (looked in ${candidates.join(", ")})`);
  return found;
}

let runtime;
function setup() {
  if (runtime) return runtime;
  const work = path.join(tmpdir(), "helium-runtime");
  mkdirSync(work, { recursive: true });

  // the deploy zip does not always keep the executable bit, and /var/task is read-only
  let binary = findBinary();
  try {
    accessSync(binary, constants.X_OK);
  } catch {
    const copy = path.join(work, "helium");
    copyFileSync(binary, copy);
    chmodSync(copy, 0o755);
    binary = copy;
  }

  // helium is a static binary with its fonts built in, so it needs no libraries or font setup. It
  // ignores installed fonts so that the output is the same on every machine.
  runtime = {
    binary,
    env: { PATH: process.env.PATH, HOME: work, HELIUM_NO_SYSTEM_FONTS: "1", RUST_LOG: "warn", RUST_BACKTRACE: "1" },
  };
  return runtime;
}

function run(binary, args, env) {
  return new Promise((resolve) => {
    execFile(binary, args, { env, timeout: RENDER_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ error, output: `${stdout}${stderr}` });
    });
  });
}

// helium's built-in user-agent stylesheet produces the same parser warnings for every document;
// they are learned once from an empty document and filtered out so the log shows only the user's issues
const logMessage = (line) => line.replace(/^\[\S+\s+/, "");
let baseline;
function baselineWarnings(rt) {
  baseline ??= (async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "baseline-"));
    try {
      await writeFile(path.join(dir, "empty.html"), "<!DOCTYPE html><html><body></body></html>");
      const { output } = await run(rt.binary, [path.join(dir, "empty.html"), path.join(dir, "empty.pdf")], rt.env);
      return new Set(output.split("\n").filter(Boolean).map(logMessage));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  })();
  return baseline;
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Use POST" });

  let html;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString("utf8") : event.body ?? "";
    html = JSON.parse(raw).html;
  } catch {
    return json(400, { error: "Body must be JSON: { \"html\": \"...\" }" });
  }
  if (typeof html !== "string" || html.trim() === "") return json(400, { error: "No HTML given" });
  if (Buffer.byteLength(html) > MAX_INPUT_BYTES) return json(413, { error: "Document is larger than 1 MB" });

  let rt;
  try {
    rt = setup();
  } catch (err) {
    return json(500, { error: err.message, log: "" });
  }

  const known = await baselineWarnings(rt);
  const dir = await mkdtemp(path.join(tmpdir(), "render-"));
  const input = path.join(dir, "main.html");
  const output = path.join(dir, "output.pdf");
  const started = Date.now();
  try {
    await writeFile(input, html);
    const result = await run(rt.binary, [input, output], rt.env);
    const { error } = result;
    const log = result.output
      .split("\n")
      .filter((line) => !known.has(logMessage(line)))
      .join("\n");
    const ms = Date.now() - started;
    const trimmedLog = log.length > MAX_LOG_CHARS ? `${log.slice(0, MAX_LOG_CHARS)}\n… (truncated)` : log;
    if (error) {
      const reason = error.killed
        ? `helium timed out after ${RENDER_TIMEOUT_MS / 1000}s`
        : error.signal
          ? `helium crashed (${error.signal})`
          : `helium exited with code ${error.code}`;
      return json(422, { error: reason, log: trimmedLog, ms });
    }
    const pdf = await readFile(output);
    if (pdf.length > MAX_PDF_BYTES) {
      return json(413, {
        error: `The rendered PDF is ${(pdf.length / 1048576).toFixed(1)} MB, over the ${
          MAX_PDF_BYTES / 1048576
        } MB limit. Split the document or reduce its images.`,
        log: trimmedLog,
        ms,
      });
    }
    return json(200, { pdf: pdf.toString("base64"), log: trimmedLog, ms });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
