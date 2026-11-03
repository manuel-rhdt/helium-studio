# Helium Studio

An Overleaf-style editor for HTML documents: write HTML on the left, get a PDF on the right,
rendered by [helium](https://github.com/manuel-rhdt/helium) in a Netlify Function.

- `public/` – static frontend (CodeMirror editor, pdf.js viewer), no build step
- `netlify/functions/render.mjs` – `POST /api/render { html }` → `{ pdf (base64), log, ms }`
- `helium-bin/` – helium built for the Lambda runtime, plus the shared libraries and fonts it needs (build output, not committed)

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
