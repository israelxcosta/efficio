// Factory content of the client onboarding (docs/onboarding-esboco/conteudo.md, owner's decisions of
// 18/11/2026), structured by slide and block. Placeholders `{{…}}` are listed in
// `ONBOARDING_PLACEHOLDERS`; conditions (`when`) replace the `[se regime = …]`/`[se empregados …]` marks.
// The obligation slides (fiscal, accounting, personnel) get the recurring tasks that apply to the client
// (texts in `ONBOARDING_OBLIGATION_TEXTS`, by catalog key) and then their fixed rows (the items below:
// label = obligation, text = legal deadline, detail = what we need), from "Variações por regime".
// Every text has a key (`onboardingTextKeys`): the office's template and a client's adjustment
// override texts by key; items and task rows can be hidden (`onboardingHideableKeys`).

import type { TaxRegime } from './constants';
import type { OnboardingCondition, OnboardingObligationText, OnboardingOfficeData, OnboardingTemplateSlide } from './onboarding';

/** Bump when the factory content changes: the document's `updatedAt` takes it into account. */
export const ONBOARDING_FACTORY_VERSION = '2026-11-18';

/** Placeholders the texts may use (value: description for the editor). */
export const ONBOARDING_PLACEHOLDERS: Record<string, string> = {
  razaoSocial: 'Razão social do cliente',
  nomeFantasia: 'Nome fantasia (ou a razão social)',
  cnpj: 'CNPJ formatado',
  regime: 'Regime tributário',
  clienteDesde: 'Início do contrato (dd/mm/aaaa)',
  empregados: 'Número de empregados',
  empregadosTexto: '"3 empregados", "1 empregado" ou "Sem empregados"',
  sindicato: 'Sindicato/CCT do cadastro (ou "convenção coletiva da sua categoria")',
  atualizadoEm: 'Data da versão atual (dd/mm/aaaa)',
  mesExemplo: 'Mês anterior (mm/aaaa), para os assuntos de e-mail',
  'escritorio.nome': 'Nome do escritório',
  'escritorio.whatsapp': 'WhatsApp do escritório',
  'escritorio.email': 'E-mail geral do escritório',
  'escritorio.horario': 'Horário de atendimento',
  'escritorio.crc': 'CRC do escritório',
  'escritorio.emailFiscal': 'E-mail do fiscal',
  'escritorio.emailPessoal': 'E-mail do pessoal',
  'escritorio.emailContabil': 'E-mail da contabilidade',
  'prazo.documentos': 'Prazo de notas e extratos ("dia 10")',
  'prazo.variaveisFolha': 'Prazo das variáveis da folha ("dia 1º")',
  'prazo.admissao': 'Antecedência da admissão ("3 dias úteis")',
  'prazo.ferias': 'Antecedência do pedido de férias ("5 dias")',
};

export const ONBOARDING_DEFAULT_OFFICE: OnboardingOfficeData = {
  name: null,
  whatsapp: null,
  email: null,
  hours: null,
  crc: null,
  emails: { fiscal: 'fiscal@efficio.com.br', personnel: 'pessoal@efficio.com.br', accounting: 'contabilidade@efficio.com.br' },
  deadlines: { documentsDay: 10, payrollVariablesDay: 1, admissionBusinessDays: 3, vacationDaysBefore: 5 },
};

const MEI: TaxRegime[] = ['mei'];
const SIMPLES: TaxRegime[] = ['simples_nacional'];
const PRESUMED: TaxRegime[] = ['presumed_profit'];
const REAL: TaxRegime[] = ['real_profit'];
const PROFIT: TaxRegime[] = ['presumed_profit', 'real_profit'];
const when = (regimes?: TaxRegime[], employees?: OnboardingCondition['employees']): OnboardingCondition => ({
  ...(regimes ? { regimes } : {}),
  ...(employees ? { employees } : {}),
});

/** Legal deadline and what we need, per catalog recurring task (`REGIME_GROUP_ITEMS`). */
export const ONBOARDING_OBLIGATION_TEXTS: Record<string, OnboardingObligationText> = {
  payroll: { deadline: 'salários até o 5º dia útil do mês seguinte', need: 'variáveis da folha até o {{prazo.variaveisFolha}} do mês seguinte' },
  esocial_periodic: { deadline: 'dia 15 do mês seguinte', need: 'nada: enviamos a partir da folha' },
  fgts_digital: { deadline: 'dia 20 do mês seguinte', need: 'pagar a guia que enviamos' },
  dctfweb: { deadline: 'DARF dia 20; declaração no último dia útil do mês seguinte', need: 'pagar o DARF' },
  efd_reinf: { deadline: 'dia 15 do mês seguinte', need: 'envie a nota de serviço com retenção no dia em que receber' },
  pgdas_das: {
    deadline: 'dia 20 do mês seguinte',
    need: 'notas emitidas e recebidas e relatório das maquininhas até o {{prazo.documentos}}',
  },
  defis: { deadline: '31/03 (ano anterior)', need: 'confirmar sócios e lucros distribuídos no ano' },
  das_mei: { deadline: 'dia 20 de cada mês', need: 'pagar a guia; avise se o faturamento chegar perto do limite do MEI' },
  dasn_simei: { deadline: '31/05 (ano anterior)', need: 'notas e relatório de receitas de cada mês até o {{prazo.documentos}}' },
  pis_cofins: { deadline: 'dia 25 do mês seguinte (antecipa se não for dia útil)', need: 'notas emitidas e recebidas até o {{prazo.documentos}}' },
  efd_contribuicoes: { deadline: '10º dia útil do 2º mês seguinte', need: 'nada além das notas' },
  efd_icms_ipi: { deadline: 'conforme o estado', need: 'notas e inventário de estoque' },
  irpj_csll_quarterly: {
    deadline: 'trimestral: último dia útil de abril, julho, outubro e janeiro (pode dividir em 3 quotas)',
    need: 'notas até o {{prazo.documentos}}',
  },
  irpj_csll_monthly_estimate: { deadline: 'estimativa mensal: último dia útil do mês seguinte', need: 'notas e extratos até o {{prazo.documentos}}' },
  ecd: { deadline: 'último dia útil de junho', need: 'nada além dos envios mensais' },
  ecf: { deadline: 'último dia útil de julho', need: 'nada além dos envios mensais' },
};

/** "O que precisamos de você" of a recurring task without catalog text. */
export const ONBOARDING_DEFAULT_NEED = 'documentos do mês até o {{prazo.documentos}}';

export const ONBOARDING_TEMPLATE_SLIDES: readonly OnboardingTemplateSlide[] = [
  {
    key: 'cover',
    kicker: '{{escritorio.nome}} · Onboarding do cliente',
    title: '{{razaoSocial}}',
    subtitles: [],
    items: [
      { id: 'company', text: '{{nomeFantasia}} · CNPJ {{cnpj}}' },
      { id: 'regime', text: '{{regime}}' },
      { id: 'since', text: 'Cliente desde {{clienteDesde}}' },
      { id: 'employees', text: '{{empregadosTexto}} · {{sindicato}}' },
      { id: 'updated', text: 'Atualizado em {{atualizadoEm}}' },
    ],
  },
  {
    key: 'summary',
    title: 'Sumário',
    subtitles: [{ id: 'main', text: 'Leitura de 10 minutos. Este link mostra sempre a versão mais recente; baixe o PDF para guardar.' }],
    items: [
      { id: 'work', text: 'Como trabalhamos juntos' },
      { id: 'obligations', text: 'Suas obrigações e prazos' },
      { id: 'documents', text: 'Documentos e como enviar' },
      { id: 'employees', text: 'Empregados: registro, férias, rescisão, eSocial' },
      { id: 'fines', text: 'Atenção às multas e primeiros passos' },
    ],
  },
  {
    key: 'howWeWork',
    title: 'Como trabalhamos juntos',
    subtitles: [{ id: 'main', text: 'Você cuida da {{nomeFantasia}}. Nós cuidamos dos impostos, da contabilidade e da folha.' }],
    items: [
      { id: 'send', label: 'Você envia', text: 'os documentos por e-mail até as datas combinadas.' },
      { id: 'calculate', label: 'Nós apuramos', text: 'e mandamos as guias prontas.' },
      { id: 'pay', label: 'Você paga', text: 'cada guia até o vencimento.' },
      { id: 'change', label: 'Vai mudar algo?', text: 'Avise antes: contratação, demissão, férias, compra de bens.' },
      { id: 'ask', label: 'Na dúvida, pergunte antes de decidir.', text: 'Prevenir custa menos que corrigir.' },
    ],
  },
  {
    key: 'team',
    title: 'Seu time e canais',
    subtitles: [{ id: 'main', text: 'Cada assunto tem seu departamento. Para conversas rápidas, use o WhatsApp do escritório.' }],
    items: [
      { id: 'fiscal', label: 'Fiscal', text: 'notas fiscais, impostos e declarações', detail: '{{escritorio.emailFiscal}}' },
      { id: 'accounting', label: 'Contábil', text: 'extratos, balanço, pró-labore e lucros', detail: '{{escritorio.emailContabil}}' },
      { id: 'personnel', label: 'Pessoal', text: 'folha, admissão, férias, rescisão e eSocial', detail: '{{escritorio.emailPessoal}}' },
      { id: 'whatsapp', label: 'WhatsApp', text: '{{escritorio.whatsapp}}', detail: 'e-mail geral {{escritorio.email}}' },
      { id: 'hours', label: 'Atendimento', text: '{{escritorio.horario}}' },
    ],
  },
  {
    key: 'numbers',
    title: 'Suas obrigações em números',
    subtitles: [{ id: 'main', text: 'O que entregamos pela sua empresa todo mês e todo ano.' }],
    items: [
      { id: 'mei-fiscal', label: '2 · Fiscal', text: 'DAS-MEI mensal e DASN-SIMEI anual', when: when(MEI) },
      { id: 'mei-accounting', label: '1 · Contábil', text: 'controle de receitas e livro caixa', when: when(MEI) },
      { id: 'simples-fiscal', label: '2 · Fiscal', text: 'DAS mensal e DEFIS anual', when: when(SIMPLES) },
      { id: 'simples-accounting', label: '2 · Contábil', text: 'balancete mensal e balanço anual', when: when(SIMPLES) },
      {
        id: 'presumed-fiscal',
        label: '4 · Fiscal',
        text: 'PIS/COFINS, IRPJ/CSLL trimestrais, DCTFWeb e EFD-Contribuições',
        when: when(PRESUMED),
      },
      { id: 'real-fiscal', label: '4 · Fiscal', text: 'PIS/COFINS, IRPJ/CSLL por estimativa, DCTFWeb e EFD-Contribuições', when: when(REAL) },
      { id: 'profit-accounting', label: '3 · Contábil', text: 'balancete mensal, ECD e ECF anuais', when: when(PROFIT) },
      { id: 'personnel-some', label: '5 · Pessoal', text: 'folha, eSocial, FGTS, DCTFWeb e obrigações anuais', when: when(undefined, 'some') },
      { id: 'personnel-none', label: 'Pessoal', text: 'nada hoje; quando contratar, cuidamos de tudo', when: when(undefined, 'none') },
      {
        id: 'dates',
        label: 'Suas datas no mês',
        text: '{{prazo.variaveisFolha}}, {{prazo.documentos}}, 5º dia útil e dia 20',
        when: { notRegimes: PROFIT },
      },
      { id: 'dates-profit', label: 'Suas datas no mês', text: '{{prazo.variaveisFolha}}, {{prazo.documentos}}, 5º dia útil, dia 20 e dia 25', when: when(PROFIT) },
    ],
  },
  {
    key: 'fiscal',
    title: 'Fiscal',
    area: 'fiscal',
    subtitles: [{ id: 'main', text: 'Obrigação · prazo legal · o que precisamos de você.' }],
    items: [
      {
        id: 'mei-fgts',
        label: 'FGTS Digital (MEI pode ter 1 empregado)',
        text: 'dia 20 do mês seguinte',
        detail: 'pagar a guia',
        when: when(MEI, 'some'),
      },
      {
        id: 'mei-dctfweb',
        label: 'DCTFWeb e DARF (INSS do empregado + 3% patronal)',
        text: 'DARF dia 20; declaração no último dia útil',
        detail: 'pagar o DARF',
        when: when(MEI, 'some'),
      },
      {
        id: 'simples-cards',
        label: 'Vendas no cartão e PIX',
        text: 'as operadoras informam ao fisco',
        detail: 'relatório das maquininhas até o {{prazo.documentos}}',
        when: when(SIMPLES),
      },
      {
        id: 'simples-other-taxes',
        label: 'Guias fora do DAS (ICMS-ST, DIFAL, ISS retido)',
        text: 'conforme estado e prefeitura',
        detail: 'notas de compra até o {{prazo.documentos}}',
        when: when(SIMPLES),
      },
    ],
  },
  {
    key: 'accounting',
    title: 'Contábil',
    area: 'accounting',
    subtitles: [{ id: 'main', text: 'A contabilidade em dia permite distribuir lucros com segurança.' }],
    items: [
      {
        id: 'mei-cash-book',
        label: 'Controle de receitas e livro caixa',
        text: 'sem prazo legal (recomendado)',
        detail: 'extratos de todas as contas até o {{prazo.documentos}}',
        when: when(MEI),
      },
      {
        id: 'mei-pro-labore',
        label: 'Pró-labore e distribuição de lucros',
        text: 'não se aplicam ao MEI',
        detail: 'sua contribuição ao INSS já está no DAS-MEI',
        when: when(MEI),
      },
      {
        id: 'reconciliation',
        label: 'Conciliação e balancete',
        text: 'mensal',
        detail: 'extratos de todas as contas até o {{prazo.documentos}}',
        when: when(['simples_nacional', 'presumed_profit']),
      },
      {
        id: 'real-reconciliation',
        label: 'Conciliação e balancete',
        text: 'mensal (base da estimativa de IRPJ/CSLL)',
        detail: 'extratos de todas as contas até o {{prazo.documentos}}',
        when: when(REAL),
      },
      {
        id: 'simples-balance',
        label: 'Balanço anual',
        text: 'contas aprovadas pelos sócios até 30/04 (art. 1.078 do Código Civil)',
        detail: 'nada além dos envios mensais',
        when: when(SIMPLES),
      },
      {
        id: 'real-inventory',
        label: 'Inventário de estoque',
        text: 'posição em 31/12',
        detail: 'contagem do estoque em janeiro',
        when: when(REAL),
      },
      {
        id: 'pro-labore',
        label: 'Pró-labore',
        text: 'mensal, com INSS (DCTFWeb e DARF dia 20)',
        detail: 'valor de cada sócio até o {{prazo.variaveisFolha}}',
        when: when(['simples_nacional', 'presumed_profit']),
      },
      {
        id: 'profits',
        label: 'Lucros dos sócios',
        text: 'acima de R$ 50 mil no mês por sócio, retenção de 10% de IR (Lei 15.270/2025)',
        detail: 'avise antes de retirar',
        when: when(['simples_nacional', 'presumed_profit']),
      },
      {
        id: 'real-pro-labore',
        label: 'Pró-labore e lucros',
        text: 'pró-labore com INSS; lucros acima de R$ 50 mil/mês por sócio retêm 10% de IR',
        detail: 'valor do pró-labore até o {{prazo.variaveisFolha}}; avise antes de retirar lucros',
        when: when(REAL),
      },
      {
        id: 'simples-no-ecd',
        label: 'ECD e ECF',
        text: 'não se aplicam ao Simples Nacional',
        detail: 'nada',
        when: when(SIMPLES),
      },
    ],
  },
  {
    key: 'personnel',
    title: 'Pessoal',
    area: 'personnel',
    subtitles: [
      { id: 'some', text: 'Hoje são {{empregadosTexto}}, com obrigações todo mês. A maior parte é com a gente.', when: when(undefined, 'some') },
      { id: 'none', text: 'Hoje você não tem empregados. Quando contratar, é assim que funciona.' },
    ],
    items: [
      {
        id: 'mei-payroll',
        label: 'Folha e salários',
        text: 'até o 5º dia útil',
        detail: 'variáveis da folha até o {{prazo.variaveisFolha}} do mês seguinte',
        when: when(MEI),
      },
      { id: 'mei-esocial', label: 'eSocial', text: 'dia 15 do mês seguinte', detail: 'nada: enviamos a partir da folha', when: when(MEI) },
      {
        id: 'thirteenth',
        label: '13º e informe de rendimentos',
        text: '13º em 30/11 e 20/12; informe até o último dia útil de fevereiro',
        detail: 'nada: preparamos tudo',
      },
    ],
  },
  {
    key: 'month',
    title: 'Seu mês em uma linha',
    subtitles: [
      { id: 'main', text: 'Data em fim de semana ou feriado pode antecipar ou adiar: a guia que enviamos já vem com o vencimento certo.' },
    ],
    items: [
      { id: 'variables', label: 'Até o {{prazo.variaveisFolha}}', text: 'você envia as variáveis da folha do mês anterior' },
      { id: 'salaries', label: 'Até o 5º dia útil', text: 'você paga os salários' },
      { id: 'documents', label: 'Até o {{prazo.documentos}}', text: 'você envia notas fiscais e extratos do mês anterior' },
      { id: 'esocial', label: 'Dia 15', text: 'nós enviamos o eSocial' },
      { id: 'pay-mei', label: 'Dia 20', text: 'você paga o DAS-MEI', when: when(MEI) },
      { id: 'pay-simples', label: 'Dia 20', text: 'você paga o DAS', when: when(SIMPLES) },
      { id: 'pay-profit', label: 'Dia 20', text: 'você paga DARFs, FGTS e INSS', when: when(PROFIT) },
      { id: 'pis-cofins', label: 'Dia 25', text: 'você paga PIS e COFINS', when: when(PROFIT) },
    ],
  },
  {
    key: 'documents',
    title: 'Documentos e extratos',
    subtitles: [{ id: 'main', text: 'Documento atrasado atrasa a guia. E guia atrasada tem multa e juros.' }],
    items: [
      { id: 'invoices', label: 'Notas fiscais', text: 'emitidas e recebidas, com XML quando houver', detail: '{{prazo.documentos}}' },
      { id: 'statements', label: 'Extratos bancários', text: 'todas as contas e aplicações, mês completo, em PDF ou OFX', detail: '{{prazo.documentos}}' },
      { id: 'cards', label: 'Maquininhas e PIX', text: 'relatório de vendas do mês de cada operadora', detail: '{{prazo.documentos}}' },
      {
        id: 'variables',
        label: 'Variáveis da folha',
        text: 'faltas, atestados, horas extras e comissões',
        detail: '{{prazo.variaveisFolha}} do mês seguinte',
      },
      { id: 'changes', label: 'Mudanças na empresa', text: 'sócios, endereço, atividade, empréstimos, compra de bens', detail: 'antes de assinar' },
    ],
  },
  {
    key: 'sending',
    title: 'Como enviar',
    subtitles: [{ id: 'main', text: 'Sempre por e-mail, para o departamento certo, com o assunto no padrão abaixo.' }],
    items: [
      { id: 'fiscal', label: '{{escritorio.emailFiscal}}', text: 'notas fiscais e maquininhas', code: 'Notas fiscais {{mesExemplo}} | {{razaoSocial}}' },
      {
        id: 'accounting',
        label: '{{escritorio.emailContabil}}',
        text: 'extratos e contratos',
        code: 'Extratos bancários {{mesExemplo}} | {{razaoSocial}}',
      },
      { id: 'variables', label: '{{escritorio.emailPessoal}}', text: 'variáveis da folha', code: 'Variáveis da folha {{mesExemplo}} | {{razaoSocial}}' },
      { id: 'employees', label: '{{escritorio.emailPessoal}}', text: 'admissão, férias, rescisão', code: 'Registro de empregado | {{razaoSocial}}' },
      { id: 'subject', label: 'Assunto padrão', text: 'tipo do documento + mês/ano + razão social: assim nada se perde' },
    ],
  },
  {
    key: 'admission',
    title: 'Registro de empregado',
    subtitles: [{ id: 'main', text: 'Ninguém começa a trabalhar sem registro. Nem "só para testar".' }],
    items: [
      {
        id: 'data',
        label: '{{prazo.admissao}} antes',
        text: 'envie dados e documentos para {{escritorio.emailPessoal}}',
        code: 'Registro de empregado | {{razaoSocial}}',
      },
      { id: 'exam', label: 'Antes do 1º dia', text: 'você agenda o exame admissional (ASO) e nos envia o atestado' },
      { id: 'esocial', label: 'Até o dia anterior', text: 'registramos no eSocial (S-2200) e enviamos o contrato' },
      { id: 'first-day', label: 'No 1º dia', text: 'empregado assina o contrato e começa a trabalhar' },
      { id: 'trial', label: 'Experiência de até 90 dias', text: 'decida antes do fim se vai efetivar' },
    ],
  },
  {
    key: 'vacation',
    title: 'Férias',
    subtitles: [{ id: 'main', text: 'Três datas, contadas para trás a partir do 1º dia de férias.' }],
    items: [
      { id: 'notice', label: '30 dias antes', text: 'você avisa o empregado por escrito, com o período (lei: art. 135 da CLT)' },
      { id: 'request', label: '{{prazo.ferias}} antes', text: 'você nos pede as férias por e-mail: nome, período e aviso assinado' },
      { id: 'payment', label: '2 dias antes', text: 'você paga férias + 1/3 com o recibo que enviamos (art. 145 da CLT)' },
      { id: 'split', label: 'Pode dividir em até 3 partes', text: 'uma com 14 dias ou mais; as outras com 5 ou mais' },
      { id: 'limit', label: 'Prazo para tirar', text: '12 meses após completar o período; depois, pagamento em dobro (art. 137)' },
    ],
  },
  {
    key: 'termination',
    title: 'Rescisão',
    subtitles: [{ id: 'main', text: 'Antes de falar com o empregado, fale com a gente.' }],
    items: [
      {
        id: 'request',
        label: 'Antes de comunicar',
        text: 'peça a rescisão para {{escritorio.emailPessoal}}: tipo de desligamento, data e aviso prévio',
      },
      { id: 'calculate', label: 'Nós calculamos', text: 'verbas, FGTS e regras da convenção coletiva ({{sindicato}})' },
      { id: 'pay', label: 'Até 10 dias corridos', text: 'pague as verbas e entregue os documentos (art. 477 da CLT)' },
      { id: 'fgts', label: 'No mesmo prazo', text: 'guia do FGTS rescisório e baixa no eSocial (S-2299)' },
      { id: 'union', label: 'Sindicato', text: 'quando a convenção exige, nós fazemos a homologação ou assistência' },
    ],
  },
  {
    key: 'esocial',
    title: 'Prazos do eSocial',
    subtitles: [{ id: 'main', text: 'Nós enviamos. Você só precisa nos avisar a tempo.' }],
    items: [
      { id: 's2200', label: 'Admissão (S-2200)', text: 'até o dia anterior ao início' },
      { id: 's2299', label: 'Desligamento (S-2299)', text: 'até 10 dias após' },
      { id: 's2210', label: 'Acidente de trabalho (S-2210)', text: '1º dia útil seguinte; avise no mesmo dia' },
      { id: 's1200', label: 'Folha do mês (S-1200 e S-1299)', text: 'dia 15 do mês seguinte' },
      { id: 'others', label: 'Afastamentos, alterações e exames (S-2230, S-2206, S-2220)', text: 'dia 15 do mês seguinte' },
    ],
  },
  {
    key: 'fines',
    title: 'Atenção: multas',
    subtitles: [{ id: 'main', text: 'Quase todas se evitam com um aviso antes.' }],
    items: [
      { id: 'union', label: 'Rescisão fora das regras do sindicato', text: 'a convenção coletiva da sua categoria pode prever multa' },
      { id: 'late-payment', label: 'Verbas fora do prazo', text: 'pagou depois de 10 dias: multa de um salário ao empregado (art. 477 da CLT)' },
      { id: 'unregistered', label: 'Trabalho antes do registro', text: 'multa por empregado, a partir de R$ 800 em ME/EPP (art. 47 da CLT)' },
      { id: 'late-tax', label: 'Guia paga com atraso', text: 'multa de 0,33% ao dia, até 20%, + juros Selic' },
      { id: 'vacation', label: 'Férias fora do prazo', text: 'pagamento em dobro (art. 137 da CLT)' },
    ],
  },
  {
    key: 'firstSteps',
    title: 'Primeiros passos',
    subtitles: [{ id: 'main', text: 'Para começar em {{clienteDesde}}. Envie cada item por e-mail; acompanhamos pelo sistema.' }],
    items: [
      { id: 'contract', label: 'Contrato social', text: 'e última alteração', when: { notRegimes: MEI } },
      { id: 'ccmei', label: 'Certificado da Condição de MEI', text: '(CCMEI) atualizado', when: when(MEI) },
      { id: 'ecac', label: 'Procuração eletrônica', text: 'no e-CAC para a {{escritorio.nome}} (ou certificado e-CNPJ)' },
      { id: 'access-simples', label: 'Acessos', text: 'do Simples Nacional, da prefeitura e da Sefaz', when: when(['mei', 'simples_nacional']) },
      { id: 'access', label: 'Acessos', text: 'da prefeitura e da Sefaz (notas fiscais)', when: { notRegimes: ['mei', 'simples_nacional'] } },
      { id: 'closing', label: 'Fechamento do mês anterior', text: 'com o contador anterior: balancete, extratos e guias pagas' },
      { id: 'employees', label: 'Empregados', text: 'fichas, últimas folhas, férias vencidas e 13º já pago', when: when(undefined, 'some') },
    ],
  },
  {
    key: 'confirm',
    title: 'Li e entendi',
    subtitles: [{ id: 'main', text: 'Para confirmar, informe seu nome e CPF. Registramos data e hora da leitura.' }],
    items: [
      { id: 'doubts', label: 'Dúvidas?', text: 'WhatsApp {{escritorio.whatsapp}} · {{escritorio.email}}' },
      { id: 'hours', label: 'Atendimento', text: '{{escritorio.horario}}' },
      { id: 'signature', text: '{{escritorio.nome}} · CRC {{escritorio.crc}} · Bem-vindos!' },
    ],
  },
];

const ITEM_FIELDS = ['label', 'text', 'detail', 'code'] as const;

/** Key of a text: `<slide>.title`, `<slide>.kicker`, `<slide>.subtitle.<id>`, `<slide>.items.<id>.<field>`, `obligations.<key>.deadline|need`, `obligations.default.need`. */
export function onboardingTextKeys(): string[] {
  const keys: string[] = [];
  for (const slide of ONBOARDING_TEMPLATE_SLIDES) {
    keys.push(`${slide.key}.title`);
    if (slide.kicker !== undefined) keys.push(`${slide.key}.kicker`);
    for (const s of slide.subtitles) keys.push(`${slide.key}.subtitle.${s.id}`);
    for (const item of slide.items) {
      for (const field of ITEM_FIELDS) if (item[field] !== undefined) keys.push(`${slide.key}.items.${item.id}.${field}`);
    }
  }
  for (const key of Object.keys(ONBOARDING_OBLIGATION_TEXTS)) keys.push(`obligations.${key}.deadline`, `obligations.${key}.need`);
  keys.push('obligations.default.need');
  return keys;
}

/** What can be hidden: `<slide>.items.<id>` and `obligations.<catalog key>` (a recurring task's row). */
export function onboardingHideableKeys(): string[] {
  return [
    ...ONBOARDING_TEMPLATE_SLIDES.flatMap((s) => s.items.map((i) => `${s.key}.items.${i.id}`)),
    ...Object.keys(ONBOARDING_OBLIGATION_TEXTS).map((k) => `obligations.${k}`),
  ];
}

/** The factory text of a key (undefined when the key does not exist). */
export function onboardingFactoryText(key: string): string | undefined {
  const [head, kind, id, field] = key.split('.');
  if (head === 'obligations') {
    if (kind === 'default') return id === 'need' && field === undefined ? ONBOARDING_DEFAULT_NEED : undefined;
    const t = kind ? ONBOARDING_OBLIGATION_TEXTS[kind] : undefined;
    return t && (id === 'deadline' || id === 'need') && field === undefined ? t[id] : undefined;
  }
  const slide = ONBOARDING_TEMPLATE_SLIDES.find((s) => s.key === head);
  if (!slide) return undefined;
  if (kind === 'title' && id === undefined) return slide.title;
  if (kind === 'kicker' && id === undefined) return slide.kicker;
  if (kind === 'subtitle' && field === undefined) return slide.subtitles.find((s) => s.id === id)?.text;
  if (kind === 'items' && field) {
    const item = slide.items.find((i) => i.id === id);
    return item && (ITEM_FIELDS as readonly string[]).includes(field) ? item[field as (typeof ITEM_FIELDS)[number]] : undefined;
  }
  return undefined;
}
