# syntax=docker/dockerfile:1.28@sha256:bb22d9815c728170f72750f4e5b0d672e06176142e1d602c7e66c050100b7e5b
# Imagem do Caddy com o build de produção do web (apps/web/dist) embutido. Contexto = sistema/:
#   docker build -f deploy/web.Dockerfile -t efficio-web .
# Ignore específico deste Dockerfile: deploy/web.Dockerfile.dockerignore (precisa de apps/web/src).
#
# Cabe no VPS de 4 GB: só `vite build` (o typecheck roda no CI), Node limitado a 1,5 GB de heap.
# Sem segredos: o bundle não recebe nenhuma variável (VITE_* não são usadas no build de produção).

FROM node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NODE_OPTIONS=--max-old-space-size=1536
# pnpm com versão + sha512 fixados em package.json#packageManager.
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @effinance/web...
COPY packages/shared packages/shared
COPY apps/web apps/web
COPY deploy/csp-header.mjs deploy/
# Build normal (não o demo). A CSP da <meta> injetada no index.html vira o cabeçalho do Caddy, com
# as diretivas que só valem em cabeçalho; Open Finance desligado = nenhum iframe permitido.
RUN pnpm --filter @effinance/web exec vite build \
 && if find apps/web/dist -name '*.map' | grep -q .; then echo 'source map no build' >&2; exit 1; fi \
 && node deploy/csp-header.mjs apps/web/dist/index.html /repo/csp.caddy

FROM caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0
# Usuário sem privilégio. A capability de arquivo do binário sai: o contêiner roda sem nenhuma
# (cap_drop ALL + no-new-privileges) e abre 80/443 via sysctl ip_unprivileged_port_start=0.
RUN setcap -r /usr/bin/caddy \
 && addgroup -S -g 10002 web \
 && adduser -S -D -H -u 10002 -G web -s /sbin/nologin web \
 && mkdir -p /data/caddy /config/caddy \
 && chown -R 10002:10002 /data /config
COPY --chmod=0644 deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chmod=0644 /repo/csp.caddy /etc/caddy/csp.caddy
# Arquivos do site pertencem ao root (somente leitura para o processo).
COPY --from=build /repo/apps/web/dist /srv
USER 10002:10002
EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -T 3 -O /dev/null http://127.0.0.1:8081/healthz || exit 1
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
