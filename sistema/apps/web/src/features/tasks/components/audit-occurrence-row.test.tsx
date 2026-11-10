// Auditoria mensal › the occurrence row of both views (spec §11.2): one column per datum, the
// conclusion in its own columns (aria-hidden: the control already says it), the delay in amber and in
// words, the date without colour.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { makeCell, makeOccurrence } from '../test-fixtures';
import { AuditClientRowView, AuditColumnsHeader, AuditOccurrenceRowView, type AuditOccurrenceRowViewProps } from './audit-occurrence-row';

const TODAY = '2026-10-28';
const column = makeOccurrence({ name: 'Folha de pagamento', targetDate: '2026-10-15', legalDueDate: '2026-10-20' });
const client = { name: 'Pão Quente', taxRegime: 'simples_nacional' as const, monthConcludedAt: null };
const late = makeCell({ status: 'done', targetDate: '2026-10-15', legalDueDate: '2026-10-20', concludedBy: { id: 'm', name: 'Marina Costa' }, concludedAt: '2026-10-22T10:45:00Z' });

function render(patch: Partial<AuditOccurrenceRowViewProps> = {}) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <ul>
        <AuditOccurrenceRowView lead="obligation" cell={late} column={column} client={client} today={TODAY} control={<button type="button">controle</button>} dimmed={false} onOpenTask={() => {}} {...patch} />
      </ul>
    </TooltipProvider>,
  );
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** Markup of the first element carrying `data-col="<name>"` (balanced tags; no DOM in these tests). */
function col(html: string, name: string): string {
  const at = html.indexOf(`data-col="${name}"`);
  if (at < 0) return '';
  const start = html.lastIndexOf('<', at);
  const tag = /<\/?([a-zA-Z0-9]+)[^>]*?(\/?)>/g;
  tag.lastIndex = start;
  let depth = 0;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    const closing = m[0].startsWith('</');
    if (!closing && (VOID.has(m[1]!.toLowerCase()) || m[2] === '/')) continue;
    depth += closing ? -1 : 1;
    if (depth === 0) return html.slice(start, tag.lastIndex);
  }
  return html.slice(start);
}

describe('a concluded occurrence', () => {
  it('keeps only the control beside it and, late, the delay in amber, in words (no "Concluída": the glyph says it)', () => {
    const situation = col(render(), 'situation');
    expect(situation).toContain('controle');
    expect(situation).not.toContain('Concluída');
    expect(situation).toMatch(/text-warning[^>]*>2 dias de atraso</);
  });

  it('fills "Data de conclusão" (no colour) and "Concluída por", hidden from screen readers', () => {
    const html = render();
    const date = col(html, 'concluded-at');
    expect(date).toContain('aria-hidden="true"');
    expect(date).toContain('22/10, 07:45');
    expect(date).not.toMatch(/text-(warning|danger)/);
    const by = col(html, 'concluded-by');
    expect(by).toContain('aria-hidden="true"');
    expect(by).toContain('Marina C.');
    const merged = col(html, 'conclusion');
    expect(merged).toContain('aria-hidden="true"');
    expect(merged).toContain('22/10, 07:45');
    expect(merged).toContain('Marina C.');
  });

  it('shows "—" in "Concluída por" when the person was not recorded (old data), and no date without the moment', () => {
    const html = render({ cell: { ...late, concludedBy: null, concludedAt: null } });
    expect(col(html, 'concluded-by')).toContain('—');
    expect(col(html, 'concluded-at')).not.toMatch(/\d{2}\/\d{2}/);
  });

  it('sums up the conclusion in the stacked rows, the time only from @sm and the delay that may wrap', () => {
    const stacked = col(render(), 'stacked-situation');
    expect(stacked).toContain('Concluída');
    expect(stacked).toContain('em 22/10');
    expect(stacked).toMatch(/class="[^"]*\bhidden\b[^"]*@sm:inline[^"]*">[^<]*em 22\/10, 07:45/);
    expect(stacked).toContain('Marina C.');
    expect(stacked).toMatch(/font-medium text-warning[^>]*>[^<]*2 dias de atraso/);
  });
});

describe('a pending occurrence', () => {
  it('leaves the conclusion columns blank (no "—": the situation already says it is pending)', () => {
    const html = render({ cell: makeCell({ status: 'in_progress', targetDate: '2026-10-15', legalDueDate: '2026-10-20', overdue: true }) });
    expect(col(html, 'concluded-at')).not.toMatch(/\d{2}\/\d{2}|—/);
    expect(col(html, 'concluded-by')).not.toContain('—');
    expect(col(html, 'situation')).not.toContain('Em andamento');
  });

  it('labels the situation only in the exceptions (revision 4)', () => {
    expect(col(render({ cell: makeCell({ status: 'todo' }) }), 'situation')).not.toContain('A fazer');
    expect(col(render({ cell: makeCell({ status: 'waiting_client' }) }), 'situation')).toContain('Aguardando');
    expect(col(render({ cell: makeCell({ status: 'canceled' }) }), 'situation')).toContain('Cancelada');
  });

  it('has no third stacked line while pending without an exception', () => {
    expect(col(render({ cell: makeCell({ status: 'todo' }) }), 'stacked-situation')).toBe('');
    // "Concluída" in green and the rest muted: the text reads on across the two spans.
    expect(col(render(), 'stacked-situation').replace(/<[^>]+>/g, '')).toContain('Concluída em 22/10');
    expect(col(render({ cell: makeCell({ status: 'waiting_client' }) }), 'stacked-situation')).toContain('Aguardando');
  });

  it('writes who and the target on the second stacked line, with the alert in its tone', () => {
    const pending = makeCell({ status: 'todo', assignee: { id: 'j', name: 'Juliana Martins' }, targetDate: '2026-10-24', legalDueDate: '2026-10-26' });
    const meta = col(render({ cell: pending }), 'stacked-meta');
    expect(meta).toContain('Juliana M. · meta 24/10');
    expect(meta).toMatch(/text-danger[^>]*>[^<]*Prazo legal venceu há 2 dias/);
  });
});

describe('the deadline column', () => {
  const pending = makeCell({ status: 'todo', targetDate: '2026-10-15', legalDueDate: '2026-10-20', overdue: true });

  it('"Por cliente": only the alert on the second line (the first is the target)', () => {
    const late = makeCell({ status: 'todo', targetDate: '2026-10-24', legalDueDate: '2026-10-26' });
    const deadline = col(render({ cell: late }), 'deadline');
    expect(deadline).toContain('Prazo legal venceu há 2 dias');
    expect(deadline).not.toContain('Meta em');
    const soon = col(render({ cell: makeCell({ status: 'todo', targetDate: '2026-11-03', legalDueDate: '2026-11-05' }) }), 'deadline');
    expect(soon).toMatch(/text-muted[^>]*>legal 05\/11</);
    expect(soon).not.toContain('Meta em');
  });

  it('"Por cliente": the target and, below, how the deadline stands, in its tone', () => {
    const deadline = col(render({ cell: pending }), 'deadline');
    expect(deadline).toContain('Prazo: ');
    expect(deadline).toContain('15/10');
    expect(deadline).toMatch(/text-danger[^>]*>Prazo legal venceu há 8 dias</);
  });

  it('"Por tarefa": only the target (the task row says the rest), unless the client has other dates', () => {
    expect(col(render({ lead: 'client', cell: pending }), 'deadline')).not.toContain('Prazo legal venceu');
    const adjusted = col(render({ lead: 'client', cell: { ...pending, targetDate: '2026-10-18' } }), 'deadline');
    expect(adjusted).toContain('18/10');
    expect(adjusted).toContain('Prazo legal venceu há 8 dias');
  });

  it('concluded: "legal 20/10" when the target comes before the legal deadline', () => {
    expect(col(render(), 'deadline')).toMatch(/text-muted[^>]*>legal 20\/10</);
  });
});

describe('the lead column', () => {
  it('"Por tarefa" shows the client, the lock of a concluded month and the regime', () => {
    const html = render({ lead: 'client', client: { ...client, monthConcludedAt: '2026-10-27T19:40:00Z' } });
    const lead = col(html, 'lead');
    expect(lead).toContain('Pão Quente');
    expect(lead).toContain('Mês concluído');
    expect(lead).toContain('Simples Nacional');
    expect(lead).toContain('@lg:pl-10');
  });

  it('"Por cliente" shows the obligation, and the department in the subtitle only below the wide level', () => {
    const html = render();
    expect(col(html, 'lead')).toContain('Folha de pagamento');
    expect(col(html, 'lead')).toMatch(/@6xl:hidden[^>]*>Fiscal/);
    expect(col(html, 'department')).toContain('Departamento: ');
    expect(col(html, 'assignee')).toContain('Responsável: ');
  });
});

describe('the columns header (one per card, revision 4)', () => {
  const firstLabel = (html: string) => html.replace(/<[^>]+>/g, '|').split('|').filter(Boolean)[0];

  it('names the columns of each level, hidden from screen readers', () => {
    const html = renderToStaticMarkup(<AuditColumnsHeader view="client" />);
    expect(html).toContain('aria-hidden="true"');
    for (const label of ['Cliente', 'Departamento', 'Responsável', 'Prazo', 'Situação', 'Data de conclusão', 'Concluída por', 'Conclusão']) expect(html).toContain(`>${label}<`);
  });

  it('starts with the parent row of the view: Cliente or Tarefa recorrente', () => {
    expect(firstLabel(renderToStaticMarkup(<AuditColumnsHeader view="client" />))).toBe('Cliente');
    expect(firstLabel(renderToStaticMarkup(<AuditColumnsHeader view="task" />))).toBe('Tarefa recorrente');
  });
});

describe('the client row of "Por cliente" (revision 4)', () => {
  const rowClient = {
    id: 'c1',
    name: 'Pão Quente',
    legalName: 'Pão Quente Ltda',
    document: '12345678000190',
    taxRegime: 'simples_nacional' as const,
    total: 9,
    done: 7,
    canceled: 0,
    inProgress: 0,
    overduePending: 2,
    targetMissedPending: 0,
    monthConcludedAt: null as string | null,
  };
  const cells = [
    makeCell({ status: 'todo', targetDate: '2026-11-07' }),
    makeCell({ status: 'in_progress', targetDate: '2026-11-10' }),
    makeCell({ status: 'done', targetDate: '2026-10-20' }),
  ];
  const renderRow = (patch: Partial<typeof rowClient> & { monthConcludedAt?: string | null } = {}, rowCells = cells) =>
    renderToStaticMarkup(
      <TooltipProvider>
        <AuditClientRowView client={{ ...rowClient, ...patch }} cells={rowCells} today={TODAY} expanded={false} regionId="r" />
      </TooltipProvider>,
    );

  it('shows the progress, the alert and the nearest target, without the CNPJ', () => {
    const html = renderRow();
    expect(html).toContain('7/9');
    expect(html).toContain('2 atrasadas');
    expect(html).toContain('07/11');
    expect(html).not.toContain('12.345.678');
  });

  it('puts the moment of a concluded month in the conclusion track', () => {
    const html = renderRow({ done: 9, overduePending: 0, monthConcludedAt: '2026-10-27T17:32:00Z' }, [makeCell({ status: 'done' })]);
    expect(col(html, 'concluded-at')).toContain('27/10, 14:32');
  });
});
