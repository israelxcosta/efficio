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

/** As pastas do topo: cada aba abre uma seção, e a seção tem a cor da sua pasta. */
export const CHAPTERS = [
  { id: 'mes', label: 'O seu mês' },
  { id: 'servicos', label: 'Serviços' },
  { id: 'portal', label: 'Portal' },
  { id: 'comecar', label: 'Como começar' },
  { id: 'contato', label: 'Contato' },
] as const;

export type ServiceId = 'contabil' | 'fiscal' | 'folha' | 'abertura' | 'planejamento' | 'financeiro' | 'certidoes';

export interface Service {
  id: ServiceId;
  /** A palavra da lista-pôster (minúscula, uma linha). */
  word: string;
  /** Nome completo do serviço (assunto do contato). */
  name: string;
  /** O que o serviço entrega. */
  detail: string;
}

export const SERVICES: Service[] = [
  { id: 'contabil', word: 'contabilidade', name: 'Contabilidade', detail: 'Balancete todo mês, balanço e DRE no fim do ano, ECD e ECF.' },
  { id: 'fiscal', word: 'fiscal', name: 'Fiscal e tributário', detail: 'Apuração e guias: DAS, DCTFWeb, EFD-Reinf, SPED e notas.' },
  { id: 'folha', word: 'folha', name: 'Departamento pessoal', detail: 'Admissão, holerite, férias, rescisão, eSocial e FGTS Digital.' },
  { id: 'abertura', word: 'abertura', name: 'Abertura e alteração de empresas', detail: 'Abrir, alterar o contrato social, mudar de endereço ou encerrar.' },
  { id: 'planejamento', word: 'planejamento', name: 'Planejamento tributário', detail: 'Escolha do regime, pró-labore e distribuição de lucros.' },
  { id: 'financeiro', word: 'financeiro', name: 'BPO financeiro', detail: 'Contas a pagar e a receber, conciliação e relatório do mês.' },
  { id: 'certidoes', word: 'certidões', name: 'Certidões', detail: 'CND federal, CRF do FGTS, estadual e municipal, com a validade.' },
];

/** Frases do portal: cada uma com a consequência em números (dados de exemplo das telas). */
export const PORTAL_FEATURES = [
  { id: 'guias', sentence: 'As guias chegam antes do vencimento', result: 'DAS de setembro anexado em 17/10, três dias antes do vencimento.', on: true },
  { id: 'pendencias', sentence: 'O que depende de você fica separado', result: '1 pendência: extratos bancários de setembro, pedidos em 06/10.', on: false },
  { id: 'documentos', sentence: 'Cada documento guardado no seu mês', result: 'Setembro de 2026: 9 arquivos, entre guias, holerites e recibos.', on: true },
  { id: 'prazos', sentence: 'Os prazos do mês num calendário', result: 'Outubro: 7 entregas, 5 concluídas, 1 em andamento e 1 aguardando você.', on: false },
  { id: 'seguranca', sentence: 'Entrada com verificação em duas etapas', result: 'Código de 6 dígitos do aplicativo autenticador a cada novo acesso.', on: false },
] as const;

export type StepId = 'conversa' | 'proposta' | 'transicao' | 'portal' | 'rotina';

export const STEPS: { id: StepId; name: string; text: string }[] = [
  {
    id: 'conversa',
    name: 'Conversa',
    text: 'Você conta como a empresa funciona: a atividade, o regime de hoje, quantas pessoas trabalham e quantas notas saem por mês.',
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

export const FAQ = [
  {
    q: 'Como recebo o acesso ao portal?',
    a: 'O escritório envia o link do convite para o seu e-mail e você cria a conta com ele. Depois é só entrar pelo botão Portal do cliente, no topo desta página.',
  },
  {
    q: 'Esqueci a senha. E agora?',
    a: 'Na tela de entrada, use “Esqueci minha senha”: chega um link no seu e-mail para criar outra. Se o e-mail não chegar, fale com o escritório.',
  },
  {
    q: 'O portal tem verificação em duas etapas?',
    a: 'Tem. Nas configurações da sua conta você ativa o código do aplicativo autenticador, e ele passa a ser pedido a cada novo acesso.',
  },
  {
    q: 'Posso trocar de contador no meio do ano?',
    a: 'Pode. A troca não espera o fim do ano: o escritório assume a partir de uma competência combinada, e o contador anterior entrega o que foi feito até ali.',
  },
  {
    q: 'Quanto custam os honorários?',
    a: 'Dependem do regime, do número de funcionários e do volume de notas. A proposta vem por escrito depois da primeira conversa, sem compromisso.',
  },
] as const;
