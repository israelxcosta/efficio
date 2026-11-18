# Onboarding do cliente — projeto (17/11/2026)

Pedido do dono: um onboarding por cliente ("Efficio Contabilidade · Onboarding do cliente · RAZÃO SOCIAL"), com
sumário, resumo das obrigações fiscais, contábeis e do pessoal, prazos de envio de documentos e extratos, como
pedir férias, rescisões e registro de empregados, prazos do eSocial e alertas (multas do sindicato da categoria
nas demissões). Fica na ficha do cliente; "Enviar onboarding" gera um link para mandar pelo WhatsApp e o sistema
registra data e hora de cada acesso. Esboço aprovado para discussão (prints no chat); decisões pendentes abaixo.

## Estrutura do documento
1. Capa: marca, razão social, CNPJ, regime, início com a Efficio, empregados e CCT, data de atualização.
2. Boas-vindas e equipe: responsável de cada departamento e canais (WhatsApp, e-mail, horário).
3. Resumo das obrigações: cartões por área e tabela obrigação · área · prazo legal · o que precisamos do cliente.
   Gerado das **tarefas recorrentes que valem para o cliente** (grupo do regime + próprias do escritório).
4. Seu mês em uma linha: linha do tempo com as datas do cliente (envios) e dos impostos.
5. Documentos e extratos: prazos internos do escritório (configuráveis).
6. Departamento pessoal: admissão, férias e rescisão em passos com antecedências.
7. Prazos do eSocial: S-2200, S-2299, S-2230, S-2210, S-1200/1299, S-2206, S-2220.
8. Atenção: multas comuns (texto do sindicato vem do cadastro do sindicato/CCT do cliente).
9. Primeiros passos: checklist de implantação e "Confirmar leitura".

## No sistema
- Ficha do cliente → menu "⋯" → **Enviar onboarding** (escolhe contato, validade, mensagem; abre o WhatsApp
  com `wa.me`) e **Ver onboarding** (prévia).
- Cartão "Onboarding" na ficha: enviado (quando, por quem), primeiro e último acesso, nº de acessos,
  leitura confirmada, validade; linha do tempo de acessos.
- Página pública `efficio.com.br/o/<token>`: sem login, token aleatório com validade, só leitura, sem dados
  sensíveis (sem senhas, valores de honorário ou documentos), `noindex`.
- Registro: cada abertura grava data/hora, aparelho (celular/computador) e IP truncado; "Confirmar leitura"
  grava nome informado e data/hora. Entra no registro de auditoria.

## Decisões do dono (18/11/2026)
- **Visual**: variação B (roxo moderno) — `docs/onboarding-esboco/slides-b.html`.
- Notas fiscais e extratos: até o **dia 10** do mês seguinte.
- Variáveis da folha (faltas, horas extras, comissões): até o **dia 1º** do mês seguinte; sem adiantamento.
- Admissão: dados **3 dias úteis** antes; o **cliente** agenda o exame admissional.
- Férias: o cliente pede ao escritório **5 dias antes** da saída do empregado (o aviso ao empregado continua
  sendo de 30 dias por lei, art. 135; pagamento até 2 dias antes, art. 145).
- Rescisão: o cliente **solicita ao escritório antes de comunicar** o empregado; o escritório faz a
  homologação/assistência sindical quando a CCT exige.
- Canal de documentos: **sempre e-mail** — fiscal@efficio.com.br, pessoal@efficio.com.br,
  contabilidade@efficio.com.br — com assunto padrão `Extratos bancários 10/2026 | EMPRESA` e
  `Registro de empregado | EMPRESA`.
- Equipe: só o departamento (sem nomes), com o WhatsApp do escritório. Dados do escritório (WhatsApp,
  e-mail, horário, CRC, logo) ainda a informar: ficam editáveis no modelo.
- Multa do sindicato: texto **genérico**.
- **Modelo único** editável pelo escritório, com ajuste por cliente.
- Mostrar **todas** as seções mesmo sem empregados (o cliente pode registrar no futuro).
- Envio: contatos do cadastro do cliente (e-mail e WhatsApp).
- Link válido por **30 dias**, com **download em PDF**; reenviar gera link novo.
- "Confirmar leitura" pede **nome e CPF**.
- Registrar data, hora, aparelho e cidade aproximada de cada acesso; citar na política de privacidade.
- O link mostra **sempre a versão atual**, com a data de atualização.
