import { isValidElement, type ReactElement } from 'react';
import type { RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { FinanceGate } from '@/components/layout/finance-gate';
import { FINANCE_NAV_ITEMS, GESTAO_NAV_ITEMS } from '@/components/layout/nav';
import { routes } from './routes';

const shell = routes.find((r) => r.path === '/')!;
const children = shell.children ?? [];
const gate = children.find((r) => isValidElement(r.element) && (r.element as ReactElement).type === FinanceGate);
const paths = (list: RouteObject[] | undefined) => (list ?? []).map((r) => (r.index ? '' : r.path));

describe('app routes', () => {
  it('wraps every finance page in the FinanceGate layout route', () => {
    expect(gate).toBeDefined();
    const inside = paths(gate!.children);
    for (const item of FINANCE_NAV_ITEMS) expect(inside).toContain(item.to.slice(1));
    for (const extra of ['cartoes/:id', 'relatorios/cliente/:id', 'contatos']) expect(inside).toContain(extra);
  });

  it('leaves no finance page outside the gate', () => {
    const outside = children.filter((r) => r !== gate).flatMap((r) => [r.path, ...paths(r.children)]);
    for (const item of FINANCE_NAV_ITEMS) expect(outside).not.toContain(item.to.slice(1));
  });

  it('makes the Gestão the start page, with its pages under /tarefas', () => {
    const gestao = children.find((r) => paths(r.children).includes(''))!;
    expect(gestao).toBeDefined();
    expect(gestao).not.toBe(gate);
    const inside = paths(gestao.children);
    for (const item of GESTAO_NAV_ITEMS) expect(inside).toContain(item.to === '/' ? '' : item.to.slice(1));
  });

  it('keeps settings and the 404 for everyone', () => {
    expect(paths(children)).toEqual(expect.arrayContaining(['configuracoes', '*']));
  });
});
