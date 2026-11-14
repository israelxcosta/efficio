// Tarefas › the hub of icons in the page headers (spec §2.9): Ver is a nav of links (one current page),
// Criar a group of buttons hidden on phones; the names live only in the tooltip and the aria-label.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { rolePermissions, type PermissionKey } from '@effinance/shared';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createActions, hubViewHref, hubViewItems, type HubViewItem } from '../task-hub';
import { TasksHubView } from './tasks-hub';

const owner = rolePermissions('owner');
const can = (k: PermissionKey) => owner[k] === true;

function render(views: HubViewItem[] = hubViewItems(can)) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/tarefas/auditoria']}>
      <TooltipProvider>
        <TasksHubView
          views={views}
          active="audit"
          hrefOf={(id) => hubViewHref(id, '/tarefas/auditoria', new URLSearchParams())}
          replaceViews={false}
          creates={createActions(can)}
          blockedReason={null}
          onCreate={() => {}}
          onApplyTemplate={() => {}}
          onAdHocProcess={() => {}}
        />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('TasksHubView', () => {
  it('has the nav of pages with the seven names once each and one current page', () => {
    const html = render();
    expect(html).toContain('aria-label="Páginas de tarefas"');
    for (const name of ['Lista', 'Quadro', 'Calendário', 'Auditoria mensal', 'Tarefas recorrentes', 'Grupos por regime', 'Processos'])
      expect(count(html, `aria-label="${name}"`)).toBe(1);
    expect(count(html, 'aria-current="page"')).toBe(1);
    const at = html.indexOf('aria-current="page"');
    const current = html.slice(html.lastIndexOf('<a', at), html.indexOf('>', at));
    expect(current).toContain('href="/tarefas/auditoria"');
  });

  it('has the Criar group with the four buttons, hidden on phones', () => {
    const html = render();
    const at = html.indexOf('role="group"');
    expect(at).toBeGreaterThan(-1);
    const group = html.slice(html.lastIndexOf('<', at), html.indexOf('>', at));
    expect(group).toContain('aria-label="Criar"');
    expect(group).toContain('max-sm:hidden');
    for (const name of ['Nova tarefa', 'Novo compromisso', 'Nova tarefa recorrente', 'Novo processo']) expect(count(html, `aria-label="${name}"`)).toBe(1);
  });

  it('names each item only in attributes on the computer, and under the icon on touch or narrow screens', () => {
    const html = render();
    const captions = [...html.matchAll(/<span data-hub-caption="true" aria-hidden="true" class="([^"]*)">([^<]*)<\/span>/g)];
    expect(captions.map((c) => c[2])).toEqual(['Lista', 'Quadro', 'Calendário', 'Auditoria', 'Recorrentes', 'Por regime', 'Processos', 'Tarefa', 'Compromisso', 'Recorrente', 'Processo']);
    for (const [, cls = ""] of captions) {
      expect(cls.split(' ')).toContain('hidden');
      expect(cls).toContain('max-sm:block');
      expect(cls).toContain('sm:pointer-coarse:block');
    }
    // Outside the captions there is no text: the full names stay in the tooltip and the aria-label.
    const text = html.replace(/<span data-hub-caption[^>]*>[^<]*<\/span>/g, '').replace(/="[^"]*"/g, '');
    expect(text).not.toMatch(/>[^<\s]+</);
  });

  it('keeps each visible name inside its accessible name (WCAG 2.5.3)', () => {
    for (const v of hubViewItems(can)) expect(v.label.toLowerCase()).toContain(v.short.toLowerCase());
    for (const a of createActions(can)) expect(a.label.toLowerCase()).toContain(a.short.toLowerCase());
  });

  it('draws the divider only when there are pages after the views', () => {
    expect(render()).toContain('data-hub-divider');
    expect(render(hubViewItems(can).filter((v) => v.group === 'views'))).not.toContain('data-hub-divider');
  });
});
