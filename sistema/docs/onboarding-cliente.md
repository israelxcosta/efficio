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

## Decisões pendentes (perguntas ao dono)
Ver a mensagem do chat de 17/11/2026; respostas serão anotadas aqui antes de implementar.
