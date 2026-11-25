// Cards of the Início on the free board (the same one as the Painel financeiro and the Minha área):
// move, resize by the corner, hide and "Organizar" in "Personalizar". Sizes are columns (1–4) × rows
// of 96px; the default heights follow each card's content, so the default board has no empty bands.

import type { BoardConfig } from '@/features/dashboard/layout/layout-store';
import type { WidgetGroupSpec, WidgetSize, WidgetSpec } from '@/features/dashboard/layout/types';

export const HOME_GROUPS: WidgetGroupSpec[] = [
  { id: 'tarefas', title: 'Tarefas e prazos' },
  { id: 'equipe', title: 'Equipe e processos' },
  { id: 'clientes', title: 'Clientes e vencimentos' },
];

const WIDE: WidgetSize[] = [
  { c: 2, r: 3 },
  { c: 2, r: 4 },
  { c: 2, r: 5 },
  { c: 4, r: 3 },
  { c: 4, r: 4 },
];
const SMALL: WidgetSize[] = [
  { c: 1, r: 3 },
  { c: 1, r: 4 },
  { c: 2, r: 3 },
];

/** Half the board wide by default (charts and lists need it); up to the full width, 2 to 7 rows. */
function wide(id: string, group: string, title: string, description: string, rows: number): WidgetSpec {
  return { id, group, title, description, defaultSize: { c: 2, r: rows }, min: { c: 2, r: 2 }, max: { c: 4, r: 7 }, presets: WIDE };
}

/** The due-date cards: a quarter of the board, four side by side. */
function small(id: string, title: string, description: string): WidgetSpec {
  return { id, group: 'clientes', title, description, defaultSize: { c: 1, r: 3 }, min: { c: 1, r: 2 }, max: { c: 4, r: 6 }, presets: SMALL };
}

/** In reading order: each card takes the first free space. */
const ALL: WidgetSpec[] = [
  wide('mine', 'tarefas', 'Minhas tarefas', 'Suas tarefas abertas, das atrasadas às próximas.', 4),
  wide('status', 'tarefas', 'Situação das tarefas', 'Atrasadas, pendentes e concluídas na competência.', 3),
  wide('flow', 'tarefas', 'Fluxo de tarefas por dia', 'Quantas vencem em cada um dos próximos 7 dias.', 3),
  wide('processes', 'equipe', 'Processos por departamento', 'Andamento das recorrentes de cada departamento.', 3),
  wide('agenda', 'tarefas', 'Agenda', 'Os próximos prazos legais com clientes pendentes.', 3),
  wide('assignees', 'equipe', 'Por responsável', 'Tarefas abertas e atrasadas de cada pessoa.', 3),
  wide('fiscal', 'tarefas', 'Pendências fiscais', 'Obrigações da competência e quantas faltam.', 4),
  wide('clients', 'clientes', 'Visão geral dos clientes', 'Clientes em atenção, com pendências e em dia.', 3),
  small('cert', 'Certificados digitais', 'Certificados vencidos e a vencer.'),
  small('docs', 'Laudos', 'Laudos e documentos com validade.'),
  small('conv', 'Convenções coletivas', 'Datas-base das convenções dos clientes.'),
  small('fees', 'Honorários próximos de vencer', 'Vigências de honorários que terminam em breve.'),
  wide('incomplete', 'clientes', 'Cadastro incompleto', 'Clientes com dados faltando no cadastro.', 4),
  wide('requests', 'clientes', 'Pedidos dos clientes', 'Tarefas pedidas pelos clientes, ainda abertas.', 3),
];

/** The fees card needs access to the finances; everyone else gets the same board. */
export const HOME_BOARD: BoardConfig = { storagePrefix: 'effinance.tasks.home-board.v1', specs: ALL };
export const HOME_BOARD_NO_FEES: BoardConfig = { storagePrefix: 'effinance.tasks.home-board.v1', specs: ALL.filter((s) => s.id !== 'fees') };
