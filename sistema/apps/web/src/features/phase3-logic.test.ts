import { describe, expect, it } from 'vitest';
import {
  CONTRACT_FACTORY_BLOCKS,
  rolePermissions,
  type DeadlinesSummary,
  type UnionConvention,
  type UnionListSummary,
} from '@effinance/shared';
import { navItemsFor, pagePermissionOf, railItemsFor, GESTAO_NAV_ITEMS } from '@/components/layout/nav';
import { notificationsLabel } from '@/components/layout/notifications';
import {
  adjustmentTitle,
  bellDeadlines,
  deadlineClass,
  deadlineKindFromParam,
  documentNoun,
  documentsSummary,
  groupByDeadline,
  mostUrgentText,
  renewalDueDate,
  renewalTitle,
  sortByDeadline,
  stripParts,
  stripTone,
  urgentCount,
} from '@/features/deadlines/deadline-logic';
import {
  blockCharWarning,
  fromDraft,
  importBlocks,
  insertAtCursor,
  moveBlock,
  placeholderOptions,
  sameBlocks,
  sampleValues,
  templateDescription,
  toDraft,
} from '@/features/office/contract-editor-logic';
import { paginate } from '@/features/office/components/contract-preview';
import {
  adjustedKeys,
  adjustmentSummary,
  defaultHint,
  draftChanged,
  draftEffective,
  memberAccessLine,
  resetDraftKey,
  setDraftKey,
  setDraftRole,
} from '@/features/settings/member-access';
import { settingsTabsFor } from '@/features/settings/pages/settings';
import { cyclesChanged, cyclesForDialog, draftTracked, longDueDate, newlyPublished, toggleCycle, unionInitials, unionsDescription } from '@/features/unions/union-logic';
import { clampCrop, cropRect, checkImageFile } from '@/lib/image';

const summary = (patch: Partial<DeadlinesSummary> = {}): DeadlinesSummary => ({
  today: '2026-11-04',
  documents: { overdue: 0, within30: 0, within60: 0 },
  conventions: { overdue: 0, within30: 0, within60: 0 },
  overdueTotal: 0,
  overdueConvention: null,
  ...patch,
});

describe('permissions per person (spec §13.10)', () => {
  it('keeps only the keys that differ from the role default', () => {
    const d1 = setDraftKey({ role: 'viewer', overrides: {} }, 'registry', true);
    expect(d1.overrides).toEqual({ registry: true });
    // Back to the default value: the adjustment goes away.
    expect(setDraftKey(d1, 'registry', false).overrides).toEqual({});
    expect(resetDraftKey(d1, 'registry').overrides).toEqual({});
    expect(draftEffective(d1).registry).toBe(true);
  });

  it('changing the role moves the defaults and keeps the adjustments', () => {
    const d = setDraftKey({ role: 'viewer', overrides: {} }, 'page.reports', false);
    const asEditor = setDraftRole(d, 'editor');
    expect(draftEffective(asEditor)).toMatchObject({ finance: true, registry: true, 'page.reports': false });
    // An adjustment equal to the new default stops counting.
    const e = setDraftRole(setDraftKey({ role: 'viewer', overrides: {} }, 'finance', true), 'editor');
    expect(adjustedKeys(e.role, e.overrides)).toEqual([]);
  });

  it('says what changed against what is stored', () => {
    expect(draftChanged({ role: 'viewer', overrides: {} }, { role: 'viewer', overrides: {} })).toBe(false);
    expect(draftChanged({ role: 'editor', overrides: {} }, { role: 'viewer', overrides: {} })).toBe(true);
    // A no-op adjustment is not a change.
    expect(draftChanged({ role: 'viewer', overrides: { finance: false } }, { role: 'viewer', overrides: {} })).toBe(false);
  });

  it('writes the member lines of Configurações › Membros and the team tooltip', () => {
    expect(memberAccessLine({ role: 'viewer', permissionOverrides: {} })).toBe('Colaborador');
    expect(memberAccessLine({ role: 'viewer', permissionOverrides: { registry: true, 'page.reports': false } })).toBe('Colaborador · 2 ajustes');
    expect(memberAccessLine({ role: 'editor', permissionOverrides: { finance: false } })).toBe('Administrador · sem financeiro');
    expect(memberAccessLine({ role: 'editor', permissionOverrides: { finance: false, deleteTasks: false } })).toBe('Administrador · sem financeiro · 1 ajuste');
    expect(adjustmentSummary({ role: 'viewer', permissionOverrides: { registry: true, 'page.reports': false } })).toBe('Cadastros da gestão: ligado · Relatórios de tarefas: oculto');
    expect(defaultHint('viewer', 'finance')).toBe('Padrão de Colaborador: desligado');
    // The owner is never adjusted.
    expect(adjustedKeys('owner', { finance: false })).toEqual([]);
  });

  it('hides the pages of `page.*` from the rail and ⌘K, never Início and Tarefas', () => {
    const hidden = new Set(['page.audit', 'page.registry']);
    const can = (k: string) => !hidden.has(k);
    const items = navItemsFor('gestao', can).map((i) => i.to);
    expect(items).toContain('/');
    expect(items).toContain('/tarefas');
    expect(items).not.toContain('/tarefas/auditoria');
    expect(items).not.toContain('/tarefas/cadastros');
    expect(navItemsFor('gestao', () => false).map((i) => i.to)).toEqual(['/', '/tarefas']);
    expect(navItemsFor('gestao')).toBe(GESTAO_NAV_ITEMS);
    expect(railItemsFor('gestao', () => false).map((i) => i.to)).toEqual(['/', '/tarefas']);
    // The hub pages leave the rail but stay in ⌘K.
    const canOwner = () => true;
    const all = navItemsFor('gestao', canOwner).map((i) => i.to);
    expect(all).toEqual(expect.arrayContaining(['/tarefas/auditoria', '/tarefas/recorrentes', '/tarefas/processos']));
    expect(railItemsFor('gestao', canOwner).map((i) => i.to)).not.toContain('/tarefas/auditoria');
  });

  it('maps each Gestão path to its page key (the URL shows "Acesso restrito")', () => {
    expect(pagePermissionOf('/tarefas/auditoria')).toBe('page.audit');
    expect(pagePermissionOf('/tarefas/recorrentes')).toBe('page.recurring');
    expect(pagePermissionOf('/tarefas/processos')).toBe('page.processes');
    expect(pagePermissionOf('/tarefas/cadastros')).toBe('page.registry');
    expect(pagePermissionOf('/TAREFAS/Clientes')).toBe('page.clients');
    expect(pagePermissionOf('/tarefas')).toBeNull();
    expect(pagePermissionOf('/')).toBeNull();
    expect(pagePermissionOf('/configuracoes')).toBeNull();
  });

  it('shows the Escritório tab only with `office`', () => {
    expect(settingsTabsFor(false, false)).toEqual(['perfil', 'seguranca', 'membros', 'privacidade']);
    expect(settingsTabsFor(true, true)).toEqual(['perfil', 'seguranca', 'membros', 'escritorio', 'assinatura', 'integracoes', 'privacidade']);
    expect(settingsTabsFor(true, false)).not.toContain('escritorio');
    expect(settingsTabsFor(false, true)).toContain('escritorio');
    expect(rolePermissions('editor').office).toBe(true);
  });
});

describe('deadlines (spec §6.10)', () => {
  it('builds the strip of the home page', () => {
    expect(stripParts(summary())).toEqual([]);
    const parts = stripParts(
      summary({
        documents: { overdue: 2, within30: 3, within60: 1 },
        conventions: { overdue: 1, within30: 0, within60: 0 },
        overdueConvention: { unionId: 'u1', name: 'SINDCOM', days: 12 },
      }),
    );
    expect(parts.map((p) => `${p.count ?? ''} ${p.text}`.trim())).toEqual([
      '2 documentos vencidos',
      '3 vencem em até 30 dias',
      'convenção do SINDCOM vencida há 12 dias',
    ]);
    expect(parts[2]!.unionId).toBe('u1');
    // Without overdue documents the noun stays in the "em até 30 dias" piece.
    expect(stripParts(summary({ documents: { overdue: 0, within30: 1, within60: 0 } }))[0]!.text).toBe('documento vence em até 30 dias');
    expect(stripParts(summary({ conventions: { overdue: 2, within30: 1, within60: 0 } })).map((p) => p.text)).toEqual([
      'convenções vencidas',
      'convenção vence em até 30 dias',
    ]);
    expect(stripTone(summary({ documents: { overdue: 0, within30: 4, within60: 0 } }))).toBe('warning');
    expect(stripTone(summary({ conventions: { overdue: 1, within30: 0, within60: 0 } }))).toBe('danger');
  });

  it('counts only what is overdue in the bell, and names it in the accessible label', () => {
    const s = summary({ documents: { overdue: 1, within30: 3, within60: 0 }, conventions: { overdue: 2, within30: 2, within60: 0 } });
    expect(bellDeadlines(s)).toEqual({ documents: 1, conventions: 2, soon: 5 });
    expect(bellDeadlines(undefined)).toEqual({ documents: 0, conventions: 0, soon: 0 });
    expect(notificationsLabel(2, 3, { documents: 1, conventions: 0 })).toBe('Notificações (2 tarefas atrasadas, 3 contas vencidas, 1 documento vencido)');
    expect(notificationsLabel(0, null, { documents: 0, conventions: 2 })).toBe('Notificações (2 convenções vencidas)');
    expect(notificationsLabel(0, 0)).toBe('Notificações');
    expect(urgentCount({ overdue: 2, within30: 3 })).toBe(5);
  });

  it('groups the sheet rows and leaves empty groups out', () => {
    const rows = [{ b: 'within30' }, { b: 'overdue' }, { b: 'noDate' }, { b: 'later' }] as const;
    expect(groupByDeadline(rows, (r) => r.b).map((g) => g.key)).toEqual(['overdue', 'within30', 'noDate']);
  });

  it('suggests the renewal task: title and due date 7 days before (never before today)', () => {
    expect(renewalTitle('Certificado digital (e-CNPJ A1/A3)')).toBe('Renovar certificado digital');
    expect(renewalTitle('CND federal (Receita e PGFN)')).toBe('Renovar CND federal');
    expect(renewalTitle('AVCB/CLCB (bombeiros)')).toBe('Renovar AVCB/CLCB');
    expect(documentNoun('Alvará de funcionamento')).toBe('alvará de funcionamento');
    expect(renewalDueDate('2026-12-20', '2026-11-04')).toBe('2026-12-13');
    expect(renewalDueDate('2026-11-08', '2026-11-04')).toBe('2026-11-04');
    expect(renewalDueDate('2026-10-01', '2026-11-04')).toBe('2026-11-04');
    expect(renewalDueDate(null, '2026-11-04')).toBe('2026-11-04');
    expect(adjustmentTitle('SINDCOM', '2026/2027')).toBe('Aplicar o reajuste da convenção SINDCOM 2026/2027');
  });

  it('colors and orders the documents of a client', () => {
    expect(deadlineClass({ bucket: 'overdue', days: -3 })).toContain('text-danger');
    expect(deadlineClass({ bucket: 'within30', days: 0 })).toBe('font-semibold text-warning');
    expect(deadlineClass({ bucket: 'within30', days: 12 })).toBe('font-medium text-warning');
    expect(deadlineClass({ bucket: 'within60', days: 45 })).toBe('text-muted');
    expect(deadlineClass({ bucket: 'noDate', days: null })).toBe('text-subtle');
    const docs = [
      { id: 'a', expiresAt: null, deadline: { bucket: 'noDate' as const } },
      { id: 'b', expiresAt: '2026-12-30', deadline: { bucket: 'within60' as const } },
      { id: 'c', expiresAt: '2026-11-10', deadline: { bucket: 'within30' as const } },
      { id: 'd', expiresAt: '2026-10-01', deadline: { bucket: 'overdue' as const } },
    ];
    expect(sortByDeadline(docs).map((d) => d.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(documentsSummary(docs)).toEqual([
      { text: '1 vencido', tone: 'danger' },
      { text: '1 vence em até 30 dias', tone: 'warning' },
    ]);
    expect(mostUrgentText({ name: 'Certificado digital (e-CNPJ A1/A3)', deadline: { days: -3 } })).toBe('Certificado digital venceu há 3 dias');
    expect(mostUrgentText({ name: 'Alvará de funcionamento', deadline: { days: 12 } })).toBe('Alvará de funcionamento vence em 12 dias');
  });

  it('reads the sheet param', () => {
    expect(deadlineKindFromParam('documentos')).toBe('documents');
    expect(deadlineKindFromParam('convencoes')).toBe('conventions');
    expect(deadlineKindFromParam('x')).toBeNull();
  });
});

describe('unions and collective agreements (spec §13.7)', () => {
  const s: UnionListSummary = { active: 12, inactive: 1, overdue: 2, within30: 1, within60: 0, ok: 8, noBaseMonth: 1, overdueClients: 9 };

  it('describes the tab', () => {
    expect(unionsDescription(s)).toBe('12 sindicatos ativos · 2 convenções vencidas, 1 vence em até 30 dias');
    expect(unionsDescription({ ...s, overdue: 0, within30: 0 })).toBe('12 sindicatos ativos · nenhuma convenção vence nos próximos 60 dias');
    expect(unionsDescription({ ...s, overdue: 0, within30: 0, within60: 2 })).toBe('12 sindicatos ativos · 2 vencem em 31 a 60 dias');
    expect(unionInitials({ acronym: 'SINDCOM', name: 'x' })).toBe('SC');
    expect(unionInitials({ acronym: 'SINSAÚDE', name: 'x' })).toBe('SS');
    expect(unionInitials({ acronym: 'CUT', name: 'x' })).toBe('CU');
    expect(unionInitials({ acronym: null, name: 'Sindicato dos Comerciários' })).toBe('SC');
    expect(longDueDate(2026, 11)).toBe('1º de novembro de 2026');
  });

  it('checking the last cycle adds the next; unchecking removes the following unpublished ones', () => {
    const stored: UnionConvention[] = [{ year: 2025, label: '2025/2026', published: true, publishedAt: null, publishedBy: null, note: null }];
    let draft = cyclesForDialog(stored, 2026);
    expect(draft.map((c) => [c.year, c.published])).toEqual([
      [2025, true],
      [2026, false],
    ]);
    draft = toggleCycle(draft, 2026, true);
    expect(draft.map((c) => [c.year, c.published])).toEqual([
      [2025, true],
      [2026, true],
      [2027, false],
    ]);
    expect(draftTracked(11, draft, '2026-11-04')?.year).toBe(2027);
    expect(newlyPublished(stored, draft)).toEqual([2026]);
    expect(cyclesChanged(stored, draft)).toBe(true);
    // Unchecking 2026 removes 2027 (not published) and goes back to tracking 2026.
    draft = toggleCycle(draft, 2026, false);
    expect(draft.map((c) => c.year)).toEqual([2025, 2026]);
    expect(cyclesChanged(stored, draft)).toBe(false);
    expect(draftTracked(11, draft, '2026-11-04')?.label).toBe('2026/2027');
    expect(draftTracked(null, draft, '2026-11-04')).toBeNull();
  });
});

describe('contract template editor (spec §13.9)', () => {
  it('moves, inserts and imports blocks without touching the rest', () => {
    expect(moveBlock(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveBlock(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveBlock(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
    expect(insertAtCursor('Olá , tudo bem', 4, 4, '[NOME SOCIO CLIENTE]')).toEqual({ text: 'Olá [NOME SOCIO CLIENTE], tudo bem', caret: 24 });
    expect(insertAtCursor('abcdef', 1, 3, 'X').text).toBe('aXdef');
    const current = toDraft([{ type: 'paragraph', text: 'A' }]);
    expect(importBlocks(current, [{ type: 'heading1', text: 'B' }], 'append').map((b) => b.text)).toEqual(['A', 'B']);
    expect(importBlocks(current, [{ type: 'heading1', text: 'B' }], 'replace').map((b) => b.text)).toEqual(['B']);
  });

  it('saves the blocks without the row keys and compares them by content', () => {
    const draft = toDraft(CONTRACT_FACTORY_BLOCKS);
    const out = fromDraft(draft);
    expect(out.some((b) => 'key' in b)).toBe(false);
    expect(sameBlocks(out, CONTRACT_FACTORY_BLOCKS)).toBe(true);
    expect(sameBlocks(out, [...CONTRACT_FACTORY_BLOCKS.slice(1)])).toBe(false);
    // A spacer never carries text; the discount rule stays.
    expect(fromDraft(toDraft([{ type: 'spacer' }]))).toEqual([{ type: 'spacer' }]);
    expect(out.find((b) => b.rule === 'discount')).toBeTruthy();
  });

  it('warns near the block limit and describes the template', () => {
    expect(blockCharWarning(100)).toBeNull();
    expect(blockCharWarning(19_850)).toBe('19.850 de 20.000 caracteres');
    expect(templateDescription({ source: 'factory', updatedAt: null, updatedBy: null })).toBe('Contrato de prestação de serviços contábeis · modelo de fábrica');
    expect(templateDescription({ source: 'custom', updatedAt: '2026-10-12T10:00:00Z', updatedBy: { id: 'u', name: 'Ana Paula Ribeiro' } })).toBe(
      'Contrato de prestação de serviços contábeis · modelo próprio, editado por Ana P. em 12/10/2026',
    );
  });

  it('offers the fields grouped by origin and fills the preview with an example client', () => {
    const groups = [...new Set(placeholderOptions().map((o) => o.group))];
    expect(groups).toEqual(['Cliente', 'Escritório', 'Honorário']);
    const values = sampleValues(null);
    expect(values['[RAZAO SOCIAL CLIENTE]']).toBe('Padaria Pão Dourado Ltda');
    expect(values['[VALOR HONORARIOS]']).toBe('R$ 1.200,00');
    // Office fields not registered keep their marker (absent from the values).
    expect(values['[CNPJ ESCRITORIO]']).toBeUndefined();
  });

  it('packs blocks into A4 pages by height', () => {
    expect(paginate([400, 400, 400], 1000)).toEqual([[0, 1], [2]]);
    expect(paginate([1200, 100], 1000)).toEqual([[0], [1]]);
    expect(paginate([500, 500], 1000, 100)).toEqual([[0], [1]]);
    expect(paginate([], 1000)).toEqual([[]]);
  });
});

describe('images (logo, watermark, profile photo)', () => {
  it('accepts PNG, JPG and WebP within the size, never SVG', () => {
    expect(checkImageFile({ type: 'image/png', size: 1000 }, 500 * 1024, 'grande')).toEqual({ ok: true });
    expect(checkImageFile({ type: 'image/svg+xml', size: 10 }, 500 * 1024, 'grande')).toEqual({ ok: false, error: 'Use PNG, JPG ou WebP.' });
    expect(checkImageFile({ type: 'image/jpeg', size: 600 * 1024 }, 500 * 1024, 'A logo passa de 500 KB.')).toEqual({ ok: false, error: 'A logo passa de 500 KB.' });
  });

  it('crops a centered square that never leaves the image', () => {
    expect(cropRect(400, 200, { zoom: 1, x: 0, y: 0 })).toEqual({ sx: 100, sy: 0, size: 200 });
    expect(cropRect(400, 200, { zoom: 2, x: 0, y: 0 })).toEqual({ sx: 150, sy: 50, size: 100 });
    // Dragged far to the right: stops at the left edge of the image.
    expect(cropRect(400, 200, { zoom: 1, x: 5, y: 0 }).sx).toBe(0);
    expect(clampCrop(400, 200, { zoom: 1, x: 5, y: 3 })).toEqual({ zoom: 1, x: 0.5, y: 0 });
  });
});
