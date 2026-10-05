"use client";

import { useActionState, useState } from "react";
import { BotaoEnviar, MensagemForm } from "@/components/form-client";
import { Botao, Campo, Cartao, Entrada, LinkBotao, Selecao } from "@/components/ui";
import { DIAS_SEMANA } from "@/lib/constantes";
import { montarPeriodosHorario } from "@/domain/ponto/calculo";
import { hhmmParaMinutos, minutosParaHhmm } from "@/domain/ponto/tempo";
import { salvarHorario } from "./actions";

type Valores = Record<string, string>;
const CAMPOS = ["e1", "s1", "e2", "s2"] as const;

function cargaDia(v: Valores, d: number): number {
  if (v[`d${d}_folga`] === "on") return 0;
  const m = (k: string) => hhmmParaMinutos(v[`d${d}_${k}`]);
  return montarPeriodosHorario({ entrada1: m("e1"), saida1: m("s1"), entrada2: m("e2"), saida2: m("s2") }).reduce(
    (s, p) => s + p.fim - p.inicio,
    0,
  );
}

export function FormularioHorario({ inicial, empresas }: { inicial: Valores; empresas: { id: string; nome: string }[] }) {
  const [estado, acao] = useActionState(salvarHorario, undefined);
  const [v, setV] = useState<Valores>(estado?.valores ?? inicial);
  const e = estado?.erros ?? {};
  const set = (k: string, valor: string) => setV((x) => ({ ...x, [k]: valor }));
  const total = DIAS_SEMANA.reduce((s, d) => s + cargaDia(v, d.valor), 0);

  function copiarSegunda() {
    setV((x) => {
      const novo = { ...x };
      for (let d = 2; d <= 5; d++) {
        novo[`d${d}_folga`] = x.d1_folga ?? "";
        for (const c of CAMPOS) novo[`d${d}_${c}`] = x[`d1_${c}`] ?? "";
      }
      return novo;
    });
  }

  return (
    <form action={acao} className="space-y-6">
      <MensagemForm estado={estado} />
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <Cartao titulo="Dados do horário">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Empresa" nome="empresaId" erro={e.empresaId}>
            <Selecao name="empresaId" value={v.empresaId ?? ""} onChange={(ev) => set("empresaId", ev.target.value)} erro={e.empresaId} required>
              <option value="">Selecione…</option>
              {empresas.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Nome" nome="nome" erro={e.nome}>
            <Entrada name="nome" value={v.nome ?? ""} onChange={(ev) => set("nome", ev.target.value)} erro={e.nome} placeholder="Ex.: Comercial 44h" required />
          </Campo>
          <Campo rotulo="Descrição" nome="descricao" className="sm:col-span-2">
            <Entrada name="descricao" value={v.descricao ?? ""} onChange={(ev) => set("descricao", ev.target.value)} />
          </Campo>
        </div>
      </Cartao>

      <Cartao titulo="Jornada semanal" descricao="Horário de saída menor que o de entrada conta como dia seguinte (jornada noturna).">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <th className="py-2 pr-3">Dia</th>
                <th className="py-2 pr-3">Folga</th>
                <th className="py-2 pr-3">Entrada</th>
                <th className="py-2 pr-3">Saída intervalo</th>
                <th className="py-2 pr-3">Retorno</th>
                <th className="py-2 pr-3">Saída</th>
                <th className="py-2 text-right">Carga</th>
              </tr>
            </thead>
            <tbody>
              {DIAS_SEMANA.map((d) => {
                const folga = v[`d${d.valor}_folga`] === "on";
                const erro = e[`d${d.valor}`];
                return (
                  <tr key={d.valor} className="border-t border-slate-100 align-top">
                    <td className="py-2 pr-3 font-medium whitespace-nowrap text-slate-700">
                      {d.nome}
                      {erro && <p className="text-xs font-normal text-red-600">{erro[0]}</p>}
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        name={`d${d.valor}_folga`}
                        checked={folga}
                        onChange={(ev) => set(`d${d.valor}_folga`, ev.target.checked ? "on" : "")}
                        className="mt-2 size-4 accent-marca-600"
                        aria-label={`${d.nome} é folga`}
                      />
                    </td>
                    {CAMPOS.map((c) => (
                      <td key={c} className="py-2 pr-3">
                        <Entrada
                          type="time"
                          name={`d${d.valor}_${c}`}
                          value={folga ? "" : (v[`d${d.valor}_${c}`] ?? "")}
                          onChange={(ev) => set(`d${d.valor}_${c}`, ev.target.value)}
                          disabled={folga}
                          erro={erro}
                          aria-label={`${d.nome} ${c}`}
                        />
                      </td>
                    ))}
                    <td className="py-2 pt-4 text-right font-medium tabular-nums">{folga ? "Folga" : minutosParaHhmm(cargaDia(v, d.valor))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200">
                <td colSpan={6} className="py-3 text-right text-sm text-slate-500">
                  Total semanal
                </td>
                <td className="py-3 text-right font-semibold tabular-nums">{minutosParaHhmm(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <Botao type="button" variante="secundario" onClick={copiarSegunda} className="mt-2">
          Copiar segunda para terça a sexta
        </Botao>
      </Cartao>

      <div className="flex gap-3">
        <BotaoEnviar>Salvar horário</BotaoEnviar>
        <LinkBotao href="/horarios" variante="secundario">
          Cancelar
        </LinkBotao>
      </div>
    </form>
  );
}
