# Onboarding do cliente — modelo dos slides

Formato: um bloco por slide. **Título** (≤ 6 palavras) · *Apoio* (≤ 2 linhas) · itens (≤ 5).

**Regra do dono (20/11/2026): o onboarding não mostra vencimentos de obrigações acessórias** (DCTFWeb,
EFD-Reinf, eSocial, DEFIS, DASN-SIMEI, ECD/ECF, SPED, informe de rendimentos…): essa informação só importa
ao escritório. O documento mostra **só o que o cliente entrega e quando** (prazos internos dos Parâmetros) e
os prazos trabalhistas que o próprio cliente cumpre (salário até o 5º dia útil, aviso de férias 30 dias antes e
pagamento 2 dias antes, verbas rescisórias em até 10 dias, 13º). Guias: "pague até o vencimento indicado nela".

Marcações para o sistema:
- `{{campo}}` = preenchido a partir do cadastro do cliente ou dos dados do escritório.
- `[se regime = simples|mei|presumido|real]` = o bloco só aparece para os regimes listados.
- `[se empregados > 0]` / `[se empregados = 0]` = troca só a frase; **todas as seções aparecem sempre**, com ou sem empregados.
- `→ tabela X · regime` = inserir as linhas da tabela correspondente em "Variações por regime" (fim do documento).

Campos: `{{razaoSocial}}`, `{{nomeFantasia}}`, `{{cnpj}}`, `{{regime}}`, `{{clienteDesde}}`, `{{empregados}}`,
`{{sindicato}}`, `{{atualizadoEm}}`, `{{mesExemplo}}` (ex.: 10/2026), `{{escritorio.whatsapp}}`,
`{{escritorio.email}}`, `{{escritorio.horario}}`, `{{escritorio.crc}}`.

---

## 1 · Capa
**Efficio Contabilidade**
*Onboarding do cliente*
### {{razaoSocial}}
- {{nomeFantasia}} · CNPJ {{cnpj}}
- {{regime}}
- Cliente desde {{clienteDesde}}
- {{empregados}} empregados · {{sindicato}}
- Atualizado em {{atualizadoEm}}

---

## 2 · Sumário
*Leitura de 10 minutos. Este link mostra sempre a versão mais recente; baixe o PDF para guardar.*
1. Como trabalhamos juntos
2. O que fazemos e o que você envia
3. Documentos e como enviar
4. Empregados: registro, férias, rescisão e avisos
5. Atenção às multas e primeiros passos

---

## 3 · Como trabalhamos juntos
*Você cuida da {{nomeFantasia}}. Nós cuidamos dos impostos, da contabilidade e da folha.*
- **Você envia** os documentos por e-mail até as datas combinadas.
- **Nós apuramos** e mandamos as guias prontas.
- **Você paga** cada guia até o vencimento.
- **Vai mudar algo?** Avise antes: contratação, demissão, férias, compra de bens.
- **Na dúvida, pergunte antes de decidir.** Prevenir custa menos que corrigir.

---

## 4 · Seu time e canais
*Cada assunto tem seu departamento. Para conversas rápidas, use o WhatsApp do escritório.*
- **Fiscal** · notas fiscais, impostos e declarações · fiscal@efficio.com.br
- **Contábil** · extratos, balanço, pró-labore e lucros · contabilidade@efficio.com.br
- **Pessoal** · folha, admissão, férias, rescisão e eSocial · pessoal@efficio.com.br
- **WhatsApp** {{escritorio.whatsapp}} · **e-mail geral** {{escritorio.email}}
- **Atendimento** {{escritorio.horario}}

---

## 5 · Suas obrigações em números
*O que entregamos pela sua empresa todo mês e todo ano.*
- `[se regime = mei]` **2 · Fiscal** · DAS-MEI mensal e DASN-SIMEI anual
- `[se regime = mei]` **1 · Contábil** · controle de receitas e livro caixa
- `[se regime = simples]` **2 · Fiscal** · DAS mensal e DEFIS anual
- `[se regime = simples]` **2 · Contábil** · balancete mensal e balanço anual
- `[se regime = presumido]` **4 · Fiscal** · PIS/COFINS, IRPJ/CSLL trimestrais, DCTFWeb e EFD-Contribuições
- `[se regime = real]` **4 · Fiscal** · PIS/COFINS, IRPJ/CSLL por estimativa, DCTFWeb e EFD-Contribuições
- `[se regime = presumido|real]` **3 · Contábil** · balancete mensal, ECD e ECF anuais
- `[se empregados > 0]` **5 · Pessoal** · folha, eSocial, FGTS, DCTFWeb e obrigações anuais
- `[se empregados = 0]` **Pessoal** · nada hoje; quando contratar, cuidamos de tudo
- **Suas datas no mês** · dia 1º, dia 10 e 5º dia útil

---

## 6 · Fiscal
*O que fazemos por você, o que precisamos e até quando. Os prazos do governo ficam com a gente.*
- `[se regime = mei]` → tabela Fiscal · MEI
- `[se regime = simples]` → tabela Fiscal · Simples Nacional
- `[se regime = presumido]` → tabela Fiscal · Lucro Presumido
- `[se regime = real]` → tabela Fiscal · Lucro Real

---

## 7 · Contábil
*A contabilidade em dia permite distribuir lucros com segurança.*
- `[se regime = mei]` → tabela Contábil · MEI
- `[se regime = simples]` → tabela Contábil · Simples Nacional
- `[se regime = presumido]` → tabela Contábil · Lucro Presumido
- `[se regime = real]` → tabela Contábil · Lucro Real

---

## 8 · Pessoal
*`[se empregados > 0]` Seus {{empregados}} empregados geram obrigações todo mês. A maior parte é com a gente.*
*`[se empregados = 0]` Hoje você não tem empregados. Quando contratar, é assim que funciona.*
- **Folha e salários** · variáveis da folha; depois, pagar os salários · dia 1º; salários até o 5º dia útil
- **eSocial** · Nada: fazemos a partir da folha e dos seus avisos · —
- **FGTS Digital** · pagar a guia que enviamos · até o vencimento da guia
- **DCTFWeb (INSS e IRRF da folha)** · Nada para declarar: só pagar o DARF que enviamos · até o vencimento do DARF
- **13º salário** · pagar as duas parcelas com os recibos que enviamos · 30/11 e 20/12

---

## 9 · Seu mês em uma linha
*Só as datas em que você faz algo. O resto é com a gente.*
- **Até o dia 1º** · você envia as variáveis da folha e o pró-labore do mês anterior (MEI: só as variáveis)
- **Até o 5º dia útil** · você paga os salários
- **Até o dia 10** · você envia notas fiscais, extratos e maquininhas/PIX do mês anterior
- **Até o vencimento da guia** · você paga cada guia no vencimento indicado nela; enviamos antes

---

## 10 · Documentos e extratos
*Documento atrasado atrasa a guia. E guia atrasada tem multa e juros.*
- **Notas fiscais** · emitidas e recebidas, com XML quando houver · dia 10
- **Extratos bancários** · todas as contas e aplicações, mês completo, em PDF ou OFX · dia 10
- **Maquininhas e PIX** · relatório de vendas do mês de cada operadora · dia 10
- **Variáveis da folha** · faltas, atestados, horas extras e comissões · dia 1º do mês seguinte
- **Mudanças na empresa** · sócios, endereço, atividade, empréstimos, compra de bens · antes de assinar

---

## 11 · Como enviar
*Sempre por e-mail, para o departamento certo, com o assunto no padrão abaixo.*
- **fiscal@efficio.com.br** · notas fiscais e maquininhas · `Notas fiscais {{mesExemplo}} | {{razaoSocial}}`
- **contabilidade@efficio.com.br** · extratos e contratos · `Extratos bancários {{mesExemplo}} | {{razaoSocial}}`
- **pessoal@efficio.com.br** · variáveis da folha · `Variáveis da folha {{mesExemplo}} | {{razaoSocial}}`
- **pessoal@efficio.com.br** · admissão, férias, rescisão · `Registro de empregado | {{razaoSocial}}`
- **Assunto padrão** · tipo do documento + mês/ano + razão social: assim nada se perde

---

## 12 · Registro de empregado
*Ninguém começa a trabalhar sem registro. Nem "só para testar".*
- **3 dias úteis antes** · envie dados e documentos para pessoal@ · assunto `Registro de empregado | {{razaoSocial}}`
- **Antes do 1º dia** · você agenda o exame admissional (ASO) e nos envia o atestado
- **Nós registramos** · o empregado no eSocial e enviamos o contrato para assinar
- **No 1º dia** · empregado assina o contrato e começa a trabalhar
- **Experiência de até 90 dias** · decida antes do fim se vai efetivar

---

## 13 · Férias
*Três datas, contadas para trás a partir do 1º dia de férias.*
- **30 dias antes** · você avisa o empregado por escrito, com o período (lei: art. 135 da CLT)
- **5 dias antes** · você nos pede as férias por e-mail: nome, período e aviso assinado
- **2 dias antes** · você paga férias + 1/3 com o recibo que enviamos (art. 145 da CLT)
- **Pode dividir em até 3 partes** · uma com 14 dias ou mais; as outras com 5 ou mais
- **Prazo para tirar** · 12 meses após completar o período; depois, pagamento em dobro (art. 137)

---

## 14 · Rescisão
*Antes de falar com o empregado, fale com a gente.*
- **Antes de comunicar** · peça a rescisão para pessoal@: tipo de desligamento, data e aviso prévio
- **Nós calculamos** · verbas, FGTS e regras da convenção coletiva ({{sindicato}})
- **Até 10 dias corridos** · pague as verbas e entregue os documentos (art. 477 da CLT)
- **No mesmo prazo** · pague a guia do FGTS rescisório que enviamos; nós cuidamos do eSocial
- **Sindicato** · quando a convenção exige, nós fazemos a homologação ou assistência

---

## 15 · Quando nos avisar
*Nós cuidamos do eSocial. Você só precisa nos avisar a tempo, por pessoal@.*
Movimentação · quando nos avisar · o que enviar:
- **Admissão** · {{prazos.admissao}} (3 dias úteis) antes do 1º dia · dados e documentos do empregado
- **Férias** · {{prazos.ferias}} (5 dias) antes da saída · nome, período e aviso assinado
- **Rescisão** · antes de comunicar o empregado · tipo de desligamento, data e aviso prévio
- **Afastamentos, atestados e acidente de trabalho** · no mesmo dia · atestado ou relato, data e motivo
- **Salário, cargo ou jornada** · antes de aplicar a mudança · o que muda e a partir de quando
- **Variáveis da folha** · até o {{prazos.folha}} (dia 1º) do mês seguinte · faltas, horas extras e comissões

---

## 16 · Atenção: multas
*Quase todas se evitam com um aviso antes.*
- **Documentos atrasados** · atrasam guias e declarações; a multa por atraso é da empresa
- **Trabalho antes do registro** · multa por empregado, a partir de R$ 800 em ME/EPP (art. 47 da CLT)
- **Rescisão fora do prazo ou da convenção** · verbas depois de 10 dias: multa de um salário (art. 477 da CLT); a convenção coletiva pode prever outras
- **Férias fora do prazo** · pagamento em dobro (art. 137 da CLT)
- **Guia paga com atraso** · multa de 0,33% ao dia, até 20%, + juros Selic

---

## 17 · Primeiros passos
*Para começar em {{clienteDesde}}. Envie cada item por e-mail; acompanhamos pelo sistema.*
- **Contrato social** e última alteração `[se regime = mei]` (MEI: Certificado da Condição de MEI)
- **Procuração eletrônica** no e-CAC para a Efficio (ou certificado e-CNPJ)
- **Acessos** `[se regime = mei|simples]` do Simples Nacional, da prefeitura e da Sefaz `[se regime = presumido|real]` da prefeitura e da Sefaz (notas fiscais)
- **Fechamento do mês anterior** com o contador anterior: balancete, extratos e guias pagas
- `[se empregados > 0]` **Empregados** · fichas, últimas folhas, férias vencidas e 13º já pago

---

## 18 · Li e entendi
*Para confirmar, informe seu nome e CPF. Registramos data e hora da leitura.*
- **Nome** · **CPF** · **[ Confirmar leitura ]**
- **Dúvidas?** WhatsApp {{escritorio.whatsapp}} · {{escritorio.email}}
- **Atendimento** {{escritorio.horario}}
- *Efficio Contabilidade · CRC {{escritorio.crc}} · Bem-vindos!*

---

## Variações por regime

Formato das linhas: **o que fazemos** · o que precisamos de você · até quando. Sem prazo legal (regra do dono,
20/11/2026). "Até quando" = prazos internos dos Parâmetros: notas e extratos até o **dia 10** do mês seguinte;
variáveis da folha e pró-labore até o **dia 1º**; DEFIS até **15/02**. Obrigação que fazemos sem precisar de
nada: "Nada: fazemos a partir de …" e "—" em "até quando". As linhas das tarefas recorrentes vêm de
`ONBOARDING_OBLIGATION_TEXTS`; a tarefa sem texto próprio usa "documentos do mês · dia 10 do mês seguinte".

### MEI
**Fiscal**
- **DAS-MEI** · pagar a guia; avise se o faturamento chegar perto do limite do MEI · até o vencimento da guia
- **DASN-SIMEI** · notas e relatório de receitas de cada mês · dia 10 do mês seguinte

**Contábil**
- **Controle de receitas e livro caixa** · extratos de todas as contas · dia 10 do mês seguinte
- **Pró-labore e distribuição de lucros** · Nada: não se aplicam ao MEI; sua contribuição ao INSS já está no DAS-MEI · —

### Simples Nacional
**Fiscal**
- **PGDAS-D e DAS** · notas emitidas e recebidas; depois, pagar o DAS que enviamos · dia 10 do mês seguinte
- **DCTFWeb** · Nada para declarar: só pagar o DARF que enviamos · até o vencimento do DARF
- **EFD-Reinf** · nota de serviço com retenção (INSS, IR, PIS/COFINS/CSLL) · sempre que houver, no dia em que receber
- **DEFIS** · dados do ano: sócios e lucros distribuídos · 15/02
- **Vendas no cartão e PIX** · relatório de vendas de cada maquininha e do PIX (as operadoras informam ao fisco) · dia 10 do mês seguinte
- **Guias fora do DAS** (ICMS-ST, DIFAL, ISS retido) · notas de compra e de serviços contratados · dia 10 do mês seguinte

**Contábil**
- **Conciliação e balancete mensal** · extratos de todas as contas e aplicações · dia 10 do mês seguinte
- **Balanço anual** · Nada: fazemos a partir dos envios mensais · —
- **Pró-labore** · valor de cada sócio no mês · dia 1º do mês seguinte
- **Lucros dos sócios** · valor de cada retirada (acima de R$ 50 mil no mês por sócio, retém 10% de IR) · antes de retirar
- **ECD e ECF** · Nada: não se aplicam ao Simples Nacional · —

### Lucro Presumido
**Fiscal**
- **DCTFWeb** · Nada para declarar: só pagar o DARF que enviamos · até o vencimento do DARF
- **EFD-Reinf** · nota de serviço com retenção · sempre que houver, no dia em que receber
- **PIS/COFINS** · notas emitidas e recebidas · dia 10 do mês seguinte
- **EFD-Contribuições** · Nada: fazemos a partir das notas que você envia · —
- **EFD ICMS/IPI** · notas emitidas e recebidas; inventário do estoque uma vez por ano · dia 10 do mês seguinte
- **IRPJ e CSLL trimestrais** · notas e extratos de cada mês · dia 10 do mês seguinte

**Contábil**
- **ECD** e **ECF** · Nada: fazemos a partir dos envios mensais · —
- **Conciliação e balancete mensal** · extratos de todas as contas e aplicações · dia 10 do mês seguinte
- **Pró-labore** · valor de cada sócio no mês · dia 1º do mês seguinte
- **Lucros dos sócios** · valor de cada retirada (acima de R$ 50 mil/mês por sócio, retém 10% de IR) · antes de retirar

### Lucro Real
**Fiscal**: como o Presumido, com **IRPJ e CSLL — estimativa mensal** · notas e extratos de cada mês · dia 10 do mês seguinte.

**Contábil**
- **ECD** e **ECF** · Nada: fazemos a partir dos envios mensais · —
- **Conciliação e balancete mensal (base do IRPJ/CSLL)** · extratos de todas as contas e aplicações · dia 10 do mês seguinte
- **Inventário de estoque** · contagem do estoque em 31/12 · em janeiro `[prazo interno a definir]`
- **Pró-labore e lucros** · valor do pró-labore e de cada retirada de lucros · pró-labore no dia 1º; lucros antes de retirar

---

## Notas para o sistema e o designer (não vão para os slides)

### Conteúdo condicional
- **Seções de pessoal** (slides 8, 12–15): aparecem **sempre**, mesmo sem empregados (decisão do dono). Só muda a frase de apoio do slide 8 e os itens marcados `[se empregados > 0]` (slides 5, 17 e tabela MEI).
- **Sindicato**: `{{sindicato}}` traz o nome da CCT cadastrada; sem CCT, usar "convenção coletiva da sua categoria". A multa do sindicato (slide 16) é **genérica** para todos.
- **Por regime**: slides 5, 6, 7, 9 e 17 usam `[se regime = ...]`; slides 6 e 7 recebem as linhas da seção "Variações por regime".
- **EFD-Reinf**: só se a empresa toma serviço com retenção ou tem outro evento da Reinf.
- **EFD ICMS/IPI**: só para contribuinte de ICMS/IPI; o prazo varia por estado.
- **Simples com empregados**: no Anexo IV a contribuição patronal **não** está no DAS e vai no DARF da DCTFWeb; nos demais anexos o DARF é só o INSS/IR descontado (e o INSS do pró-labore).
- **Lucros > R$ 50 mil/mês**: todos os regimes, exceto MEI; norma questionada no STF (ADIs 7.912 e outras). Revisar se mudar.
- **13º de 2026**: 20/12/2026 cai no domingo → pagamento e DARF antecipam para sexta, 18/12/2026.

### Decisões do dono aplicadas (18/11/2026)
- Notas e extratos até o **dia 10**; variáveis da folha até o **dia 1º** (sem adiantamento na lista).
- Admissão 3 dias úteis antes; o **cliente agenda** o exame admissional.
- Férias: aviso ao empregado 30 dias antes (lei); pedido ao escritório **5 dias antes**; pagamento 2 dias antes.
- Rescisão: pedir ao escritório **antes de comunicar**; escritório faz homologação/assistência quando a CCT exige.
- Envio **sempre por e-mail** (fiscal@, contabilidade@, pessoal@) com assunto padrão.
- Equipe só por departamento; link sempre na versão atual; "Confirmar leitura" com nome e CPF.
- Retirada a promessa de lembrete por WhatsApp (o sistema ainda não envia).

### A confirmar com o dono
- [ ] Assuntos de e-mail além dos dois definidos: `Notas fiscais MM/AAAA | RAZÃO SOCIAL` e `Variáveis da folha MM/AAAA | RAZÃO SOCIAL` (sugestão, mesmo padrão).
- [ ] Departamento que recebe o relatório das maquininhas (sugestão: fiscal@).
- [ ] Valor/alteração do pró-labore junto com as variáveis, até o **dia 1º** (antes era dia 25).
- [ ] "Sem adiantamento": entendido como "adiantamento salarial não entra nas variáveis". Confirmar.
- [ ] DEFIS: confirmação de sócios e lucros do ano até **15/02** (vinha do esboço).
- [ ] Inventário de estoque (Lucro Real e quem tem ICMS): prazo interno.
- [ ] Dados do escritório: WhatsApp, e-mail geral, horário e CRC (campos `{{escritorio.*}}`).

### Prazos legais conferidos (vigência 2026) — referência do escritório, **não vão para o documento do cliente**
- DCTFWeb: último dia útil do mês seguinte (IN RFB 2.237/2024, alterada pela IN RFB 2.248/2025). DARF continua no dia 20 (previdenciário) e nas datas de cada tributo.
- PIS/COFINS: dia 25 do mês seguinte, antecipando se não for dia útil (Lei 11.933/2009).
- IRPJ/CSLL trimestrais e estimativa mensal: último dia útil do mês seguinte (Lei 9.430/1996).
- EFD-Contribuições: 10º dia útil do 2º mês seguinte (IN RFB 1.252/2012). ECD: último dia útil de junho; ECF: último dia útil de julho (IN RFB 2.003/2021 e 2.004/2021).
- DEFIS 31/03; DASN-SIMEI 31/05; DAS e DAS-MEI dia 20.
- Lucros e dividendos: 10% acima de R$ 50 mil/mês por sócio, desde jan./2026 (Lei 15.270/2025).
- Demais prazos: conforme a referência do agente (FGTS dia 20; eSocial dia 15; S-2200 dia anterior; S-2299 e rescisão 10 dias; art. 135/145/137 da CLT; 13º 30/11 e 20/12).
