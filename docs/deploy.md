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
- TCP 443 is shared with a VPN that also needs it (an Xray container). nginx's stream module,
  [deploy/nginx/tls-443.conf](../deploy/nginx/tls-443.conf) included from the main context of
  `nginx.conf`, reads the server name from each TLS ClientHello without decrypting anything: the
  sites' names go to nginx's HTTPS servers on `127.0.0.1:9443`, every other name to the VPN on
  `127.0.0.1:10443`. The sites therefore see every client as `127.0.0.1`. `worker_connections` is
  raised to 4096, since each proxied connection takes two.
- Headers: COOP `same-origin` and COEP `require-corp` for cross-origin isolation, HSTS, `nosniff`,
  a referrer policy, and a permissions policy that allows only the camera. `.wasm` is served as
  `application/wasm`. Hashed `/assets/` are cached for a year; everything else is revalidated.
- TLS: Let's Encrypt via certbot's webroot authenticator (`/var/www/letsencrypt`); renewal reloads
  nginx.
- Uploads: user `deploy` with a locked password. Its only key is limited to
  `restrict,command="/usr/bin/rrsync -wo /var/www/cube.mrdenzzz.ru"`, so it can write into the site
  directory and nothing else: no shell, no forwarding, no reads.

## Secrets (environment `production`)

| Name                 | Content                                                                              |
| -------------------- | ------------------------------------------------------------------------------------ |
| `DEPLOY_SSH_KEY`     | Private ed25519 key of the `deploy` user                                             |
| `DEPLOY_KNOWN_HOSTS` | `cube.mrdenzzz.ru ssh-ed25519 AAAA...`, from the server's `ssh_host_ed25519_key.pub` |

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
# 3. Only where 443 is shared: move the other service to 127.0.0.1:10443, install
#    tls-443.conf as /etc/nginx/tls-443.conf, add `include /etc/nginx/tls-443.conf;` at the end
#    of nginx.conf, and reload.
```

On a server where nothing else needs 443, the site can listen on it directly: `listen 443 ssl;`
in place of `listen 127.0.0.1:9443 ssl;`, and no router.
