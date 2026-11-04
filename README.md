# Helium Studio

An Overleaf-style editor: write Markdown with TeX math on the left, get a PDF on the right,
rendered by [helium](https://github.com/manuel-rhdt/helium) in a Netlify Function.

- `public/` – static frontend, no build step:
  - `markdown.js` – Markdown ([markdown-it](https://github.com/markdown-it/markdown-it)) with `$…$` and
    `$$…$$` math converted to MathML by [Temml](https://temml.org); runs in the browser
  - `styles.js` – the style settings (page, body text, headings, code, quotes, links) and the CSS built from them
  - `app.js`, `index.html`, `style.css` – CodeMirror editor, **Style**/**Outline** sidebar, pdf.js viewer
- `netlify/functions/render.mjs` – `POST /api/render { html }` → `{ pdf (base64), log, ms }`
- `helium-bin/` – helium built for the Lambda runtime, plus the shared libraries and fonts it needs (build output, not committed)

The browser turns the Markdown and the style settings into one HTML document, which is what the function
renders. The **HTML** switch above the editor shows that generated document (read-only). Raw HTML inside the
Markdown passes through.

## Helium's limits

Helium does not implement all of HTML and CSS, so some things do not render as they would in a browser:
Markdown tables, and TeX matrices and multi-line environments (`pmatrix`, `cases`, `aligned`) are flattened
because Helium has no table layout (`mtable` for math); the page is always A4; there is no letter spacing or
`text-transform`.

## Fonts

The style sidebar offers 16 families: STIX Two Text, DejaVu (serif, sans, mono), Latin Modern (roman, sans,
mono), Libertinus Serif, EB Garamond, Noto Serif, Liberation (serif, sans, mono), Source Sans 3, Source Code
Pro and Lato. Helium can only use fonts that are bundled with the function, so `scripts/build-fonts.sh` takes
them from Amazon Linux's font packages (`scripts/fonts.py` picks the faces). Helium subsets the fonts it
embeds, so the PDFs only carry the glyphs a document uses. To add a family, list it in `scripts/fonts.py`
and in `FONTS` in `public/styles.js`; a test checks that the two agree. Math uses STIX Two Math / Latin
Modern Math and is not affected by the font settings.

## Tests

```bash
npm ci && npm test                 # unit tests for markdown.js and styles.js (Node 22)
```

## Building helium

Netlify Functions run on Amazon Linux 2023 (glibc 2.34), so a binary built on a newer distro
won't load there. Build it in a matching container (needs Docker and a local rustup toolchain):

```bash
scripts/build-helium.sh            # uses ../helium; pass another checkout as the first argument
scripts/smoke-test.sh              # renders a document with it in the Lambda Node 22 image
```

`helium-bin/` is git-ignored; GitHub Actions builds it for every deploy (see below).

## Running locally

```bash
scripts/dev.py                     # http://localhost:8888, function runs in the Lambda Node 22 image
```

`netlify dev` works too if you have the Netlify CLI.

## Deploying

Netlify's build servers can't run Docker, so `.github/workflows/deploy.yml` does the build:
on every push to `main` (or manually from the Actions tab) it builds helium in the Amazon Linux
container, smoke-tests the render function and deploys with the Netlify CLI. Set these repository
secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `NETLIFY_AUTH_TOKEN` | Netlify personal access token |
| `NETLIFY_SITE_ID` | the site's ID (Site configuration → Site ID) |

Create the Netlify site without linking the repo (or turn off its automatic builds), since the
workflow does the deploying. Changes to helium itself don't trigger the workflow; re-run it from the
Actions tab, or add a workflow in the helium repo that sends a `repository_dispatch` event.

Synchronous functions have a ~10 s timeout and a 6 MB response limit. The function guards both:
renders are cut off at 8 s (→ clean `422`) and PDFs over 4 MB are rejected (→ `413`), so neither
turns into an opaque platform error. PDFs embed whole fonts (~2 MB for the example).

Since rendering is public and a small document can cost several seconds of CPU, put the endpoint
behind Netlify's rate limiting (or auth) before exposing it widely, to limit cost-amplification abuse.
