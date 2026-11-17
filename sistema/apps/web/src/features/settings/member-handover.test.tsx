// Removing a member with open work (migration 0024): the 409 opens "Quem assume?" with the counts, and
// the removal goes again with `?replacementId=`.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Member } from '@effinance/shared';
import { ApiRequestError } from '@/lib/api';
import { memberRemovalPath } from '@/features/workspaces/api';
import { handoverCountsOf, handoverLines, HandoverBody } from './member-handover';

const m = (userId: string, name: string, patch: Partial<Member> = {}): Member => ({
  userId,
  name,
  email: `${userId}@x.com`,
  role: 'editor',
  permissionOverrides: {},
  photoUpdatedAt: null,
  joinedAt: '2026-01-01T00:00:00Z',
  isYou: false,
  ...patch,
});
const conflict = (details: unknown) => new ApiRequestError(409, { error: 'conflict', message: 'Bruno ainda responde por…', details } as never);

describe('member removal: who takes over', () => {
  it('reads the counts of the 409 and nothing else', () => {
    expect(handoverCountsOf(conflict({ openTasks: 3, recurringTasks: 1, flowSteps: 0 }))).toEqual({ openTasks: 3, recurringTasks: 1, flowSteps: 0 });
    expect(handoverCountsOf(conflict(undefined))).toBeNull();
    expect(handoverCountsOf(conflict({ openTasks: '3' }))).toBeNull();
    expect(handoverCountsOf(new ApiRequestError(400, { error: 'validation_error', message: 'x', details: { openTasks: 1, recurringTasks: 0, flowSteps: 0 } } as never))).toBeNull();
    expect(handoverCountsOf(new Error('x'))).toBeNull();
  });

  it('words what the person answers for', () => {
    expect(handoverLines({ openTasks: 3, recurringTasks: 1, flowSteps: 2 })).toEqual(['3 tarefas abertas', '1 tarefa recorrente (responsável padrão)', '2 etapas de processo aguardando']);
    expect(handoverLines({ openTasks: 1, recurringTasks: 0, flowSteps: 0 })).toEqual(['1 tarefa aberta']);
  });

  it('shows the counts and offers the other members, you first', () => {
    const bruno = m('bruno', 'Bruno Carvalho');
    const html = renderToStaticMarkup(
      <HandoverBody
        person={bruno}
        counts={{ openTasks: 3, recurringTasks: 1, flowSteps: 0 }}
        candidates={[m('me', 'Marina Costa', { isYou: true, role: 'owner' }), m('ana', 'Ana Ribeiro')]}
        value="me"
        onChange={() => {}}
      />,
    );
    expect(html).toContain('Bruno Carvalho ainda responde por:');
    expect(html).toContain('3 tarefas abertas');
    expect(html).toContain('1 tarefa recorrente (responsável padrão)');
    expect(html).not.toContain('etapa');
    expect(html).toContain('Marina Costa (você)');
    expect(html).toContain('Quem assume');
  });

  it('sends the removal again with the replacement', () => {
    expect(memberRemovalPath('bruno')).toBe('/workspaces/current/members/bruno');
    expect(memberRemovalPath('bruno', '0a000000-0000-4000-8000-000000000001')).toBe('/workspaces/current/members/bruno?replacementId=0a000000-0000-4000-8000-000000000001');
  });
});
