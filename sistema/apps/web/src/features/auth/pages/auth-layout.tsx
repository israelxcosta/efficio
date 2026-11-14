import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowDown, ArrowRight, BadgeCheck, BarChart3, CalendarClock, ListChecks, Users, Wallet } from 'lucide-react';

/** What the team's system holds, in the order of a month (side panel of the auth screens). */
export const TEAM_NODES = [
  { icon: CalendarClock, title: 'Obrigações', text: 'Prazos legais da competência' },
  { icon: ListChecks, title: 'Tarefas', text: 'Responsável e situação de cada uma' },
  { icon: Users, title: 'Clientes', text: 'Cadastro, contrato e honorários' },
  { icon: Wallet, title: 'Financeiro', text: 'Contas a pagar e a receber' },
  { icon: BadgeCheck, title: 'Certificados', text: 'Com a validade de cada um' },
  { icon: BarChart3, title: 'Relatórios', text: 'Pontualidade e inadimplência' },
];

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        {/* Back to the office's site (visitors see it at `/`; signed-in users at `/site`). */}
        <Link to="/site" className="self-start text-lg font-extrabold tracking-tight" aria-label="Efficio Contabilidade: voltar ao site">
          efficio
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-[28px] font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-6 text-center text-sm text-muted">{footer}</div>
        </div>
        <p className="text-xs text-subtle">© {new Date().getFullYear()} Efficio Contabilidade</p>
      </div>
      <div className="relative hidden overflow-hidden border-l border-border bg-surface-muted lg:block">
        <div className="relative flex h-full flex-col justify-center px-14 py-12">
          <h2 className="max-w-md text-[28px] leading-tight font-semibold tracking-tight">O mês do escritório num só lugar</h2>
          <p className="mt-2 max-w-md text-sm text-muted">Sistema interno da equipe: as obrigações e as tarefas de cada cliente, os honorários e os relatórios.</p>
          <div className="mt-10 grid max-w-md grid-cols-2 gap-x-10 gap-y-8">
            {TEAM_NODES.map((n, i) => (
              <div key={n.title} className="relative rounded-lg border border-border bg-surface p-3.5">
                <div className="flex items-center gap-2.5">
                  <n.icon className="size-4 text-muted" aria-hidden />
                  <span className="text-sm font-semibold">{n.title}</span>
                </div>
                <p className="mt-2 text-xs text-muted">{n.text}</p>
                {i % 2 === 0 ? (
                  <ArrowRight className="absolute top-1/2 -right-8 size-4 -translate-y-1/2 text-brand-700" aria-hidden />
                ) : i < TEAM_NODES.length - 1 ? (
                  <ArrowDown className="absolute -bottom-7 left-1/2 size-4 -translate-x-1/2 text-brand-700" aria-hidden />
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-12 max-w-md rounded-xl bg-hero-from p-5 text-white">
            <p className="text-xs text-white/75">Competência 10/2026</p>
            <p className="mt-1 text-[15px] font-semibold">5 de 7 entregas concluídas, 1 aguardando o cliente</p>
            <p className="mt-1 text-xs text-white/75">Extratos bancários de setembro, pedidos em 06/10 para o balancete. Dados de exemplo.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
