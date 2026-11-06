# Helium Studio

An Overleaf-style editor: write Markdown with TeX math on the left, get a PDF on the right,
rendered by [helium](https://github.com/manuel-rhdt/helium) in a Netlify Function.

- `public/` – static frontend, no build step:
  - `markdown.js` – Markdown ([markdown-it](https://github.com/markdown-it/markdown-it)) with `$…$` and
    `$$…$$` math converted to MathML by [Temml](https://temml.org); runs in the browser
  - `styles.js` – the style settings (page, body text, headings, code, quotes, links) and the CSS built from them
  - `app.js`, `index.html`, `style.css` – CodeMirror editor, **Style**/**Outline** sidebar, pdf.js viewer
- `netlify/functions/render.mjs` – `POST /api/render { html }` → `{ pdf (base64), log, ms }`
- `scripts/fetch-helium.sh` – downloads the helium release that the function runs

The browser turns the Markdown and the style settings into one HTML document, which is what the function
renders. The **HTML** switch above the editor shows that generated document (read-only). Raw HTML inside the
Markdown passes through.

## How helium runs

Helium is a single static (musl) executable with its fonts and the math fonts built in, so the function needs
nothing but that file: no libraries, no font files, no container. `scripts/fetch-helium.sh` downloads the
release pinned in the script and checks its SHA-256; the Netlify CLI then ships `helium-bin/` with the
function (`included_files` in `netlify.toml`). To update helium, change `VERSION` and `SHA256` in the script.

## Fonts

The style sidebar offers the fonts built into helium: TeX Gyre Termes (Times-like serif), TeX Gyre Heros
(Helvetica-like sans) and TeX Gyre Cursor (Courier-like mono). Math uses STIX Two Math. The function runs
helium with `HELIUM_NO_SYSTEM_FONTS=1`, so installed fonts are ignored and the output is the same on every
machine. To offer more fonts, ship font files with the function, drop that variable, point `FONTCONFIG_FILE`
at a fonts.conf that lists their directory, and add them to `FONTS` in `public/styles.js`.

## Helium's limits

Helium does not implement all of HTML and CSS, so some things do not render as they would in a browser:
Markdown tables are not laid out as tables (each row becomes a line of text), the page is always A4, and there
is no letter spacing or `text-transform`.

## Running locally

```bash
scripts/fetch-helium.sh            # once
scripts/dev.py                     # http://localhost:8888
```

`dev.py` serves `public/` and runs the helium binary directly, without Node. `netlify dev` runs the real
function if you have the Netlify CLI.

## Tests

```bash
npm ci && npm test                 # Node 22; needs helium-bin/ for the render tests, which are skipped without it
```

## Deploying

`.github/workflows/deploy.yml` runs on every push to `main` (or manually from the Actions tab): it fetches
helium, runs the tests and deploys with the Netlify CLI. Set these repository secrets (Settings → Secrets and
variables → Actions):

| Secret | Value |
| --- | --- |
| `NETLIFY_AUTH_TOKEN` | Netlify personal access token |
| `NETLIFY_SITE_ID` | the site's ID (Site configuration → Site ID) |

Create the Netlify site without linking the repo (or turn off its automatic builds), since the workflow does
the deploying.

Synchronous functions have a ~10 s timeout and a 6 MB response limit. The function guards both: renders are
cut off at 8 s (→ clean `422`) and PDFs over 4 MB are rejected (→ `413`), so neither turns into an opaque
platform error. Helium subsets the fonts it embeds, so the example PDF is under 100 KB.

Since rendering is public and a small document can cost several seconds of CPU, put the endpoint behind
Netlify's rate limiting (or auth) before exposing it widely, to limit cost-amplification abuse.
