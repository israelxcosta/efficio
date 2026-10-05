import { count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { empregados, empresas, horarios, importacoes } from "@/db/schema";
import { Aviso, Cabecalho, Cartao } from "@/components/ui";
import { exigirUsuario } from "@/server/dal";

export default async function Painel(props: PageProps<"/">) {
  const usuario = await exigirUsuario();
  const { erro } = await props.searchParams;
  const [[e], [h], [p], ultimas] = await Promise.all([
    db.select({ n: count() }).from(empresas).where(eq(empresas.ativo, true)),
    db.select({ n: count() }).from(horarios),
    db.select({ n: count() }).from(empregados).where(eq(empregados.ativo, true)),
    db.select().from(importacoes).orderBy(desc(importacoes.criadoEm)).limit(5),
  ]);

  const indicadores = [
    { rotulo: "Empresas ativas", valor: e.n, href: "/empresas" },
    { rotulo: "Horários cadastrados", valor: h.n, href: "/horarios" },
    { rotulo: "Empregados ativos", valor: p.n, href: "/empregados" },
  ];
  const passos = [
    { feito: e.n > 0, texto: "Cadastre a empresa (os dados vêm da Receita pelo CNPJ)", href: "/empresas/nova" },
    { feito: h.n > 0, texto: "Cadastre os horários semanais da empresa", href: "/horarios/novo" },
    { feito: p.n > 0, texto: "Cadastre os empregados e vincule o horário", href: "/empregados/novo" },
    { feito: ultimas.length > 0, texto: "Importe o arquivo do relógio de ponto ou lance as marcações", href: "/importacao" },
  ];

  return (
    <>
      <Cabecalho titulo={`Olá, ${usuario.nome.split(" ")[0]}`} descricao="Resumo dos cadastros e próximos passos." />
      {erro === "permissao" && (
        <div className="mb-6">
          <Aviso tom="erro">Você não tem permissão para acessar aquela página.</Aviso>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {indicadores.map((i) => (
          <Link key={i.href} href={i.href} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-marca-200">
            <p className="text-sm text-slate-500">{i.rotulo}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900 tabular-nums">{i.valor}</p>
          </Link>
        ))}
      </div>
      <Cartao titulo="Primeiros passos" className="mt-6">
        <ol className="space-y-3">
          {passos.map((p, i) => (
            <li key={p.href} className="flex items-center gap-3 text-sm">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${p.feito ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
              >
                {p.feito ? "✓" : i + 1}
              </span>
              <Link href={p.href} className={p.feito ? "text-slate-500" : "font-medium text-marca-700 hover:underline"}>
                {p.texto}
              </Link>
            </li>
          ))}
        </ol>
      </Cartao>
    </>
  );
}
