"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = { href: string; rotulo: string; admin?: boolean };
type Grupo = { titulo: string; itens: Item[] };

const GRUPOS: Grupo[] = [
  { titulo: "", itens: [{ href: "/", rotulo: "Painel" }] },
  {
    titulo: "Cadastros",
    itens: [
      { href: "/empresas", rotulo: "Empresas" },
      { href: "/horarios", rotulo: "Horários" },
      { href: "/empregados", rotulo: "Empregados" },
      { href: "/feriados", rotulo: "Feriados" },
      { href: "/faixas", rotulo: "Faixas de horas extras" },
    ],
  },
  {
    titulo: "Ponto",
    itens: [
      { href: "/lancamentos", rotulo: "Lançamentos" },
      { href: "/importacao", rotulo: "Importar arquivo" },
    ],
  },
  {
    titulo: "Sistema",
    itens: [
      { href: "/configuracoes", rotulo: "Configurações", admin: true },
      { href: "/usuarios", rotulo: "Usuários", admin: true },
    ],
  },
];

export function Menu({ admin, nome, sair }: { admin: boolean; nome: string; sair: () => Promise<void> }) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(false);
  const ativo = (href: string) => (href === "/" ? caminho === "/" : caminho === href || caminho.startsWith(`${href}/`));

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <span className="text-xl font-bold text-marca-600">efficio</span>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls="menu-lateral"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          {aberto ? "Fechar" : "Menu"}
        </button>
      </div>
      <aside
        id="menu-lateral"
        className={`${aberto ? "block" : "hidden"} border-b border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-64 lg:border-r lg:border-b-0`}
      >
        <div className="flex h-full flex-col">
          <div className="hidden px-6 py-5 lg:block">
            <span className="text-2xl font-bold tracking-tight text-marca-600">efficio</span>
            <span className="ml-2 text-xs font-medium tracking-wide text-slate-400 uppercase">ponto</span>
          </div>
          <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 lg:py-2" aria-label="Menu principal">
            {GRUPOS.map((g) => {
              const itens = g.itens.filter((i) => !i.admin || admin);
              if (!itens.length) return null;
              return (
                <div key={g.titulo || "inicio"}>
                  {g.titulo && (
                    <p className="mb-1 px-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">{g.titulo}</p>
                  )}
                  <ul className="space-y-0.5">
                    {itens.map((i) => (
                      <li key={i.href}>
                        <Link
                          href={i.href}
                          onClick={() => setAberto(false)}
                          aria-current={ativo(i.href) ? "page" : undefined}
                          className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 aria-[current=page]:bg-marca-50 aria-[current=page]:text-marca-700"
                        >
                          {i.rotulo}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
          <div className="border-t border-slate-200 px-4 py-4">
            <p className="truncate text-sm font-medium text-slate-700">{nome}</p>
            <form action={sair}>
              <button type="submit" className="mt-1 text-sm text-slate-500 hover:text-red-600">
                Sair
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
