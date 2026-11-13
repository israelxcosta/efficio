// Conteúdo do site público do escritório (rota `/` para visitantes e `/site` para todos).
//
// ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
// │ DADOS DO ESCRITÓRIO — PREENCHER ANTES DE PUBLICAR                                            │
// │ Todos os campos de OFFICE abaixo são EXEMPLOS fictícios. Troque pelos dados reais: eles      │
// │ aparecem no contato, no rodapé e nos links de WhatsApp e e-mail. Nada mais na página traz    │
// │ telefone, endereço, CRC ou e-mail.                                                           │
// └──────────────────────────────────────────────────────────────────────────────────────────────┘

export const OFFICE = {
  name: 'Efficio Contabilidade',
  /** EXEMPLO — registro do escritório no Conselho Regional de Contabilidade (ex.: "CRC-SP 000000/O-0"). */
  crc: 'CRC-UF 000000/O-0',
  /** EXEMPLO — WhatsApp só com dígitos: 55 + DDD + número (ex.: "5511912345678"). */
  whatsapp: '5500000000000',
  /** EXEMPLO — o mesmo número como aparece na página. */
  whatsappLabel: '(00) 00000-0000',
  /** EXEMPLO — e-mail de atendimento. */
  email: 'contato@seudominio.com.br',
  /** EXEMPLO — endereço do escritório. */
  address: 'Rua Exemplo, 000, Bairro, Cidade – UF',
  /** EXEMPLO — horário de atendimento. */
  hours: 'Segunda a sexta, das 8h às 18h',
} as const;

/** Link do WhatsApp com a mensagem já escrita (abre o app; nada é enviado sem a pessoa confirmar). */
export function whatsappHref(message: string, phone: string = OFFICE.whatsapp): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}

export function mailtoHref(subject: string, body = '', email: string = OFFICE.email): string {
  const query = [`subject=${encodeURIComponent(subject)}`, body ? `body=${encodeURIComponent(body)}` : ''].filter(Boolean).join('&');
  return `mailto:${email}?${query}`;
}

/** Mensagem do WhatsApp montada a partir do nome e do assunto digitados no contato. */
export function contactMessage(name: string, subject: string): string {
  const who = name.trim() ? `Olá! Sou ${name.trim()}.` : 'Olá!';
  const about = subject.trim() ? ` Quero falar sobre: ${subject.trim()}.` : ' Quero falar com o escritório.';
  return `${who}${about}`;
}

// ── Seções ──────────────────────────────────────────────────────────────────────────────────────

/** Links do menu do topo (e do painel do celular), na ordem em que aparecem. */
export const NAV = [
  { id: 'mes', label: 'O seu mês' },
  { id: 'servicos', label: 'Serviços' },
  { id: 'portal', label: 'Portal' },
  { id: 'comecar', label: 'Como começar' },
  { id: 'duvidas', label: 'Dúvidas' },
  { id: 'contato', label: 'Contato' },
] as const;

/** A faixa abaixo do topo: o que o escritório garante, sem selo de terceiros. */
export const GUARANTEES = [
  { id: 'duas-etapas', title: 'Portal com duas etapas', caption: 'Código do aplicativo autenticador' },
  { id: 'lgpd', title: 'Seus dados protegidos', caption: 'Tratamento conforme a LGPD' },
  { id: 'whatsapp', title: 'Atendimento pelo WhatsApp', caption: OFFICE.hours },
  { id: 'crc', title: 'Registro no CRC', caption: OFFICE.crc },
] as const;

/** Os dois prazos que organizam o mês (os mesmos da rotina em STEPS), em números grandes. */
export const DUE_NUMBERS = [
  {
    id: 'guias',
    figure: '20',
    label: 'Guias',
    text: 'Dia de vencimento do DAS, do INSS e do FGTS. As guias chegam ao seu portal antes dele.',
  },
  {
    id: 'folha',
    figure: '5º',
    label: 'Folha',
    text: 'Dia útil do mês: a folha fechada e os holerites da equipe prontos no portal.',
  },
] as const;

export type ServiceId = 'contabil' | 'fiscal' | 'folha' | 'abertura' | 'planejamento' | 'financeiro' | 'certidoes';

export interface Service {
  id: ServiceId;
  /** Nome completo do serviço (título do cartão e assunto do contato). */
  name: string;
  /** O que o serviço entrega. */
  detail: string;
}

export const SERVICES: Service[] = [
  { id: 'contabil', name: 'Contabilidade', detail: 'Balancete todo mês, balanço e DRE no fim do ano, ECD e ECF.' },
  { id: 'fiscal', name: 'Fiscal e tributário', detail: 'Apuração e guias: DAS, DCTFWeb, EFD-Reinf, SPED e notas.' },
  { id: 'folha', name: 'Departamento pessoal', detail: 'Admissão, holerite, férias, rescisão, eSocial e FGTS Digital.' },
  { id: 'abertura', name: 'Abertura e alteração de empresas', detail: 'Abrir, alterar o contrato social, mudar de endereço ou encerrar.' },
  { id: 'planejamento', name: 'Planejamento tributário', detail: 'Escolha do regime, pró-labore e distribuição de lucros.' },
  { id: 'financeiro', name: 'BPO financeiro', detail: 'Contas a pagar e a receber, conciliação e relatório do mês.' },
  { id: 'certidoes', name: 'Certidões', detail: 'CND federal, CRF do FGTS, estadual e municipal, com a validade.' },
];

/** Frases do portal: cada uma com a consequência em números (dados de exemplo das telas). */
export const PORTAL_FEATURES = [
  { id: 'guias', sentence: 'As guias chegam antes do vencimento', result: 'DAS de setembro anexado em 17/10, três dias antes do vencimento.' },
  { id: 'pendencias', sentence: 'O que depende de você fica separado', result: '1 pendência: extratos bancários de setembro, pedidos em 06/10.' },
  { id: 'documentos', sentence: 'Cada documento guardado no seu mês', result: 'Setembro de 2026: 9 arquivos, entre guias, holerites e recibos.' },
  { id: 'prazos', sentence: 'Os prazos do mês num calendário', result: 'Outubro: 7 entregas, 5 concluídas, 1 em andamento e 1 aguardando você.' },
  { id: 'seguranca', sentence: 'Senha e código em duas etapas', result: 'Código de 6 dígitos do aplicativo autenticador a cada novo acesso.' },
] as const;

export type PortalFeatureId = (typeof PORTAL_FEATURES)[number]['id'];

export function portalFeature(id: PortalFeatureId) {
  return PORTAL_FEATURES.find((f) => f.id === id)!;
}

/** A tabela "Contabilidade com portal": o mesmo assunto com o portal e sem ele. */
export const COMPARISON = [
  {
    id: 'guias',
    label: 'Guias',
    with: 'Chegam ao portal antes do vencimento, anexadas à obrigação',
    without: 'Chegam por e-mail ou mensagem, perto do prazo',
  },
  {
    id: 'pendencias',
    label: 'Pendências',
    with: 'O que depende de você aparece separado, com a data do pedido',
    without: 'Pedidos perdidos no meio das conversas',
  },
  {
    id: 'documentos',
    label: 'Documentos',
    with: 'Cada arquivo guardado no mês a que pertence',
    without: 'Arquivos espalhados entre e-mail, WhatsApp e papel',
  },
  {
    id: 'prazos',
    label: 'Prazos',
    with: 'As obrigações do mês num calendário, com a situação de cada uma',
    without: 'Você só sabe do prazo quando alguém avisa',
  },
  {
    id: 'acesso',
    label: 'Acesso',
    with: 'Senha e código em duas etapas a cada novo acesso',
    without: 'Documentos encaminhados sem controle de quem vê',
  },
  {
    id: 'atendimento',
    label: 'Atendimento',
    with: 'WhatsApp do escritório, com o histórico do mês à vista no portal',
    without: 'Cada dúvida começa do zero, sem o histórico à mão',
  },
] as const;

export type AudienceId = 'mei' | 'simples' | 'presumido' | 'real' | 'servicos' | 'comercio' | 'liberais';

/** "Para quem": os regimes e os perfis de empresa que o escritório atende. */
export const AUDIENCES: { id: AudienceId; name: string; text: string }[] = [
  { id: 'mei', name: 'MEI', text: 'O DAS-MEI todo mês, a DASN-SIMEI no ano e a passagem para o Simples quando o faturamento passar do limite.' },
  { id: 'simples', name: 'Simples Nacional', text: 'O DAS apurado no PGDAS-D, a DEFIS no ano e, com funcionários, a folha, o eSocial e o FGTS Digital.' },
  { id: 'presumido', name: 'Lucro Presumido', text: 'PIS e COFINS todo mês, IRPJ e CSLL no trimestre, EFD-Contribuições, ECD e ECF.' },
  { id: 'real', name: 'Lucro Real', text: 'IRPJ e CSLL por estimativa, EFD-Reinf, SPED e o balancete conferido todo mês.' },
  { id: 'servicos', name: 'Prestadores de serviço', text: 'Notas de serviço, ISS e retenções conferidos mês a mês, com as guias no portal.' },
  { id: 'comercio', name: 'Comércio', text: 'Notas de compra e venda, ICMS e SPED Fiscal no prazo do seu estado.' },
  { id: 'liberais', name: 'Profissionais liberais', text: 'Abertura da empresa, escolha do regime e pró-labore para quem trabalha por conta própria.' },
];

export type StepId = 'conversa' | 'proposta' | 'transicao' | 'portal' | 'rotina';

export const STEPS: { id: StepId; name: string; text: string; note?: string }[] = [
  {
    id: 'conversa',
    name: 'Conversa',
    text: 'Você conta como a empresa funciona: a atividade, o regime de hoje, quantas pessoas trabalham e quantas notas saem por mês.',
    note: 'A primeira conversa é sem compromisso.',
  },
  {
    id: 'proposta',
    name: 'Proposta',
    text: 'O escritório responde por escrito com o que entra em cada serviço e o valor dos honorários, e o contrato sai daí.',
  },
  {
    id: 'transicao',
    name: 'Transição',
    text: 'Se a empresa já tem contador, combinamos com ele a entrega dos livros, das declarações e dos acessos até a competência da troca.',
    note: 'A troca pode acontecer no meio do ano.',
  },
  {
    id: 'portal',
    name: 'Portal',
    text: 'Você recebe o link do convite, cria a sua conta com o seu e-mail e passa a ver as obrigações do mês, os documentos e o que depende de você.',
  },
  {
    id: 'rotina',
    name: 'Rotina',
    text: 'Todo mês: folha até o 5º dia útil, declarações no dia 15, guias no dia 20 e o balancete até o dia 25.',
  },
];

export type FaqTopic = 'portal' | 'troca' | 'honorarios';

export const FAQ_TOPICS: { id: FaqTopic; label: string }[] = [
  { id: 'portal', label: 'Portal' },
  { id: 'troca', label: 'Troca de contador' },
  { id: 'honorarios', label: 'Honorários' },
];

export const FAQ: { q: string; a: string; topic: FaqTopic }[] = [
  {
    topic: 'portal',
    q: 'Como recebo o acesso ao portal?',
    a: 'O escritório envia o link do convite para o seu e-mail e você cria a conta com ele. Depois é só entrar pelo botão Portal do cliente, no topo desta página.',
  },
  {
    topic: 'portal',
    q: 'Esqueci a senha. E agora?',
    a: 'Na tela de entrada, use “Esqueci minha senha”: chega um link no seu e-mail para criar outra. Se o e-mail não chegar, fale com o escritório.',
  },
  {
    topic: 'portal',
    q: 'O portal tem verificação em duas etapas?',
    a: 'Tem. Nas configurações da sua conta você ativa o código do aplicativo autenticador, e ele passa a ser pedido a cada novo acesso.',
  },
  {
    topic: 'troca',
    q: 'Posso trocar de contador no meio do ano?',
    a: 'Pode. A troca não espera o fim do ano: o escritório assume a partir de uma competência combinada, e o contador anterior entrega o que foi feito até ali.',
  },
  {
    topic: 'troca',
    q: 'O que o contador anterior precisa entregar?',
    a: 'Os livros, as declarações entregues e os acessos (a procuração no e-CAC, as senhas da prefeitura) até a competência da troca. O escritório combina a entrega direto com ele.',
  },
  {
    topic: 'honorarios',
    q: 'Quanto custam os honorários?',
    a: 'Dependem do regime, do número de funcionários e do volume de notas. A proposta vem por escrito depois da primeira conversa, sem compromisso.',
  },
  {
    topic: 'honorarios',
    q: 'O que entra nos honorários?',
    a: 'O que estiver na proposta: ela lista cada serviço contratado e o que entra em cada um, e o contrato sai daí.',
  },
];
