"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { BotaoEnviar, MensagemForm } from "@/components/form-client";
import { Campo, Entrada, Selecao } from "@/components/ui";
import { UFS } from "@/lib/constantes";
import { gerarNacionais, salvarFeriado } from "./actions";

export function FormularioFeriado({ empresas }: { empresas: { id: string; nome: string }[] }) {
  const [estado, acao] = useActionState(salvarFeriado, undefined);
  const [abrangencia, setAbrangencia] = useState("municipal");
  const e = estado?.erros ?? {};
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado?.ok) form.current?.reset();
  }, [estado]);
  return (
    <form ref={form} action={acao} className="space-y-4">
      <MensagemForm estado={estado} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Data" nome="data" erro={e.data}>
          <Entrada name="data" type="date" required erro={e.data} defaultValue={estado?.valores?.data} />
        </Campo>
        <Campo rotulo="Abrangência" nome="abrangencia">
          <Selecao name="abrangencia" value={abrangencia} onChange={(ev) => setAbrangencia(ev.target.value)}>
            <option value="nacional">Nacional</option>
            <option value="estadual">Estadual</option>
            <option value="municipal">Municipal</option>
            <option value="empresa">Somente uma empresa</option>
          </Selecao>
        </Campo>
        <Campo rotulo="Descrição" nome="descricao" erro={e.descricao} className="sm:col-span-2">
          <Entrada name="descricao" required erro={e.descricao} defaultValue={estado?.valores?.descricao} placeholder="Ex.: Aniversário da cidade" />
        </Campo>
        {(abrangencia === "estadual" || abrangencia === "municipal") && (
          <Campo rotulo="UF" nome="uf" erro={e.uf}>
            <Selecao name="uf" defaultValue={estado?.valores?.uf ?? ""} erro={e.uf}>
              <option value="">—</option>
              {UFS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Selecao>
          </Campo>
        )}
        {abrangencia === "municipal" && (
          <Campo rotulo="Município" nome="municipio" erro={e.municipio}>
            <Entrada name="municipio" erro={e.municipio} defaultValue={estado?.valores?.municipio} />
          </Campo>
        )}
        {abrangencia === "empresa" && (
          <Campo rotulo="Empresa" nome="empresaId" erro={e.empresaId} className="sm:col-span-2">
            <Selecao name="empresaId" defaultValue="" erro={e.empresaId}>
              <option value="">Selecione…</option>
              {empresas.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
        )}
      </div>
      <BotaoEnviar>Adicionar feriado</BotaoEnviar>
    </form>
  );
}

export function FormularioNacionais({ ano }: { ano: number }) {
  const [estado, acao] = useActionState(gerarNacionais, undefined);
  return (
    <form action={acao} className="space-y-4">
      <MensagemForm estado={estado} />
      <div className="flex flex-wrap items-end gap-3">
        <Campo rotulo="Ano" nome="ano">
          <Entrada name="ano" type="number" min={2000} max={2100} defaultValue={ano} className="w-28" />
        </Campo>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="facultativos" className="size-4 accent-marca-600" />
          Incluir Carnaval e Corpus Christi
        </label>
      </div>
      <BotaoEnviar variante="secundario" pendente="Gerando…">
        Gerar feriados nacionais
      </BotaoEnviar>
    </form>
  );
}
