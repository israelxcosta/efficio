// Tarefas › the "Repetição" field of the task form (spec §9.4): the segmented control, the block with the
// rule (fields by frequency), the live summary and the notice of a moved first date.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { defaultRepeatForm, type RepeatForm } from '../repeat-rules';
import { RepeatFieldView } from './repeat-field';

const START = '2026-11-10';

function render(patch: { on?: boolean; form?: Partial<RepeatForm>; canRegistry?: boolean } = {}) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TooltipProvider>
        <RepeatFieldView
          on={patch.on ?? true}
          onToggle={() => {}}
          form={{ ...defaultRepeatForm(START), ...patch.form }}
          onForm={() => {}}
          start={START}
          today="2026-11-05"
          errors={{}}
          readOnly={false}
          canRegistry={patch.canRegistry ?? false}
        />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

const tagWith = (html: string, needle: string) => {
  const at = html.indexOf(needle);
  return at < 0 ? '' : html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
};

describe('RepeatFieldView', () => {
  it('starts as "Não se repete", with nothing else', () => {
    const html = render({ on: false });
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Repetição"');
    expect(html).toMatch(/aria-checked="true"[^>]*>Não se repete</);
    expect(html).not.toContain('Frequência');
  });

  it('weekly: seven day buttons with their full names, the start weekday on, and "A cada N semana"', () => {
    const html = render({ form: { frequency: 'weekly' } });
    const days = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
    for (const d of days) expect(tagWith(html, `aria-label="${d}"`)).toContain('aria-pressed=');
    expect(tagWith(html, 'aria-label="Terça-feira"')).toContain('aria-pressed="true"');
    expect(tagWith(html, 'aria-label="Segunda-feira"')).toContain('aria-pressed="false"');
    expect(html).toContain('A cada');
    expect(html).toContain('>semana<');
  });

  it('annual: no "A cada", and the month', () => {
    const html = render({ form: { frequency: 'annual' } });
    expect(html).not.toContain('A cada');
    expect(html).toContain('>Mês<');
  });

  it('offers the registry only to who has it', () => {
    expect(render({ canRegistry: false })).not.toContain('Recorrente para vários clientes');
    expect(render({ canRegistry: true })).toContain('Recorrente para vários clientes');
  });

  it('says the summary politely and warns when the first date moves', () => {
    const html = render({ form: { frequency: 'weekly', weekdays: [1, 3] } });
    const live = html.slice(html.indexOf('aria-live="polite"'));
    expect(live.slice(0, live.indexOf('</p>'))).toContain('Toda semana na segunda e na quarta');
    expect(html).toContain('Esta tarefa passa a vencer em 11/11 (qua), o primeiro dia da regra.');
  });
});
