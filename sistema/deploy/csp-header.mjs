// Gera /etc/caddy/csp.caddy (cabeçalho Content-Security-Policy do Caddy) a partir da <meta> que o
// build de produção do web injeta em dist/index.html (apps/web/src/lib/csp.ts, com os hashes dos
// scripts inline). Acrescenta o que só vale em cabeçalho (frame-ancestors, upgrade-insecure-requests)
// e, com o Open Finance desligado neste servidor, não permite nenhum iframe.
//   node deploy/csp-header.mjs <dist/index.html> <saída>
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('uso: node csp-header.mjs <index.html> <saída>');
const html = readFileSync(input, 'utf8');
const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
if (!meta) throw new Error(`CSP <meta> ausente em ${input}`);
const directives = meta[1].split(';').map((d) => d.trim()).filter(Boolean);
if (!directives.some((d) => d.startsWith('frame-src '))) throw new Error('frame-src ausente na CSP');
const policy = [
  ...directives.map((d) => (d.startsWith('frame-src ') ? "frame-src 'none'" : d)),
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');
if (/["\\\r\n{}]/.test(policy)) throw new Error('CSP com caractere inesperado para o Caddyfile');
writeFileSync(output, `header Content-Security-Policy "${policy}"\n`);
console.log(policy);
