import { describe, expect, it } from 'vitest';
import { pendingNoticeText, pendingPeriodText, periodError, retentionRuleText } from './audit-retention';

describe('audit retention notice', () => {
  it('explains the rule with the months kept', () => {
    expect(retentionRuleText(24)).toBe('Registros com mais de 24 meses são apagados automaticamente.');
  });

  it('says how many records go, of which period and when', () => {
    const pending = { count: 12, from: '2024-11-01', to: '2024-11-30', purgeDate: '2026-11-20' };
    expect(pendingNoticeText(pending)).toBe('12 registros (01/11/2024 a 30/11/2024) serão apagados a partir de 20/11/2026.');
    expect(pendingNoticeText({ ...pending, count: 1, to: '2024-11-01' })).toBe('1 registro (01/11/2024) será apagado a partir de 20/11/2026.');
    expect(pendingPeriodText(pending)).toBe('01/11/2024 a 30/11/2024');
  });

  it('validates the download period', () => {
    expect(periodError('', '2026-11-01')).toBe('Informe o início e o fim do período.');
    expect(periodError('2026-11-02', '2026-11-01')).toBe('O início deve ser antes do fim.');
    expect(periodError('2026-11-01', '2026-11-01')).toBeNull();
  });
});
