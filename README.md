# Efficio Contabilidade

Repositório da Efficio Contabilidade:

- **Landing page** (raiz): site estático (HTML, CSS e JavaScript puros, sem build).
- **Sistema financeiro** (`sistema/`): gestão financeira da empresa — clientes com importação da
  Receita Federal, honorários por vigência anual, fornecedores, contas a pagar e a receber e
  relatórios. Monorepo pnpm (API Fastify + PostgreSQL, web React). Veja
  [`sistema/README.md`](sistema/README.md).

## Landing page

- `index.html` — conteúdo da página
- `styles.css` — estilos (cor da marca: `#004AAD`)
- `script.js` — menu mobile, animações e formulário que abre o WhatsApp
- `assets/` — logo, logo branco (rodapé) e favicon

Para visualizar, basta abrir o `index.html` no navegador. Para publicar, envie os arquivos para qualquer hospedagem estática (GitHub Pages, Netlify, Vercel, Hostinger etc.).

## Sistema financeiro

```bash
cd sistema
pnpm install
docker compose up -d db
cp apps/api/.env.example apps/api/.env
pnpm db:migrate && pnpm db:seed   # demo@efficio.app / demo12345
pnpm dev                          # http://localhost:5173
```

Sem servidor: `pnpm --filter @effinance/web dev:demo` roda o sistema inteiro no navegador
(dados de demonstração do escritório).
