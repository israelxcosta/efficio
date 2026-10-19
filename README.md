# Efficio Contabilidade — Landing page

Site estático (HTML, CSS e JavaScript puros, sem build).

- `index.html` — conteúdo da página
- `styles.css` — estilos (cor da marca: `#004AAD`)
- `script.js` — menu mobile, animações e formulário que abre o WhatsApp
- `assets/` — logo, logo branco (rodapé) e favicon

Para visualizar, basta abrir o `index.html` no navegador. Para publicar, envie os arquivos para qualquer hospedagem estática (GitHub Pages, Netlify, Vercel, Hostinger etc.).

## Propostas comerciais

- `propostas/mineirinho-carretas.html` — proposta para a Mineirinho Carretas (6 páginas A4, com a identidade visual do site)

Cada proposta é um arquivo único (estilos, script e logos embutidos), que pode ser editado direto no navegador:

1. Abra o arquivo no navegador e clique em qualquer texto para editar. A barra de formatação (negrito, itálico, sublinhado, alinhamento, tamanho da fonte e limpar formatação) vale para o campo onde está o cursor.
2. Ao clicar num texto, aparecem alças para ajustar o campo: **↔** na lateral muda a largura, **↕** embaixo muda a altura, **Mover** em cima reposiciona o campo para cima ou para baixo (o conteúdo abaixo acompanha) e **↺** volta ao original. Se uma folha passar do tamanho A4, uma linha vermelha mostra onde ela termina.
3. Os campos destacados em amarelo ainda precisam ser preenchidos; o botão **campos a preencher** leva a cada um deles.
4. O nome do cliente, o responsável, a data e a validade são editados na capa e atualizados nas demais páginas.
5. Na tabela de honorários, digite os valores (ex.: `1500`) e o total mensal é calculado. Use **+ Adicionar serviço** ou o **×** para incluir ou remover linhas.
6. As alterações ficam salvas no navegador. Use **Baixar cópia** (ou Ctrl+S) para guardar um arquivo `.html` com as alterações, que continua editável. Para um novo cliente, baixe uma cópia e edite.
7. **Imprimir / PDF** gera o documento final; no diálogo de impressão, escolha "Salvar como PDF".

## Boleto PIX

- `boletos/boleto-pix.html` — modelo de cobrança via PIX no formato de um boleto tradicional (recibo do pagador, linha de corte e via de pagamento), sem código de barras

Usa o mesmo editor das propostas (edição direta, campos a preencher, formatação, baixar cópia e imprimir), com alguns detalhes próprios:

1. **QR Code:** clique no quadro, arraste o arquivo para a página ou copie a imagem e use Ctrl+V. O **×** (ou a tecla Delete) remove a imagem. Use a imagem só do QR Code gerado pelo banco.
2. **PIX Copia e Cola:** cole o código gerado pelo banco no campo ao lado do QR Code.
3. **Valor do documento:** é o total do demonstrativo, repetido no recibo e na via de pagamento. Use **+ Adicionar item** para incluir outros serviços.
4. Pagador, CPF/CNPJ, vencimento, data, competência e nº do documento são preenchidos no recibo (parte de cima) e aparecem também na via de pagamento.
5. Para cada cobrança, preencha e use **Baixar cópia** para guardar um arquivo por cliente/mês, ou **Imprimir / PDF** para enviar.
