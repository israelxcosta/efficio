// Conteúdo dos 17 slides (fonte: onboarding/conteudo.md). **x** = destaque.
const V = (campo, t) => `<span class="var" data-campo="${campo}">${t}</span>`;
const CLI = V('razao_social', 'Padaria Pão Quente Ltda');
const CCT = V('cct', 'CCT da Panificação');
const md = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

module.exports = {
  V, CLI, CCT, md, total: 17,
  cover: {
    data: [
      ['CNPJ', V('cnpj', '11.222.333/0001-81')],
      ['Regime', V('regime', 'Simples Nacional · Anexo I')],
      ['Cliente desde', V('inicio', 'dezembro de 2026')],
      ['Equipe', `${V('empregados', '6 empregados')} · ${CCT}`],
      ['Atualizado em', V('atualizado_em', '18/11/2026')],
    ],
  },
  sumario: {
    lead: 'Leitura de 10 minutos. Guarde este link: ele é atualizado quando algo mudar.',
    items: ['Como trabalhamos juntos', 'Suas obrigações e prazos', 'Documentos e extratos', 'Seus empregados: registro, férias, rescisão, eSocial', 'Atenção às multas e primeiros passos'],
  },
  como: {
    lead: 'Você cuida da padaria. Nós cuidamos dos impostos, da contabilidade e da folha.',
    items: [['Você envia', 'os documentos até as datas combinadas.'], ['Nós apuramos', 'e mandamos as guias prontas.'], ['Você paga', 'cada guia até o vencimento.'], ['Vai mudar algo?', 'Avise antes: contratação, demissão, férias, compra de bens.'], ['Na dúvida, pergunte antes de decidir.', 'Prevenir custa menos que corrigir.']],
  },
  time: {
    lead: 'Fale pelo WhatsApp do escritório: o assunto vai direto para o departamento certo.',
    depts: [['FI', 'Fiscal', 'notas fiscais, DAS e DEFIS'], ['CO', 'Contábil', 'extratos, balanço, pró-labore e lucros'], ['DP', 'Pessoal/DP', 'folha, admissão, férias, rescisão e eSocial']],
    whats: '(11) 9 0000-0000', email: 'contato@efficio.com.br', horario: 'segunda a sexta, das 8h às 18h',
  },
  numeros: {
    lead: 'O que entregamos pela sua empresa todo mês e todo ano.',
    items: [['2', 'Fiscal', 'DAS mensal e DEFIS anual'], ['2', 'Contábil', 'balancete mensal e balanço anual'], ['5', 'Pessoal', 'folha, eSocial, FGTS, DCTFWeb e obrigações anuais'], ['4', 'Datas suas por mês', 'dia 5, 5º dia útil, dia 20 e dia 25']],
  },
  fiscal: {
    title: 'Fiscal', lead: 'Obrigação · prazo legal · o que precisamos de você.',
    head: ['Obrigação', 'Prazo legal', 'O que precisamos de você'],
    rows: [
      ['PGDAS-D e DAS', 'dia 20 do mês seguinte', 'notas emitidas e recebidas até o **dia 5**'],
      ['Vendas no cartão e PIX', 'as operadoras informam ao fisco', 'relatório das maquininhas até o **dia 5**'],
      ['DEFIS', '31/03/2027', 'confirmar sócios e lucros distribuídos no ano', 'ano de 2026'],
      ['EFD-Reinf', 'dia 15 do mês seguinte', 'envie a nota no dia em que receber', 'se contratar serviço com retenção', 'servico_tomado_com_retencao'],
    ],
  },
  contabil: {
    title: 'Contábil', lead: 'A contabilidade em dia permite distribuir lucros com segurança.',
    head: ['Obrigação', 'Prazo e regra', 'O que precisamos de você'],
    rows: [
      ['Conciliação e balancete', 'mensal', 'extratos de todas as contas até o **dia 5**'],
      ['Balanço anual', 'contas aprovadas pelos sócios até 30/04 (art. 1.078 do Código Civil)', 'nada além dos envios mensais'],
      ['Pró-labore', 'mensal, com INSS', 'valor de cada sócio até o **dia 25**'],
      ['Lucros dos sócios', 'acima de R$ 50 mil no mês por sócio, retenção de 10% de IR (Lei 15.270/2025)', 'avise **antes** de retirar'],
      ['Bens e empréstimos', 'quando houver', 'envie o contrato ou a nota'],
    ],
  },
  pessoal: {
    title: 'Pessoal', lead: `Seus ${V('qtd_empregados', '6')} empregados geram obrigações todo mês. A maior parte é com a gente.`,
    head: ['Obrigação', 'Prazo', 'O que precisamos de você'],
    rows: [
      ['Folha e salários', 'até o 5º dia útil', 'variáveis da folha até o **dia 25**'],
      ['eSocial', 'dia 15 do mês seguinte', 'nada: enviamos a partir da folha'],
      ['FGTS Digital', 'dia 20 do mês seguinte', 'pagar a guia que enviamos'],
      ['DCTFWeb e DARF', 'DARF dia 20; declaração no último dia útil', 'pagar o DARF', 'INSS e IR descontados'],
      ['13º e informe de rendimentos', '13º em 30/11 e 20/12; informe até o último dia útil de fevereiro', 'nada: preparamos tudo'],
    ],
  },
  mes: {
    lead: 'Se a data cair em fim de semana ou feriado, ela pode antecipar ou adiar. Avisamos.',
    items: [
      ['Até o dia', '5', '', 'Você envia', 'notas, extratos e relatório das maquininhas', 'voce'],
      ['Até o', '5º', 'dia útil', 'Você paga', 'os salários', 'voce'],
      ['Dia', '15', '', 'Nós enviamos', 'o eSocial', 'nos'],
      ['Dia', '20', '', 'Você paga', 'DAS, FGTS e DARF do INSS', 'voce'],
      ['Até o dia', '25', '', 'Você envia', 'as variáveis da folha', 'voce'],
    ],
  },
  docs: {
    title: 'Documentos e extratos', lead: 'Documento atrasado atrasa a guia. E guia atrasada tem multa e juros.',
    head: ['Documento', 'O que enviar', 'Prazo'],
    rows: [
      ['Extratos bancários', 'todas as contas e aplicações, mês completo, em PDF ou OFX', 'dia 5'],
      ['Maquininhas e PIX', 'relatório de vendas do mês de cada operadora', 'dia 5'],
      ['Notas fiscais', 'emitidas e recebidas, com XML quando houver', 'dia 5'],
      ['Variáveis da folha', 'faltas, atestados, horas extras, adiantamentos, vale-transporte', 'dia 25'],
      ['Mudanças na empresa', 'sócios, endereço, atividade, empréstimos, compra de bens', 'antes de assinar'],
    ],
  },
  registro: {
    lead: 'Ninguém começa a trabalhar sem registro. Nem “só para testar”.',
    items: [['3 dias úteis antes', 'envie os dados e documentos pelo formulário de admissão'], ['Antes do 1º dia', 'exame admissional (ASO) feito na clínica'], ['Até o dia anterior', 'registramos no eSocial (S-2200) e enviamos o contrato'], ['No 1º dia', 'empregado assina o contrato e começa a trabalhar'], ['Experiência de até 90 dias', 'decida antes do fim se vai efetivar']],
  },
  ferias: {
    lead: 'Programe com antecedência: férias fora do prazo saem em dobro.',
    trio: [['45', 'informe quem sai e o período'], ['30', 'aviso de férias assinado pelo empregado (art. 135 da CLT)'], ['2', 'pagamento das férias + 1/3 (art. 145 da CLT)']],
    rules: [['Pode dividir em até 3 partes', 'uma com 14 dias ou mais; as outras com 5 ou mais'], ['Prazo para tirar', '12 meses após completar o período; depois, <em class="alert">pagamento em dobro</em> (art. 137)']],
  },
  rescisao: {
    lead: 'Antes de falar com o empregado, fale com a gente.',
    items: [['Antes de comunicar', 'avise o tipo de desligamento, a data e o aviso prévio'], ['Nós calculamos', `verbas, FGTS e regras da ${CCT}`], ['Até 10 dias corridos', 'pague as verbas e entregue os documentos (art. 477 da CLT)'], ['No mesmo prazo', 'guia do FGTS rescisório e baixa no eSocial (S-2299)'], ['Sindicato', 'assistência ou homologação quando a CCT exigir']],
  },
  esocial: {
    title: 'Prazos do eSocial', lead: 'Nós enviamos. Você só precisa nos avisar a tempo.',
    head: ['Evento', 'Código', 'Prazo'],
    rows: [
      ['Admissão', 'S-2200', 'até o dia anterior ao início'],
      ['Desligamento', 'S-2299', 'até 10 dias após'],
      ['Acidente de trabalho', 'S-2210', '1º dia útil seguinte; avise no mesmo dia'],
      ['Folha do mês', 'S-1200 e S-1299', 'dia 15 do mês seguinte'],
      ['Afastamentos, alterações e exames', 'S-2230, S-2206, S-2220', 'dia 15 do mês seguinte'],
    ],
  },
  multas: {
    lead: 'Quase todas se evitam com um aviso antes.',
    rows: [
      ['Demissão sem seguir a CCT', `a ${CCT} pode prever multa quando a rescisão não segue o sindicato`, 'multa da CCT'],
      ['Verbas fora do prazo', 'pagou depois de 10 dias: multa de um salário ao empregado (art. 477 da CLT)', '1 salário'],
      ['Trabalho antes do registro', 'multa por empregado, a partir de R$ 800 em ME/EPP (art. 47 da CLT)', 'desde R$ 800'],
      ['Documentos atrasados', 'DAS pago após o dia 20: multa de até 20% + juros Selic', 'até 20% + Selic'],
      ['Férias fora do prazo', 'pagamento em dobro (art. 137 da CLT)', 'em dobro'],
    ],
  },
  passos: {
    lead: `Para começar em ${V('mes_inicio', 'dezembro')}. Marque o que já enviou; acompanhamos pelo sistema.`,
    items: [['Contrato social', 'e última alteração'], ['Procuração eletrônica', 'no e-CAC para a Efficio (ou certificado e-CNPJ)'], ['Acessos', 'do Simples Nacional, da prefeitura e da Sefaz (notas fiscais)'], [`Fechamento de ${V('mes_anterior', 'novembro/2026')}`, 'com o contador anterior: balancete, extratos e DAS'], ['Empregados', 'fichas, últimas folhas, férias vencidas e 1ª parcela do 13º paga']],
  },
  fim: {
    lead: 'Ao confirmar, registramos seu nome, data e hora da leitura.',
    crc: `CRC ${V('crc', '{número}')}`,
  },
};
