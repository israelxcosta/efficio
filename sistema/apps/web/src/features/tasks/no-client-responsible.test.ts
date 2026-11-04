// There is no responsible per client and department any more: a recurring task's occurrences go to its
// default responsible (or wait in the department's queue), or to whoever was assigned by hand.
import { describe, expect, it } from 'vitest';
import { assigneeSourceText } from './occurrence';
import { distributionText, distributionTip } from './recurring-rules';

const ana = { id: 'ana', name: 'Ana Paula' };
const bruno = { id: 'bruno', name: 'Bruno Carvalho' };

describe('who receives the occurrences of a recurring task', () => {
  const r = {
    distribution: [
      { assignee: ana, source: 'default' as const, count: 12 },
      { assignee: bruno, source: 'manual' as const, count: 1 },
      { assignee: null, source: null, count: 2 },
    ],
  };

  it('says the default responsible and who got one by hand, never a client responsible', () => {
    expect(distributionText(r)).toBe('Hoje: Ana P. 12 (padrão) · Bruno C. 1 (à mão) · sem responsável 2');
    expect(distributionTip(r)).toBe('Ana P. 12 (padrão) · Bruno C. 1 (à mão) · sem responsável 2');
    expect(distributionText({ distribution: [] })).toBe('');
  });

  it('names the source of an occurrence responsible in the words of the screen', () => {
    expect(assigneeSourceText('default')).toBe('Responsável padrão da recorrente');
    expect(assigneeSourceText('manual')).toBe('Atribuída só nesta competência');
    expect(assigneeSourceText(null)).toBeNull();
  });
});
