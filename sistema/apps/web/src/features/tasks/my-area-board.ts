// Cards of the Minha área on the free board (the same one as the Painel financeiro): move, resize by
// the corner, hide and "Organizar" in "Personalizar". Sizes are columns (1–4) × rows of 96px.

import type { BoardConfig } from '@/features/dashboard/layout/layout-store';
import type { WidgetGroupSpec, WidgetSize, WidgetSpec } from '@/features/dashboard/layout/types';

export const MY_AREA_GROUPS: WidgetGroupSpec[] = [
  { id: 'trabalho', title: 'Seu trabalho' },
  { id: 'equipe', title: 'Departamento e clientes' },
];

const PRESETS: WidgetSize[] = [
  { c: 2, r: 3 },
  { c: 2, r: 4 },
  { c: 2, r: 5 },
  { c: 4, r: 3 },
  { c: 4, r: 4 },
];

/** Half the board wide by default; from half to the full width, 3 to 7 rows tall. */
function card(id: string, group: string, title: string, description: string, rows: number, minRows = 3): WidgetSpec {
  return { id, group, title, description, defaultSize: { c: 2, r: rows }, min: { c: 2, r: minRows }, max: { c: 4, r: 7 }, presets: PRESETS };
}

/** In reading order: each card takes the first free space, so the default board has no holes. */
export const MY_AREA_SPECS: WidgetSpec[] = [
  card('mine', 'trabalho', 'Minhas tarefas', 'Suas tarefas abertas, das atrasadas às próximas.', 4),
  card('for-you', 'trabalho', 'Para você', 'Avisos sobre o seu trabalho.', 3, 2),
  card('calendar', 'trabalho', 'Calendário', 'Os dias do mês com tarefas, suas ou do departamento.', 4, 4),
  card('rhythm', 'trabalho', 'Seu ritmo', 'Suas conclusões nos últimos meses.', 4),
  card('department', 'equipe', 'Meu departamento', 'Andamento do departamento na competência.', 3),
  card('notes', 'trabalho', 'Anotações', 'Suas anotações mais recentes.', 3, 2),
  card('clients', 'equipe', 'Clientes com mais pendências', 'Quem tem mais tarefas em aberto.', 3),
  card('comments', 'equipe', 'Comentários recentes', 'Os últimos comentários nas tarefas.', 3, 2),
];

export const MY_AREA_BOARD: BoardConfig = { storagePrefix: 'effinance.tasks.my-area-board.v1', specs: MY_AREA_SPECS };
