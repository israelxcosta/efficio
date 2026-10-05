"use client";

import { useRouter } from "next/navigation";
import { Campo, Entrada, Selecao } from "@/components/ui";

export function Seletor({
  empresas,
  empregados,
  empresaId,
  empregadoId,
  mes,
}: {
  empresas: { id: string; nome: string }[];
  empregados: { id: string; nome: string; empresaId: string }[];
  empresaId: string;
  empregadoId: string;
  mes: string;
}) {
  const router = useRouter();
  const ir = (p: { empresa?: string; empregado?: string; mes?: string }) => {
    const q = new URLSearchParams();
    const empresa = p.empresa ?? empresaId;
    const empregado = p.empresa !== undefined ? "" : (p.empregado ?? empregadoId);
    if (empresa) q.set("empresa", empresa);
    if (empregado) q.set("empregado", empregado);
    q.set("mes", p.mes ?? mes);
    router.push(`/lancamentos?${q}`);
  };
  const daEmpresa = empregados.filter((e) => e.empresaId === empresaId);

  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_1fr_180px]">
      <Campo rotulo="Empresa" nome="empresa">
        <Selecao name="empresa" value={empresaId} onChange={(e) => ir({ empresa: e.target.value })}>
          <option value="">Selecione…</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo rotulo="Empregado" nome="empregado">
        <Selecao name="empregado" value={empregadoId} onChange={(e) => ir({ empregado: e.target.value })} disabled={!empresaId}>
          <option value="">{empresaId ? "Selecione…" : "Escolha a empresa"}</option>
          {daEmpresa.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo rotulo="Mês" nome="mes">
        <Entrada name="mes" type="month" value={mes} onChange={(e) => e.target.value && ir({ mes: e.target.value })} />
      </Campo>
    </div>
  );
}
