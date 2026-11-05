// Auditoria mensal › the occurrence row of both views (spec §11.2): one column per datum, the
// conclusion in its own columns (aria-hidden: the control already says it), the delay in amber and in
// words, the date without colour.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { makeCell, makeOccurrence } from '../test-fixtures';
import { AuditColumnsHeader, AuditOccurrenceRowView, type AuditOccurrenceRowViewProps } from './audit-occurrence-row';

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
  it('says only "Concluída" beside the control, and the delay below in amber, in words', () => {
    const situation = col(render(), 'situation');
    expect(situation).toContain('controle');
    expect(situation).toMatch(/text-success[^>]*>Concluída</);
    expect(situation).not.toContain('Concluída por');
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
    expect(col(html, 'situation')).toMatch(/text-brand-text[^>]*>Em andamento</);
  });
});

describe('the deadline column', () => {
  const pending = makeCell({ status: 'todo', targetDate: '2026-10-15', legalDueDate: '2026-10-20', overdue: true });

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

describe('the columns header', () => {
  it('names the columns of each level, hidden from screen readers', () => {
    const html = renderToStaticMarkup(<AuditColumnsHeader lead="client" />);
    expect(html).toContain('aria-hidden="true"');
    for (const label of ['Cliente', 'Departamento', 'Responsável', 'Prazo', 'Situação', 'Data de conclusão', 'Concluída por', 'Conclusão']) expect(html).toContain(`>${label}<`);
    expect(renderToStaticMarkup(<AuditColumnsHeader lead="obligation" />)).toContain('>Obrigação<');
  });
});
