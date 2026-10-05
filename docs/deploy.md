# Deployment

The web app is a static build served by nginx at <https://cube.mrdenzzz.ru>. Every push to `main`
that passes CI is deployed by the `deploy` job in [ci.yml](../.github/workflows/ci.yml).

## Pipeline

1. The `web` job builds `apps/web/dist` (including the WASM module) and uploads it as an artifact.
2. The `deploy` job runs only for pushes to `main`, after both CI jobs pass, in the `production`
   environment (restricted to the `main` branch).
3. It writes a `.gz` copy next to every compressible file; nginx serves those through
   `gzip_static` instead of compressing on each request.
4. It uploads with `rsync --checksum --delay-updates --delete-after`: unchanged content-hashed
   assets are skipped, new files are moved into place together at the end, and stale files are
   removed last.

## Server

- nginx site: [deploy/nginx/zz-cube-solver.conf](../deploy/nginx/zz-cube-solver.conf), installed as
  `/etc/nginx/sites-available/zz-cube-solver` and linked from `sites-enabled`; shared headers in
  [deploy/nginx/cube-solver-headers.conf](../deploy/nginx/cube-solver-headers.conf), installed into
  `/etc/nginx/snippets/`.
- Headers: COOP `same-origin` and COEP `require-corp` for cross-origin isolation, HSTS, `nosniff`,
  a referrer policy, and a permissions policy that allows only the camera. `.wasm` is served as
  `application/wasm`. Hashed `/assets/` are cached for a year; everything else is revalidated.
- TLS: Let's Encrypt via certbot's webroot authenticator (`/var/www/letsencrypt`); renewal reloads
  nginx.
- Uploads: user `deploy` with a locked password. Its only key is limited to
  `restrict,command="/usr/bin/rrsync -wo /var/www/cube.mrdenzzz.ru"`, so it can write into the site
  directory and nothing else: no shell, no forwarding, no reads.

## Secrets (environment `production`)

| Name                 | Content                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `DEPLOY_SSH_KEY`     | Private ed25519 key of the `deploy` user                                         |
| `DEPLOY_KNOWN_HOSTS` | `ssh-keyscan -t ed25519 cube.mrdenzzz.ru`, checked against the known fingerprint |

## Setting up a server from scratch

```sh
# DNS: A record cube.mrdenzzz.ru -> server address
useradd --create-home --shell /bin/bash deploy
install -d -m 755 -o deploy -g deploy /var/www/cube.mrdenzzz.ru
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
# authorized_keys line for deploy:
#   restrict,command="/usr/bin/rrsync -wo /var/www/cube.mrdenzzz.ru" ssh-ed25519 AAAA... cube-solver-ci-deploy

# 1. Enable only the port 80 server block, reload nginx, then issue the certificate:
certbot certonly --webroot -w /var/www/letsencrypt -d cube.mrdenzzz.ru \
  --deploy-hook "systemctl reload nginx"
# 2. Install the full site config and the headers snippet, then:
nginx -t && systemctl reload nginx
```
