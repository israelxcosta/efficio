// Relatórios › Evolução (spec §4.3): the bridge of the monthly fee with who came in and who left, and
// the month-by-month table.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { formatBRL } from '@effinance/shared';
import { TooltipProvider } from '@/components/ui/tooltip';
import { EvolutionBridgeView } from './evolution-bridge';
import { countAxis } from './evolution-charts';
import { evolutionRows } from './evolution-logic';
import { EvolutionTableView } from './evolution-table';
import { evolutionMonth, m, still, withLists } from './test-fixtures';

const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <TooltipProvider>{node}</TooltipProvider>
    </MemoryRouter>,
  );

describe('ponte do honorário', () => {
  it('builds the fee bridge with who came in and who left', () => {
    const html = wrap(<EvolutionBridgeView current={withLists.sepChurn} previous={withLists.aug} />);
    expect(html).toContain('Honorário mensal: agosto → setembro');
    expect(html).toContain('Base de agosto');
    expect(html).toContain('Base de setembro');
    expect(html).toContain('Quem saiu');
    expect(html).toContain('Devedora');
    expect(html).toContain('Inadimplência'); // INACTIVATION_REASON_LABELS.default
    expect(html).toContain(`−${formatBRL(50_000)}/mês`);
    expect(html).toContain('Ninguém entrou em setembro.');
  });

  it('lists who came in with the fee each one brings', () => {
    const html = wrap(<EvolutionBridgeView current={withLists.oct} previous={withLists.sep} />);
    expect(html).toContain('Quem entrou (1)');
    expect(html).toContain('Grande Cliente');
    expect(html).toContain(`+${formatBRL(200_000)}/mês`);
    expect(html).toContain('Ninguém saiu em outubro.');
  });

  it('shows the first 5 of a list and says how many more', () => {
    const many = evolutionMonth({
      month: '2026-10',
      recurringFees: 700_000,
      newList: Array.from({ length: 7 }, (_, i) => ({ id: `n${i}`, name: `Cliente ${i + 1}`, fee: 100_000 })),
    });
    const html = wrap(<EvolutionBridgeView current={many} previous={withLists.sep} />);
    expect(html).toContain('Cliente 5');
    expect(html).not.toContain('Cliente 6');
    expect(html).toContain('+ 2');
  });

  it('says when nobody came in or left, and when there is no previous month', () => {
    expect(wrap(<EvolutionBridgeView current={still} previous={withLists.sep} />)).toContain('Nenhum cliente entrou ou saiu em outubro.');
    expect(wrap(<EvolutionBridgeView current={m[0]!} previous={undefined} />)).toContain('Sem o mês anterior na janela');
  });
});

describe('mês a mês', () => {
  it('renders a semantic month-by-month table, newest first, with signs', () => {
    const html = wrap(<EvolutionTableView rows={evolutionRows(m)} active="2026-10" onPick={() => {}} />);
    expect(html).toMatch(/<table[\s\S]*<th[^>]*>Mês<\/th>/);
    expect(html.indexOf('Out/26')).toBeLessThan(html.indexOf('Set/26'));
    expect(html).toContain('−1');
    expect(html).toContain('parcial');
    expect(html).toContain('até hoje');
    expect(html).toContain(`−${formatBRL(30_000)}`);
  });

  it('marks the reference month and leaves the changes of the oldest one empty', () => {
    const html = wrap(<EvolutionTableView rows={evolutionRows(m)} active="2026-09" onPick={() => {}} />);
    expect(html).toMatch(/aria-current="true"[\s\S]*?Set\/26/);
    expect(html).toContain('referência');
    const august = html.slice(html.indexOf('Ago/26'), html.indexOf('</tr>', html.indexOf('Ago/26')));
    expect(august).toContain('—');
  });
});

describe('count axis of "Carteira mês a mês"', () => {
  it('uses whole steps that hold the base and the moves', () => {
    expect(countAxis([9, 8, 1, -1, 0])).toEqual({ domain: [-3, 9], ticks: [-3, 0, 3, 6, 9] });
    expect(countAxis([12, 4, -1])).toEqual({ domain: [-3, 12], ticks: [-3, 0, 3, 6, 9, 12] });
    expect(countAxis([1, 0])).toEqual({ domain: [0, 2], ticks: [0, 1, 2] });
    expect(countAxis([0])).toEqual({ domain: [0, 3], ticks: [0, 1, 2, 3] });
  });
});
