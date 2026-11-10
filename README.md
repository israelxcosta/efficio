# Efficio Contabilidade — Landing page

Site estático (HTML, CSS e JavaScript puros, sem build).

- `index.html` — conteúdo da página
- `styles.css` — estilos (cor da marca: `#004AAD`)
- `script.js` — menu mobile, animações e formulário que abre o WhatsApp
- `assets/` — logo, logo branco (rodapé) e favicon
- `informativos/` — informativos para clientes, um por pasta

## Informativos

Cada informativo é uma página independente (HTML e CSS no mesmo arquivo), acompanhada das versões para envio:

- `informativos/escala-5x2/index.html` — fim da escala 6x1 e nova escala 5x2 (EC 141/2026)
- `informativos/escala-5x2/informativo-escala-5x2.pdf` — versão em PDF (A4, 4 páginas)
- `informativos/escala-5x2/infografico-escala-5x2.png` — infográfico em imagem, para WhatsApp e redes sociais

O PDF e a imagem são gerados a partir da página. Ao alterar o texto do `index.html`, gere os dois novamente (o PDF pode ser refeito pelo navegador, em Imprimir → Salvar como PDF).

Para visualizar, basta abrir o `index.html` no navegador. Para publicar, envie os arquivos para qualquer hospedagem estática (GitHub Pages, Netlify, Vercel, Hostinger etc.).
