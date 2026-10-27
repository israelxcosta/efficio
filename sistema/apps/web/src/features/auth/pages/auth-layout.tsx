import type { ReactNode } from 'react';
import { ArrowDown, ArrowRight, Building2, ChartLine, HandCoins, Landmark, Receipt, Truck } from 'lucide-react';

const NODES = [
  { icon: Building2, title: 'Clientes', text: 'Contratos e vigências' },
  { icon: HandCoins, title: 'Honorários', text: 'Gerados por competência' },
  { icon: Receipt, title: 'A pagar', text: 'Vencimentos em dia' },
  { icon: Truck, title: 'Fornecedores', text: 'Quem a empresa paga' },
  { icon: Landmark, title: 'Contas', text: 'Saldos e conciliação' },
  { icon: ChartLine, title: 'Relatórios', text: 'Competência e caixa' },
];

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <span className="text-lg font-extrabold tracking-tight">efficio</span>
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
          <h2 className="max-w-md text-[28px] leading-tight font-semibold tracking-tight">O financeiro da empresa num lugar só</h2>
          <p className="mt-2 max-w-md text-sm text-muted">Honorários, cobrança, contas a pagar e relatórios pelo regime de competência e de caixa.</p>
          <div className="mt-10 grid max-w-md grid-cols-2 gap-x-10 gap-y-8">
            {NODES.map((n, i) => (
              <div key={n.title} className="relative rounded-lg border border-border bg-surface p-3.5">
                <div className="flex items-center gap-2.5">
                  <n.icon className="size-4 text-muted" aria-hidden />
                  <span className="text-sm font-semibold">{n.title}</span>
                </div>
                <p className="mt-2 text-xs text-muted">{n.text}</p>
                {i % 2 === 0 ? (
                  <ArrowRight className="absolute top-1/2 -right-8 size-4 -translate-y-1/2 text-brand-700" aria-hidden />
                ) : i < NODES.length - 1 ? (
                  <ArrowDown className="absolute -bottom-7 left-1/2 size-4 -translate-x-1/2 text-brand-700" aria-hidden />
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-12 max-w-md rounded-xl bg-hero-from p-5 text-white">
            <p className="text-xs text-white/75">Competência 10/2026</p>
            <p className="mt-1 text-[15px] font-semibold">7 honorários gerados, vencimentos de 05 a 20/11</p>
            <p className="mt-1 text-xs text-white/75">Cada cliente vence no dia do cadastro; quem paga em dia recebe o desconto combinado.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
