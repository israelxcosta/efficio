import type { MemberRole } from '@effinance/shared';

// Names of the roles on screen (spec §2.6). The roles stay `owner`, `editor` and `viewer` in the API;
// `packages/shared` still carries the older labels (Editor, Leitor), so the web uses these until the
// contract is updated.

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Proprietário',
  editor: 'Administrador',
  viewer: 'Colaborador',
};

export const ROLE_HINTS: Record<MemberRole, string> = {
  owner: 'Administrador com controle da assinatura, dos membros e do espaço',
  editor: 'Acessa o financeiro e mantém clientes e cadastros da gestão',
  viewer: 'Usa toda a gestão de tarefas; não vê o financeiro nem honorários',
};
