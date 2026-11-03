# Helium Studio

An Overleaf-style editor for HTML documents: write HTML on the left, get a PDF on the right,
rendered by [helium](https://github.com/manuel-rhdt/helium) in a Netlify Function.

- `public/` – static frontend (CodeMirror editor, pdf.js viewer), no build step
- `netlify/functions/render.mjs` – `POST /api/render { html }` → `{ pdf (base64), log, ms }`
- `helium-bin/` – helium built for the Lambda runtime, plus the shared libraries and fonts it needs

## Building helium

Netlify Functions run on Amazon Linux 2023 (glibc 2.34), so a binary built on a newer distro
won't load there. Build it in a matching container (needs Docker and a local rustup toolchain):

```bash
scripts/build-helium.sh            # uses ../helium; pass another checkout as the first argument
```

Commit `helium-bin/` afterwards; Netlify's build can't run Docker, so it deploys the prebuilt bundle.

## Running locally

```bash
scripts/dev.py                     # http://localhost:8888, function runs in the Lambda Node 22 image
```

`netlify dev` works too if you have the Netlify CLI.

## Deploying

Connect the repo to Netlify (no build command, publish directory `public`), or `netlify deploy --prod`.

Synchronous functions have a ~10 s timeout and a 6 MB response limit. The function guards both:
renders are cut off at 8 s (→ clean `422`) and PDFs over 4 MB are rejected (→ `413`), so neither
turns into an opaque platform error. PDFs embed whole fonts (~2 MB for the example).

Since rendering is public and a small document can cost several seconds of CPU, put the endpoint
behind Netlify's rate limiting (or auth) before exposing it widely, to limit cost-amplification abuse.
