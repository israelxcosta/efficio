# Onboarding do cliente — modelo dos slides

Formato: um bloco por slide. **Título** (≤ 6 palavras) · *Apoio* (≤ 2 linhas) · itens (≤ 5).

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
2. Suas obrigações e prazos
3. Documentos e como enviar
4. Empregados: registro, férias, rescisão, eSocial
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
- **Suas datas no mês** · dia 1º, dia 10, 5º dia útil e dia 20 `[se regime = presumido|real]` + dia 25

---

## 6 · Fiscal
*Obrigação · prazo legal · o que precisamos de você.*
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
- **Folha e salários** · até o 5º dia útil · variáveis da folha até o **dia 1º** do mês seguinte
- **eSocial** · dia 15 do mês seguinte · nada: enviamos a partir da folha
- **FGTS Digital** · dia 20 do mês seguinte · pagar a guia que enviamos
- **DCTFWeb e DARF** (INSS e IR descontados) · DARF dia 20; declaração no último dia útil · pagar o DARF
- **13º e informe de rendimentos** · 13º em 30/11 e 20/12; informe até o último dia útil de fevereiro · nada: preparamos tudo

---

## 9 · Seu mês em uma linha
*Data em fim de semana ou feriado pode antecipar ou adiar: a guia que enviamos já vem com o vencimento certo.*
- **Dia 1º** · você envia as variáveis da folha do mês anterior
- **Até o 5º dia útil** · você paga os salários
- **Dia 10** · você envia notas fiscais e extratos do mês anterior
- **Dia 15** · nós enviamos o eSocial · **Dia 20** · você paga `[se regime = mei]` DAS-MEI `[se regime = simples]` DAS `[se regime = presumido|real]` DARFs, FGTS e INSS
- `[se regime = presumido|real]` **Dia 25** · você paga PIS e COFINS

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
- **Até o dia anterior** · registramos no eSocial (S-2200) e enviamos o contrato
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
- **No mesmo prazo** · guia do FGTS rescisório e baixa no eSocial (S-2299)
- **Sindicato** · quando a convenção exige, nós fazemos a homologação ou assistência

---

## 15 · Prazos do eSocial
*Nós enviamos. Você só precisa nos avisar a tempo.*
- **Admissão (S-2200)** · até o dia anterior ao início
- **Desligamento (S-2299)** · até 10 dias após
- **Acidente de trabalho (S-2210)** · 1º dia útil seguinte; avise no mesmo dia
- **Folha do mês (S-1200 e S-1299)** · dia 15 do mês seguinte
- **Afastamentos, alterações e exames (S-2230, S-2206, S-2220)** · dia 15 do mês seguinte

---

## 16 · Atenção: multas
*Quase todas se evitam com um aviso antes.*
- **Rescisão fora das regras do sindicato** · a convenção coletiva da sua categoria pode prever multa
- **Verbas fora do prazo** · pagou depois de 10 dias: multa de um salário ao empregado (art. 477 da CLT)
- **Trabalho antes do registro** · multa por empregado, a partir de R$ 800 em ME/EPP (art. 47 da CLT)
- **Guia paga com atraso** · multa de 0,33% ao dia, até 20%, + juros Selic
- **Férias fora do prazo** · pagamento em dobro (art. 137 da CLT)

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

Formato das linhas: **obrigação** · prazo legal · o que precisamos de você. Prazos internos do escritório:
notas e extratos até o **dia 10**; variáveis da folha até o **dia 1º** do mês seguinte.

### MEI
**Fiscal**
- **DAS-MEI** · dia 20 de cada mês · pagar a guia; avise se o faturamento chegar perto do limite do MEI
- **DASN-SIMEI** (ano anterior) · 31/05 · notas e relatório de receitas de cada mês até o dia 10
- `[se empregados > 0]` **FGTS Digital** (MEI pode ter 1 empregado) · dia 20 do mês seguinte · pagar a guia
- `[se empregados > 0]` **DCTFWeb e DARF** (INSS do empregado + 3% patronal) · DARF dia 20; declaração no último dia útil · pagar o DARF

**Contábil**
- **Controle de receitas e livro caixa** · sem prazo legal (recomendado) · extratos de todas as contas até o dia 10
- **Pró-labore e distribuição de lucros** · não se aplicam ao MEI: sua contribuição ao INSS já está no DAS-MEI

### Simples Nacional
**Fiscal**
- **PGDAS-D e DAS** · dia 20 do mês seguinte · notas emitidas e recebidas e relatório das maquininhas até o dia 10
- **Vendas no cartão e PIX** · as operadoras informam ao fisco · relatório das maquininhas até o dia 10
- **DEFIS** (ano anterior) · 31/03 · confirmar sócios e lucros distribuídos no ano
- **Guias fora do DAS** (ICMS-ST, DIFAL, ISS retido) · conforme estado e prefeitura · notas de compra até o dia 10
- `[cond: serviço tomado com retenção]` **EFD-Reinf** · dia 15 do mês seguinte · envie a nota no dia em que receber

**Contábil**
- **Conciliação e balancete** · mensal · extratos de todas as contas até o dia 10
- **Balanço anual** · contas aprovadas pelos sócios até 30/04 (art. 1.078 do Código Civil) · nada além dos envios mensais
- **Pró-labore** · mensal, com INSS (DCTFWeb e DARF dia 20) · valor de cada sócio até o dia 1º
- **Lucros dos sócios** · acima de R$ 50 mil no mês por sócio, retenção de 10% de IR (Lei 15.270/2025) · avise **antes** de retirar
- **ECD e ECF** · não se aplicam ao Simples Nacional

### Lucro Presumido
**Fiscal**
- **PIS e COFINS** (cumulativos) · dia 25 do mês seguinte (antecipa se não for dia útil) · notas emitidas e recebidas até o dia 10
- **IRPJ e CSLL** · trimestrais: último dia útil de abril, julho, outubro e janeiro (pode dividir em 3 quotas) · notas até o dia 10
- **DCTFWeb** (todos os tributos federais) · último dia útil do mês seguinte · nada: declaramos a partir da apuração
- **EFD-Contribuições** · 10º dia útil do 2º mês seguinte · nada além das notas
- `[cond: contribuinte de ICMS/IPI]` **EFD ICMS/IPI e ICMS** · conforme o estado · notas e inventário de estoque; `[cond: retenções]` **EFD-Reinf** dia 15

**Contábil**
- **Conciliação e balancete** · mensal · extratos de todas as contas até o dia 10
- **ECD** (livros contábeis digitais) · último dia útil de junho · nada além dos envios mensais
- **ECF** (escrituração contábil fiscal) · último dia útil de julho · nada além dos envios mensais
- **Pró-labore** · mensal, com INSS · valor de cada sócio até o dia 1º
- **Lucros dos sócios** · acima de R$ 50 mil no mês por sócio, retenção de 10% de IR (Lei 15.270/2025) · avise **antes** de retirar

### Lucro Real
**Fiscal**
- **PIS e COFINS** (não cumulativos, com créditos) · dia 25 do mês seguinte · notas de compra e venda até o dia 10
- **IRPJ e CSLL** · estimativa mensal: último dia útil do mês seguinte (ou trimestral, se for a opção) · notas e extratos até o dia 10
- **DCTFWeb** (todos os tributos federais) · último dia útil do mês seguinte · nada: declaramos a partir da apuração
- **EFD-Contribuições** · 10º dia útil do 2º mês seguinte · notas completas, com XML, até o dia 10
- `[cond: contribuinte de ICMS/IPI]` **EFD ICMS/IPI e ICMS** · conforme o estado · notas e inventário; `[cond: retenções]` **EFD-Reinf** dia 15

**Contábil**
- **Conciliação e balancete** · mensal (base da estimativa de IRPJ/CSLL) · extratos de todas as contas até o dia 10
- **Inventário de estoque** · posição em 31/12 · contagem do estoque em janeiro `[prazo interno a definir]`
- **ECD** · último dia útil de junho · nada além dos envios mensais
- **ECF** (com LALUR/LACS) · último dia útil de julho · nada além dos envios mensais
- **Pró-labore e lucros** · pró-labore com INSS (valor até o dia 1º); lucros acima de R$ 50 mil/mês por sócio retêm 10% de IR · avise **antes** de retirar

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

### Prazos legais conferidos (vigência 2026)
- DCTFWeb: último dia útil do mês seguinte (IN RFB 2.237/2024, alterada pela IN RFB 2.248/2025). DARF continua no dia 20 (previdenciário) e nas datas de cada tributo.
- PIS/COFINS: dia 25 do mês seguinte, antecipando se não for dia útil (Lei 11.933/2009).
- IRPJ/CSLL trimestrais e estimativa mensal: último dia útil do mês seguinte (Lei 9.430/1996).
- EFD-Contribuições: 10º dia útil do 2º mês seguinte (IN RFB 1.252/2012). ECD: último dia útil de junho; ECF: último dia útil de julho (IN RFB 2.003/2021 e 2.004/2021).
- DEFIS 31/03; DASN-SIMEI 31/05; DAS e DAS-MEI dia 20.
- Lucros e dividendos: 10% acima de R$ 50 mil/mês por sócio, desde jan./2026 (Lei 15.270/2025).
- Demais prazos: conforme a referência do agente (FGTS dia 20; eSocial dia 15; S-2200 dia anterior; S-2299 e rescisão 10 dias; art. 135/145/137 da CLT; 13º 30/11 e 20/12).
