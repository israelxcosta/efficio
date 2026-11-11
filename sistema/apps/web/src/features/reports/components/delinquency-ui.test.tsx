// Inadimplência v2 (spec §5.3 and §6.3): Carteira por risco, the score cell with the rework and its
// composition, the risk labels and the help of the score.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { client, demoClients } from '../test-fixtures';
import { clientReportHref, SCORE_HELP, ScoreCell } from './delinquency-clients';
import { PortfolioRiskCardView, RiskBadge } from './delinquency-gauges';

const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <TooltipProvider>{node}</TooltipProvider>
    </MemoryRouter>,
  );

describe('Carteira por risco', () => {
  it('shows the risk distribution without a gradient', () => {
    const html = wrap(<PortfolioRiskCardView clients={demoClients} probability={0.29} from="2025-12-01" to="2026-11-10" />);
    expect(html).toContain('2 de 10');
    expect(html).toContain('clientes em risco alto ou crítico');
    expect(html).not.toContain('linearGradient');
    expect(html).toContain('3 clientes com retrabalho');
    expect(html).toContain('(4 tarefas em 90 dias)');
    expect(html).toContain('cerca de 1 em cada 3 mensalidades');
    expect(html).toContain('Score de 12 meses · vencimentos de 01/12/2025 a 10/11/2026');
  });

  it('lists the bands from the worst, with the open amount of each', () => {
    const html = wrap(<PortfolioRiskCardView clients={demoClients} probability={0.29} from="2025-12-01" to="2026-11-10" />);
    const list = html.slice(html.indexOf('aria-label="Clientes por faixa de risco"'));
    const order = ['Crítico', 'Risco alto', 'Atenção', 'Baixo risco'].map((label) => list.indexOf(label));
    expect(order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1]!))).toBe(true);
    expect(html).toContain('R$ 6.480,00');
    expect(html).toContain('Rota Sul e Ju Prado Design · em aberto');
    expect(html).toContain('nenhum cliente');
  });

  it('says when nobody has rework and nobody is at risk', () => {
    const calm = [client({ name: 'Só Um' })];
    const html = wrap(<PortfolioRiskCardView clients={calm} probability={0} from="2025-12-01" to="2026-11-10" />);
    expect(html).toContain('0 de 1');
    expect(html).toContain('Nenhum cliente com retrabalho nos últimos 90 dias');
    expect(html).toContain('Nenhum atraso no histórico recente');
  });
});

describe('score cell', () => {
  it('says the rework next to the score and explains the parts', () => {
    const html = wrap(
      <ScoreCell
        client={client({ rework: { last90Days: 3, last12Months: 3, latest: [] }, punctuality: 916, openPenalty: 0, reworkPenalty: 120, score: 796, risk: 'moderado' })}
      />,
    );
    expect(html).toContain('3 retrabalhos em 90 dias');
    expect(html).toContain('Pontualidade 916 · retrabalho −120 = 796');
  });

  it('has no rework line without rework', () => {
    expect(wrap(<ScoreCell client={client({})} />)).not.toContain('retrabalho');
  });
});

describe('risk and help', () => {
  it('labels the low risk band as "Baixo risco", in grey', () => {
    const html = wrap(<RiskBadge risk="baixo" />);
    expect(html).toContain('Baixo risco');
    expect(html).not.toContain('success');
  });

  it('explains the score v2 in fixed words', () => {
    expect(SCORE_HELP).toBe(
      'Score de 0 a 1000 (maior = melhor), sempre sobre os últimos 12 meses. Parte da pontualidade: cada mensalidade atrasada pesa pela gravidade (1 a 5 dias 25%, 6 a 15 dias 50%, 16 a 30 dias 75%, mais de 30 dias 100%), os meses recentes valem mais (6 meses atrás vale metade) e quem tem pouco histórico parte de 20%. Depois desconta 50 pontos por mensalidade vencida em aberto (até 250), 40 por retrabalho nos últimos 90 dias e 10 por retrabalho de até 12 meses (até 200). Faixas: 800+ Baixo risco · 600–799 Atenção · 400–599 Risco alto · abaixo de 400 Crítico.',
    );
  });

  it('opens the client report without the period (the score is always of 12 months)', () => {
    expect(clientReportHref('abc')).toBe('/relatorios/cliente/abc');
  });
});
