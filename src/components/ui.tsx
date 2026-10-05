import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const variantes = {
  primario: "bg-marca-600 text-white hover:bg-marca-700 shadow-xs",
  secundario: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-xs",
  perigo: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
  fantasma: "text-marca-700 hover:bg-marca-50",
} as const;
export type Variante = keyof typeof variantes;

export const classeBotao = (variante: Variante = "primario", extra?: string) =>
  cx(
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
    "disabled:cursor-not-allowed disabled:opacity-60",
    variantes[variante],
    extra,
  );

export function Botao({ variante = "primario", className, ...props }: ComponentProps<"button"> & { variante?: Variante }) {
  return <button className={classeBotao(variante, className)} {...props} />;
}

export function LinkBotao({ variante = "primario", className, ...props }: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={classeBotao(variante, className)} {...props} />;
}

export function Cabecalho({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-balance">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-slate-500">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Cartao({ titulo, descricao, children, className }: { titulo?: string; descricao?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6", className)}>
      {titulo && (
        <header className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-sm text-slate-500">{descricao}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Campo({
  rotulo,
  nome,
  erro,
  dica,
  children,
  className,
}: {
  rotulo: string;
  nome: string;
  erro?: string[];
  dica?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("min-w-0", className)}>
      <label htmlFor={nome} className="mb-1 block text-sm font-medium text-slate-700">
        {rotulo}
      </label>
      {children}
      {erro?.length ? (
        <p id={`${nome}-erro`} className="mt-1 text-xs text-red-600">
          {erro[0]}
        </p>
      ) : dica ? (
        <p className="mt-1 text-xs text-slate-500">{dica}</p>
      ) : null}
    </div>
  );
}

export function Entrada({ erro, className, ...props }: ComponentProps<"input"> & { erro?: string[] }) {
  return (
    <input
      id={props.name}
      aria-invalid={erro?.length ? true : undefined}
      aria-describedby={erro?.length ? `${props.name}-erro` : undefined}
      className={cx("campo", className)}
      {...props}
    />
  );
}

export function Selecao({ erro, className, children, ...props }: ComponentProps<"select"> & { erro?: string[] }) {
  return (
    <select
      id={props.name}
      aria-invalid={erro?.length ? true : undefined}
      className={cx("campo", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Tabela({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
      <table className="w-full text-left text-sm [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-3 [&_tbody_tr]:border-t [&_tbody_tr]:border-slate-100 [&_tbody_tr:hover]:bg-slate-50">
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th className={cx("bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase", className)}>{children}</th>
  );
}

const tons = {
  neutro: "bg-slate-100 text-slate-700",
  marca: "bg-marca-50 text-marca-700",
  sucesso: "bg-emerald-50 text-emerald-700",
  alerta: "bg-amber-50 text-amber-800",
  perigo: "bg-red-50 text-red-700",
  noite: "bg-indigo-50 text-indigo-700",
} as const;

export function Selo({ tom = "neutro", children }: { tom?: keyof typeof tons; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tons[tom])}>
      {children}
    </span>
  );
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="font-medium text-slate-700">{titulo}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Aviso({ tom = "info", children }: { tom?: "info" | "erro" | "sucesso" | "alerta"; children: ReactNode }) {
  const t = {
    info: "border-marca-200 bg-marca-50 text-marca-900",
    erro: "border-red-200 bg-red-50 text-red-800",
    sucesso: "border-emerald-200 bg-emerald-50 text-emerald-800",
    alerta: "border-amber-200 bg-amber-50 text-amber-900",
  }[tom];
  return (
    <div role={tom === "erro" ? "alert" : "status"} className={cx("rounded-lg border px-4 py-3 text-sm", t)}>
      {children}
    </div>
  );
}
