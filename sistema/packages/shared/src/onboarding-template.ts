// Factory content of the client onboarding (docs/onboarding-esboco/conteudo.md, owner's decisions of
// 18/11/2026), structured by slide and block. Placeholders `{{…}}` are listed in
// `ONBOARDING_PLACEHOLDERS`; conditions (`when`) replace the `[se regime = …]`/`[se empregados …]` marks.
// The obligation slides (fiscal, accounting, personnel) get the recurring tasks that apply to the client
// (texts in `ONBOARDING_OBLIGATION_TEXTS`, by catalog key) and then their fixed rows (the items below:
// label = obligation, detail = what we need, due = until when), from "Variações por regime".
// Owner's rule (20/11/2026): the client's document shows no due date of ancillary obligations (DCTFWeb,
// EFD-Reinf, eSocial, DEFIS, ECD/ECF…): those matter only to the office. It shows what the client
// delivers and until when (internal deadlines of the parameters), plus the labor deadlines the client
// itself must meet (salaries, vacation, termination).
// Every text has a key (`onboardingTextKeys`): the office's template and a client's adjustment
// override texts by key; items and task rows can be hidden (`onboardingHideableKeys`).

import type { TaxRegime } from './constants';
import type { OnboardingCondition, OnboardingObligationText, OnboardingParams, OnboardingTemplateSlide } from './onboarding';

/** Bump when the factory content changes: the document's `updatedAt` takes it into account. */
export const ONBOARDING_FACTORY_VERSION = '2026-11-20';

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
  competencia: 'Mês anterior (mm/aaaa), para os assuntos de e-mail',
  'escritorio.nome': 'Nome do escritório (cadastro)',
  'escritorio.telefone': 'Telefone do escritório (cadastro)',
  'escritorio.email': 'E-mail do escritório (cadastro)',
  'escritorio.site': 'Site do escritório (cadastro)',
  'escritorio.endereco': 'Endereço do escritório (cadastro)',
  'escritorio.whatsapp': 'WhatsApp de atendimento',
  'escritorio.horario': 'Horário de atendimento',
  'escritorio.crc': 'CRC do escritório',
  'emails.fiscal': 'E-mail do fiscal',
  'emails.pessoal': 'E-mail do pessoal',
  'emails.contabil': 'E-mail da contabilidade',
  'emails.maquininhas': 'E-mail que recebe o relatório das maquininhas',
  'departamentos.maquininhas': 'Departamento que recebe o relatório das maquininhas',
  'assuntos.extratos': 'Assunto: extratos bancários',
  'assuntos.notas': 'Assunto: notas fiscais',
  'assuntos.folha': 'Assunto: variáveis da folha',
  'assuntos.admissao': 'Assunto: registro de empregado',
  'assuntos.ferias': 'Assunto: férias',
  'assuntos.rescisao': 'Assunto: rescisão',
  'prazos.notas': 'Prazo das notas fiscais ("dia 10")',
  'prazos.extratos': 'Prazo dos extratos ("dia 10")',
  'prazos.maquininhas': 'Prazo do relatório das maquininhas ("dia 10")',
  'prazos.folha': 'Prazo das variáveis da folha ("dia 1º")',
  'prazos.proLabore': 'Prazo do pró-labore ("dia 1º")',
  'prazos.admissao': 'Antecedência da admissão ("3 dias úteis")',
  'prazos.ferias': 'Antecedência do pedido de férias ("5 dias")',
  'prazos.defis': 'Prazo dos dados da DEFIS ("15/02")',
  'prazos.link': 'Validade do link ("30 dias")',
};

/** Names of the first version still accepted in saved texts (old → current). */
export const ONBOARDING_PLACEHOLDER_ALIASES: Record<string, string> = {
  mesExemplo: 'competencia',
  'escritorio.emailFiscal': 'emails.fiscal',
  'escritorio.emailPessoal': 'emails.pessoal',
  'escritorio.emailContabil': 'emails.contabil',
  'prazo.documentos': 'prazos.notas',
  'prazo.variaveisFolha': 'prazos.folha',
  'prazo.admissao': 'prazos.admissao',
  'prazo.ferias': 'prazos.ferias',
};

/**
 * Factory parameters = the answers of the Efficio's owner (18/11/2026). Suggestions he has not
 * confirmed yet are in `ONBOARDING_SUGGESTED_PARAMS`. WhatsApp and CRC: to be informed.
 */
export const ONBOARDING_DEFAULT_PARAMS: OnboardingParams = {
  contact: { whatsapp: null, hours: 'Segunda a sexta, das 8h às 18h', crc: null },
  emails: { fiscal: 'fiscal@efficio.com.br', personnel: 'pessoal@efficio.com.br', accounting: 'contabilidade@efficio.com.br' },
  subjects: {
    statements: 'Extratos bancários {{competencia}} | {{razaoSocial}}',
    invoices: 'Notas fiscais {{competencia}} | {{razaoSocial}}',
    payrollVariables: 'Variáveis da folha {{competencia}} | {{razaoSocial}}',
    admission: 'Registro de empregado | {{razaoSocial}}',
    vacation: 'Férias | {{razaoSocial}}',
    termination: 'Rescisão | {{razaoSocial}}',
  },
  deadlines: {
    documentsDay: 10,
    cardsDay: 10,
    cardsDepartment: 'fiscal',
    payrollVariablesDay: 1,
    proLaboreDay: 1,
    admissionBusinessDays: 3,
    vacationDaysBefore: 5,
    defisDay: 15,
    defisMonth: 2,
    /** = ONBOARDING_LINK_DAYS (not imported: circular module). */
    linkDays: 30,
  },
  rules: { admissionExamByClient: true, terminationRequestFirst: true, unionAssistance: true, payrollAdvance: false },
};

/** Parameters whose factory value is a suggestion the owner has not confirmed (the editor marks them). */
export const ONBOARDING_SUGGESTED_PARAMS: readonly string[] = [
  'subjects.invoices',
  'subjects.payrollVariables',
  'subjects.vacation',
  'subjects.termination',
  'deadlines.cardsDepartment',
  'deadlines.proLaboreDay',
  'rules.payrollAdvance',
];

const MEI: TaxRegime[] = ['mei'];
const SIMPLES: TaxRegime[] = ['simples_nacional'];
const PRESUMED: TaxRegime[] = ['presumed_profit'];
const REAL: TaxRegime[] = ['real_profit'];
const PROFIT: TaxRegime[] = ['presumed_profit', 'real_profit'];
const when = (regimes?: TaxRegime[], employees?: OnboardingCondition['employees']): OnboardingCondition => ({
  ...(regimes ? { regimes } : {}),
  ...(employees ? { employees } : {}),
});
const rule = (rules: OnboardingCondition['rules']): OnboardingCondition => ({ rules });

/** What we need and until when, per catalog recurring task (`REGIME_GROUP_ITEMS`); no legal deadline. */
export const ONBOARDING_OBLIGATION_TEXTS: Record<string, OnboardingObligationText> = {
  payroll: {
    need: 'variáveis da folha (faltas, horas extras, comissões); depois, pagar os salários',
    due: '{{prazos.folha}}; salários até o 5º dia útil',
  },
  esocial_periodic: { need: 'Nada: fazemos a partir da folha' },
  fgts_digital: { need: 'pagar a guia que enviamos', due: 'até o vencimento da guia' },
  dctfweb: { need: 'Nada para declarar: só pagar o DARF que enviamos', due: 'até o vencimento do DARF' },
  efd_reinf: { need: 'nota de serviço com retenção (INSS, IR, PIS/COFINS/CSLL)', due: 'sempre que houver, no dia em que receber' },
  pgdas_das: { need: 'notas emitidas e recebidas; depois, pagar o DAS que enviamos', due: '{{prazos.notas}} do mês seguinte' },
  defis: { need: 'dados do ano: sócios e lucros distribuídos', due: '{{prazos.defis}}' },
  das_mei: { need: 'pagar a guia; avise se o faturamento chegar perto do limite do MEI', due: 'até o vencimento da guia' },
  dasn_simei: { need: 'notas e relatório de receitas de cada mês', due: '{{prazos.notas}} do mês seguinte' },
  pis_cofins: { need: 'notas emitidas e recebidas', due: '{{prazos.notas}} do mês seguinte' },
  efd_contribuicoes: { need: 'Nada: fazemos a partir das notas que você envia' },
  efd_icms_ipi: { need: 'notas emitidas e recebidas; inventário do estoque uma vez por ano', due: '{{prazos.notas}} do mês seguinte' },
  irpj_csll_quarterly: { need: 'notas e extratos de cada mês', due: '{{prazos.notas}} do mês seguinte' },
  irpj_csll_monthly_estimate: { need: 'notas e extratos de cada mês', due: '{{prazos.notas}} do mês seguinte' },
  ecd: { need: 'Nada: fazemos a partir dos envios mensais' },
  ecf: { need: 'Nada: fazemos a partir dos envios mensais' },
};

/** "O que precisamos de você" and "até quando" of a recurring task without catalog text. */
export const ONBOARDING_DEFAULT_NEED = 'documentos do mês';
export const ONBOARDING_DEFAULT_DUE = '{{prazos.notas}} do mês seguinte';

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
    subtitles: [{ id: 'main', text: 'Leitura de 10 minutos. Este link vale por {{prazos.link}} e mostra sempre a versão mais recente; baixe o PDF para guardar.' }],
    items: [
      { id: 'work', text: 'Como trabalhamos juntos' },
      { id: 'obligations', text: 'O que fazemos e o que você envia' },
      { id: 'documents', text: 'Documentos e como enviar' },
      { id: 'employees', text: 'Empregados: registro, férias, rescisão e avisos' },
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
      { id: 'fiscal', label: 'Fiscal', text: 'notas fiscais, impostos e declarações', detail: '{{emails.fiscal}}' },
      { id: 'accounting', label: 'Contábil', text: 'extratos, balanço, pró-labore e lucros', detail: '{{emails.contabil}}' },
      { id: 'personnel', label: 'Pessoal', text: 'folha, admissão, férias, rescisão e eSocial', detail: '{{emails.pessoal}}' },
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
      { id: 'personnel', label: '5 · Pessoal', text: 'folha, eSocial, FGTS, DCTFWeb e obrigações anuais' },
      { id: 'dates', label: 'Suas datas no mês', text: '{{prazos.folha}}, {{prazos.notas}} e 5º dia útil' },
    ],
  },
  {
    key: 'fiscal',
    title: 'Fiscal',
    area: 'fiscal',
    subtitles: [{ id: 'main', text: 'O que fazemos por você, o que precisamos e até quando. Os prazos do governo ficam com a gente.' }],
    items: [
      {
        id: 'simples-cards',
        label: 'Vendas no cartão e PIX',
        detail: 'relatório de vendas de cada maquininha e do PIX (as operadoras informam ao fisco)',
        due: '{{prazos.maquininhas}} do mês seguinte',
        when: when(SIMPLES),
      },
      {
        id: 'simples-other-taxes',
        label: 'Guias fora do DAS (ICMS-ST, DIFAL, ISS retido)',
        detail: 'notas de compra e de serviços contratados',
        due: '{{prazos.notas}} do mês seguinte',
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
        detail: 'extratos de todas as contas',
        due: '{{prazos.extratos}} do mês seguinte',
        when: when(MEI),
      },
      {
        id: 'mei-pro-labore',
        label: 'Pró-labore e distribuição de lucros',
        detail: 'Nada: não se aplicam ao MEI; sua contribuição ao INSS já está no DAS-MEI',
        when: when(MEI),
      },
      {
        id: 'reconciliation',
        label: 'Conciliação e balancete mensal',
        detail: 'extratos de todas as contas e aplicações',
        due: '{{prazos.extratos}} do mês seguinte',
        when: when(['simples_nacional', 'presumed_profit']),
      },
      {
        id: 'real-reconciliation',
        label: 'Conciliação e balancete mensal (base do IRPJ/CSLL)',
        detail: 'extratos de todas as contas e aplicações',
        due: '{{prazos.extratos}} do mês seguinte',
        when: when(REAL),
      },
      {
        id: 'simples-balance',
        label: 'Balanço anual',
        detail: 'Nada: fazemos a partir dos envios mensais',
        when: when(SIMPLES),
      },
      {
        id: 'real-inventory',
        label: 'Inventário de estoque',
        detail: 'contagem do estoque em 31/12',
        due: 'em janeiro',
        when: when(REAL),
      },
      {
        id: 'pro-labore',
        label: 'Pró-labore',
        detail: 'valor de cada sócio no mês',
        due: '{{prazos.proLabore}} do mês seguinte',
        when: when(['simples_nacional', 'presumed_profit']),
      },
      {
        id: 'profits',
        label: 'Lucros dos sócios',
        detail: 'valor de cada retirada (acima de R$ 50 mil no mês por sócio, retém 10% de IR)',
        due: 'antes de retirar',
        when: when(['simples_nacional', 'presumed_profit']),
      },
      {
        id: 'real-pro-labore',
        label: 'Pró-labore e lucros',
        detail: 'valor do pró-labore de cada sócio e de cada retirada de lucros (acima de R$ 50 mil/mês por sócio, retém 10% de IR)',
        due: 'pró-labore no {{prazos.proLabore}}; lucros antes de retirar',
        when: when(REAL),
      },
      {
        id: 'simples-no-ecd',
        label: 'ECD e ECF',
        detail: 'Nada: não se aplicam ao Simples Nacional',
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
        id: 'payroll',
        label: 'Folha e salários',
        detail: 'variáveis da folha (faltas, horas extras, comissões); depois, pagar os salários',
        due: '{{prazos.folha}}; salários até o 5º dia útil',
        covers: 'payroll',
      },
      {
        id: 'advance',
        label: 'Adiantamento quinzenal',
        detail: 'pagar o adiantamento com o recibo que enviamos',
        due: 'dia 20 de cada mês',
        when: rule({ payrollAdvance: true }),
      },
      { id: 'esocial', label: 'eSocial', detail: 'Nada: fazemos a partir da folha e dos seus avisos', covers: 'esocial_periodic' },
      { id: 'fgts', label: 'FGTS Digital', detail: 'pagar a guia que enviamos', due: 'até o vencimento da guia', covers: 'fgts_digital' },
      {
        id: 'dctfweb',
        label: 'DCTFWeb (INSS e IRRF da folha)',
        detail: 'Nada para declarar: só pagar o DARF que enviamos',
        due: 'até o vencimento do DARF',
        covers: 'dctfweb',
      },
      {
        id: 'thirteenth',
        label: '13º salário',
        detail: 'pagar as duas parcelas com os recibos que enviamos',
        due: '30/11 e 20/12',
      },
    ],
  },
  {
    key: 'month',
    title: 'Seu mês em uma linha',
    subtitles: [{ id: 'main', text: 'Só as datas em que você faz algo. O resto é com a gente.' }],
    items: [
      { id: 'variables', label: 'Até o {{prazos.folha}}', text: 'você envia as variáveis da folha e o pró-labore do mês anterior', when: { notRegimes: MEI } },
      { id: 'variables-mei', label: 'Até o {{prazos.folha}}', text: 'você envia as variáveis da folha do mês anterior', when: when(MEI) },
      { id: 'salaries', label: 'Até o 5º dia útil', text: 'você paga os salários' },
      { id: 'documents', label: 'Até o {{prazos.notas}}', text: 'você envia notas fiscais, extratos e maquininhas/PIX do mês anterior' },
      { id: 'guides', label: 'No vencimento', text: 'você paga cada guia até o vencimento indicado nela (enviamos antes)' },
    ],
  },
  {
    key: 'documents',
    title: 'Documentos e extratos',
    subtitles: [{ id: 'main', text: 'Prazos no mês seguinte ao do documento. Documento atrasado atrasa a guia, e guia atrasada tem multa e juros.' }],
    items: [
      { id: 'invoices', label: 'Notas fiscais', text: 'emitidas e recebidas, com XML quando houver', detail: '{{prazos.notas}}' },
      { id: 'statements', label: 'Extratos bancários', text: 'todas as contas e aplicações, mês completo, em PDF ou OFX', detail: '{{prazos.extratos}}' },
      { id: 'cards', label: 'Maquininhas e PIX', text: 'relatório de vendas do mês de cada operadora, para o {{departamentos.maquininhas}}', detail: '{{prazos.maquininhas}}' },
      {
        id: 'variables',
        label: 'Variáveis da folha',
        text: 'faltas, atestados, horas extras e comissões',
        detail: '{{prazos.folha}}',
      },
      { id: 'pro-labore', label: 'Pró-labore', text: 'valor de cada sócio no mês', detail: '{{prazos.proLabore}}', when: { notRegimes: MEI } },
      { id: 'defis', label: 'Dados da DEFIS', text: 'sócios e lucros distribuídos no ano', detail: 'até {{prazos.defis}}', when: when(SIMPLES) },
      { id: 'changes', label: 'Mudanças na empresa', text: 'sócios, endereço, atividade, empréstimos, compra de bens', detail: 'antes de assinar' },
    ],
  },
  {
    key: 'sending',
    title: 'Como enviar',
    subtitles: [{ id: 'main', text: 'Sempre por e-mail, para o departamento certo, com o assunto no padrão abaixo.' }],
    items: [
      { id: 'fiscal', label: '{{emails.fiscal}}', text: 'notas fiscais', code: '{{assuntos.notas}}' },
      { id: 'cards', label: '{{emails.maquininhas}}', text: 'relatório das maquininhas e PIX', code: '{{assuntos.notas}}' },
      { id: 'accounting', label: '{{emails.contabil}}', text: 'extratos e contratos', code: '{{assuntos.extratos}}' },
      { id: 'variables', label: '{{emails.pessoal}}', text: 'variáveis da folha e pró-labore', code: '{{assuntos.folha}}' },
      { id: 'employees', label: '{{emails.pessoal}}', text: 'admissão, férias e rescisão', code: '{{assuntos.admissao}}' },
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
        label: '{{prazos.admissao}} antes',
        text: 'envie dados e documentos para {{emails.pessoal}}',
        code: '{{assuntos.admissao}}',
      },
      {
        id: 'exam',
        label: 'Antes do 1º dia',
        text: 'você agenda o exame admissional (ASO) e nos envia o atestado',
        when: rule({ admissionExamByClient: true }),
      },
      {
        id: 'exam-office',
        label: 'Antes do 1º dia',
        text: 'nós agendamos o exame admissional (ASO); o empregado comparece na data marcada',
        when: rule({ admissionExamByClient: false }),
      },
      { id: 'esocial', label: 'Nós registramos', text: 'o empregado no eSocial e enviamos o contrato para assinar' },
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
      { id: 'request', label: '{{prazos.ferias}} antes', text: 'você nos pede as férias em {{emails.pessoal}}: nome, período e aviso assinado', code: '{{assuntos.ferias}}' },
      { id: 'payment', label: '2 dias antes', text: 'você paga férias + 1/3 com o recibo que enviamos (art. 145 da CLT)' },
      { id: 'split', label: 'Pode dividir em até 3 partes', text: 'uma com 14 dias ou mais; as outras com 5 ou mais' },
      { id: 'limit', label: 'Prazo para tirar', text: '12 meses após completar o período; depois, pagamento em dobro (art. 137)' },
    ],
  },
  {
    key: 'termination',
    title: 'Rescisão',
    subtitles: [
      { id: 'main', text: 'Antes de falar com o empregado, fale com a gente.', when: rule({ terminationRequestFirst: true }) },
      { id: 'after', text: 'Comunicou o desligamento? Avise a gente no mesmo dia.' },
    ],
    items: [
      {
        id: 'request',
        label: 'Antes de comunicar',
        text: 'peça a rescisão para {{emails.pessoal}}: tipo de desligamento, data e aviso prévio',
        code: '{{assuntos.rescisao}}',
        when: rule({ terminationRequestFirst: true }),
      },
      {
        id: 'request-after',
        label: 'No dia do aviso',
        text: 'envie a rescisão para {{emails.pessoal}}: tipo de desligamento, data e aviso prévio',
        code: '{{assuntos.rescisao}}',
        when: rule({ terminationRequestFirst: false }),
      },
      { id: 'calculate', label: 'Nós calculamos', text: 'verbas, FGTS e regras da convenção coletiva ({{sindicato}})' },
      { id: 'pay', label: 'Até 10 dias corridos', text: 'pague as verbas e entregue os documentos (art. 477 da CLT)' },
      { id: 'fgts', label: 'No mesmo prazo', text: 'pague a guia do FGTS rescisório que enviamos; nós cuidamos do eSocial' },
      {
        id: 'union',
        label: 'Sindicato',
        text: 'quando a convenção exige, nós fazemos a homologação ou assistência',
        when: rule({ unionAssistance: true }),
      },
      {
        id: 'union-client',
        label: 'Sindicato',
        text: 'quando a convenção exige, você agenda a homologação; enviamos os documentos',
        when: rule({ unionAssistance: false }),
      },
    ],
  },
  {
    key: 'esocial',
    title: 'Quando nos avisar',
    subtitles: [{ id: 'main', text: 'Nós cuidamos do eSocial. Você só precisa nos avisar a tempo, por {{emails.pessoal}}.' }],
    items: [
      { id: 'admission', label: 'Admissão', text: '{{prazos.admissao}} antes do 1º dia', detail: 'dados e documentos do empregado' },
      { id: 'vacation', label: 'Férias', text: '{{prazos.ferias}} antes da saída', detail: 'nome, período e aviso assinado' },
      {
        id: 'termination',
        label: 'Rescisão',
        text: 'antes de comunicar o empregado',
        detail: 'tipo de desligamento, data e aviso prévio',
        when: rule({ terminationRequestFirst: true }),
      },
      {
        id: 'termination-after',
        label: 'Rescisão',
        text: 'no mesmo dia do aviso',
        detail: 'tipo de desligamento, data e aviso prévio',
        when: rule({ terminationRequestFirst: false }),
      },
      { id: 'leave', label: 'Afastamentos, atestados e acidente de trabalho', text: 'no mesmo dia', detail: 'atestado ou relato, data e motivo' },
      { id: 'changes', label: 'Salário, cargo ou jornada', text: 'antes de aplicar a mudança', detail: 'o que muda e a partir de quando' },
      { id: 'variables', label: 'Variáveis da folha', text: 'até o {{prazos.folha}} do mês seguinte', detail: 'faltas, horas extras e comissões' },
    ],
  },
  {
    key: 'fines',
    title: 'Atenção: multas',
    subtitles: [{ id: 'main', text: 'Quase todas se evitam com um aviso antes.' }],
    items: [
      { id: 'late-documents', label: 'Documentos atrasados', text: 'atrasam guias e declarações; a multa por atraso é da empresa' },
      { id: 'unregistered', label: 'Trabalho antes do registro', text: 'multa por empregado, a partir de R$ 800 em ME/EPP (art. 47 da CLT)' },
      {
        id: 'termination',
        label: 'Rescisão fora do prazo ou da convenção',
        text: 'verbas depois de 10 dias: multa de um salário (art. 477 da CLT); a convenção coletiva pode prever outras',
      },
      { id: 'vacation', label: 'Férias fora do prazo', text: 'pagamento em dobro (art. 137 da CLT)' },
      { id: 'late-tax', label: 'Guia paga com atraso', text: 'multa de 0,33% ao dia, até 20%, + juros Selic' },
    ],
  },
  {
    key: 'firstSteps',
    title: 'Primeiros passos',
    subtitles: [{ id: 'main', text: 'Para começar em {{clienteDesde}}. Envie cada item para {{emails.contabil}}; acompanhamos pelo sistema.' }],
    items: [
      { id: 'contract', label: 'Contrato social', text: 'e última alteração', when: { notRegimes: MEI } },
      { id: 'ccmei', label: 'Certificado da Condição de MEI', text: '(CCMEI) atualizado', when: when(MEI) },
      { id: 'ecac', label: 'Procuração eletrônica', text: 'no e-CAC para a {{escritorio.nome}} (ou certificado e-CNPJ)' },
      { id: 'access-simples', label: 'Acessos', text: 'do Simples Nacional, da prefeitura e da Sefaz', when: when(['mei', 'simples_nacional']) },
      { id: 'access', label: 'Acessos', text: 'da prefeitura e da Sefaz (notas fiscais)', when: { notRegimes: ['mei', 'simples_nacional'] } },
      { id: 'closing', label: 'Fechamento do mês anterior', text: 'com o contador anterior: balancete, extratos e guias pagas' },
      { id: 'employees', label: 'Empregados', text: 'fichas, últimas folhas, férias vencidas e 13º já pago (se houver)' },
      { id: 'routine', label: 'Todo mês', text: 'notas e extratos até o {{prazos.notas}}; variáveis da folha até o {{prazos.folha}}' },
    ],
  },
  {
    key: 'confirm',
    title: 'Li e entendi',
    subtitles: [{ id: 'main', text: 'Para confirmar, informe seu nome e CPF. Registramos data e hora da leitura.' }],
    items: [
      { id: 'doubts', label: 'Dúvidas?', text: 'WhatsApp {{escritorio.whatsapp}} · {{escritorio.email}}' },
      { id: 'hours', label: 'Atendimento', text: '{{escritorio.horario}}' },
      { id: 'emails', label: 'Documentos', text: '{{emails.fiscal}} · {{emails.contabil}} · {{emails.pessoal}}' },
      { id: 'signature', text: '{{escritorio.nome}} · CRC {{escritorio.crc}} · Bem-vindos!' },
    ],
  },
];

const ITEM_FIELDS = ['label', 'text', 'detail', 'code', 'due'] as const;

/** Key of a text: `<slide>.title`, `<slide>.kicker`, `<slide>.subtitle.<id>`, `<slide>.items.<id>.<field>`, `obligations.<key>.need|due`, `obligations.default.need|due`. */
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
  for (const [key, t] of Object.entries(ONBOARDING_OBLIGATION_TEXTS)) {
    keys.push(`obligations.${key}.need`);
    if (t.due !== undefined) keys.push(`obligations.${key}.due`);
  }
  keys.push('obligations.default.need', 'obligations.default.due');
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
    if (field !== undefined) return undefined;
    if (kind === 'default') return id === 'need' ? ONBOARDING_DEFAULT_NEED : id === 'due' ? ONBOARDING_DEFAULT_DUE : undefined;
    const t = kind ? ONBOARDING_OBLIGATION_TEXTS[kind] : undefined;
    return t && (id === 'need' || id === 'due') ? t[id] : undefined;
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
