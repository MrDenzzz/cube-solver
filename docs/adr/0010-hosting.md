# 0010. Hosting: nginx on our own server, for cross-origin isolation

- **Status:** Accepted
- **Date:** 2026-10-07

## Context

- `SharedArrayBuffer` exists only in cross-origin isolated documents, which requires the
  responses to carry `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` (or `credentialless`) [mdn-sab], [coop-coep]. The
  app relies on it for the search cancellation flag (ADR 0003) and for the optimal search's
  threads with tables in shared memory (ADR 0007): on 16 threads that search runs 11.6 times
  faster than on one.
- `WebAssembly.instantiateStreaming` accepts only `Content-Type: application/wasm`. The camera
  needs HTTPS and a permissions policy that allows it.
- The build is static: 0.4 kB of HTML, 98 kB of JavaScript and CSS before the page works (gzip),
  then three.js with the 3D view, 244 kB, loaded lazily; the solver worker is 17 kB and the
  WebAssembly module 33 kB. Pruning tables are built in the browser, not downloaded (ADR 0004).
- A server the author already runs (nginx 1.18 on Ubuntu 22.04, shared with other services) is
  available at no extra cost.

## Options

| Host                      | Response headers                                                                   | Notes                                         |
| ------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------- |
| GitHub Pages              | Fixed; isolation only through a service worker that re-serves every response [coi] | Needs a reload on the first visit; fragile    |
| Netlify, Cloudflare Pages | Configurable per path in a `_headers` file [netlify], [cloudflare]                 | Would work; another account and vendor        |
| nginx on our own server   | Full control                                                                       | Chosen; the server must be set up and kept up |

## Decision

- Serve `apps/web/dist` with nginx at <https://cube.mrdenzzz.ru>; configuration in
  `deploy/nginx`, setup and secrets in [docs/deploy.md](../deploy.md).
- Every response carries COOP `same-origin` and COEP `require-corp` (Safari has no
  `credentialless`), HSTS, `nosniff`, a referrer policy, and `Permissions-Policy:
camera=(self), microphone=(), geolocation=()`. The headers live in one snippet included by every
  location, because an `add_header` inside a location drops the inherited ones.
- `.wasm` is mapped to `application/wasm`, which nginx 1.18's `mime.types` lacks. Content-hashed
  `/assets/` are cached for a year as immutable; everything else is revalidated on each visit.
- CI precompresses text and WebAssembly files and nginx serves them with `gzip_static`. The
  deploy job runs only on `main` after the Rust, web and end-to-end jobs pass, and uploads with
  rsync as a user whose only key is restricted to writing into the site directory.

## Consequences

- The demo depends on one server in the Netherlands, without a CDN; an outage there takes it down
  until the server is back. Its setup is written down step by step to make a move easy.
- Any other host must send the same two headers. Without them the app still works, but cancelling
  replaces the worker and the optimal search runs on one thread (ADR 0003).
- Verified in production on 2026-10-07: the headers above on the page, `crossOriginIsolated` is
  true in Chrome, and the 3×3×3 and 4×4×4 flows run end to end.

## Sources

- [mdn-sab] MDN, SharedArrayBuffer, security requirements:
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
- [coop-coep] web.dev, "Making your website cross-origin isolated using COOP and COEP":
  https://web.dev/articles/coop-coep
- [coi] coi-serviceworker, cross-origin isolation through a service worker for hosts without
  header control: https://github.com/gzuidhof/coi-serviceworker
- [netlify] Netlify, custom headers: https://docs.netlify.com/routing/headers/
- [cloudflare] Cloudflare Pages, headers: https://developers.cloudflare.com/pages/configuration/headers/
