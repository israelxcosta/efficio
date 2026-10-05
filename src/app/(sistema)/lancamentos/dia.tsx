"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Botao, Entrada, Selo } from "@/components/ui";
import { minutosParaHhmm } from "@/domain/ponto/tempo";
import type { ResultadoDia } from "@/domain/ponto/calculo";
import type { MarcacaoRegistro } from "@/server/espelho";
import { salvarMarcacoesDia } from "./actions";

const DIAS = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const hora = (rel: number) => `${minutosParaHhmm(((rel % 1440) + 1440) % 1440)}${rel >= 1440 ? "⁺¹" : ""}`;
const h = (min: number) => (min > 0.5 ? minutosParaHhmm(min) : "");

export function LinhaDia({ dia, registros, empregadoId }: { dia: ResultadoDia; registros: MarcacaoRegistro[]; empregadoId: string }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [horarios, setHorarios] = useState<string[]>([]);
  const [justificativa, setJustificativa] = useState("");
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();
  const desconsideradas = registros.filter((r) => r.desconsiderada);
  const manuais = registros.some((r) => !r.desconsiderada && r.origem === "manual");

  function abrir() {
    const atuais = dia.marcacoes.map((m) => minutosParaHhmm(((m % 1440) + 1440) % 1440));
    const tamanho = Math.min(12, Math.max(4, atuais.length + (atuais.length % 2 ? 1 : 2)));
    setHorarios(Array.from({ length: tamanho }, (_, i) => atuais[i] ?? ""));
    setJustificativa("");
    setMensagem(null);
    setEditando(true);
  }

  function salvar() {
    iniciar(async () => {
      const r = await salvarMarcacoesDia({
        empregadoId,
        data: dia.data,
        horarios,
        idsAtuais: registros.map((x) => x.id),
        justificativa,
      });
      setMensagem({ ok: r.ok, texto: r.mensagem });
      if (r.ok) {
        setEditando(false);
        router.refresh();
      }
    });
  }

  const [, mm, dd] = dia.data.split("-");
  const fundo =
    dia.tipo === "inativo" ? "bg-slate-50 text-slate-400" : dia.tipo !== "util" ? "bg-marca-50/40" : dia.inconsistencias.length || dia.falta ? "bg-amber-50/50" : "";

  return (
    <>
      <tr className={fundo}>
        <td className="whitespace-nowrap">
          <span className="font-medium tabular-nums">
            {dd}/{mm}
          </span>{" "}
          <span className="text-xs text-slate-500">{DIAS[dia.diaSemana]}</span>
          <div className="mt-0.5">
            {dia.tipo === "feriado" && <Selo tom="marca">{dia.feriado}</Selo>}
            {dia.tipo === "folga" && <Selo>Folga</Selo>}
            {dia.tipo === "inativo" && <Selo>Fora do contrato</Selo>}
            {dia.falta && <Selo tom="perigo">Falta</Selo>}
          </div>
        </td>
        <td>
          <div className="flex flex-wrap gap-1 tabular-nums">
            {dia.marcacoes.map((m, i) => (
              <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                {hora(m)}
              </span>
            ))}
            {desconsideradas.map((r) => (
              <span key={r.id} className="rounded px-1.5 py-0.5 text-xs text-slate-400 line-through" title={`Desconsiderada: ${r.justificativa ?? ""}`}>
                {r.dataHora.slice(11, 16)}
              </span>
            ))}
            {manuais && <span className="text-xs text-marca-600" title="Contém lançamento manual">✎</span>}
          </div>
        </td>
        <td className="text-right tabular-nums">{h(dia.previsto)}</td>
        <td className="text-right tabular-nums">{h(dia.trabalhado)}</td>
        <td className="text-right font-medium text-marca-700 tabular-nums">{h(dia.extras)}</td>
        <td className="text-right text-red-600 tabular-nums">{h(dia.debito)}</td>
        <td className="text-right text-indigo-700 tabular-nums">{h(dia.noturno)}</td>
        <td className="max-w-64 text-xs">
          <div className="flex flex-wrap gap-1">
            {dia.intervaloSuprimido > 0 && <Selo tom="alerta">Intervalo −{minutosParaHhmm(dia.intervaloSuprimido)}</Selo>}
            {dia.interjornadaSuprimida > 0 && <Selo tom="alerta">Interjornada −{minutosParaHhmm(dia.interjornadaSuprimida)}</Selo>}
            {dia.toleranciaAplicada && <Selo tom="sucesso">Tolerância</Selo>}
            {dia.prorrogacaoNoturna && <Selo tom="noite">Prorrogação noturna</Selo>}
          </div>
          {dia.inconsistencias.map((t) => (
            <p key={t} className="mt-1 text-amber-800">
              {t}
            </p>
          ))}
        </td>
        <td className="text-right">
          {dia.tipo !== "inativo" && !editando && (
            <button type="button" onClick={abrir} className="text-sm font-medium text-marca-700 hover:underline">
              Editar
            </button>
          )}
        </td>
      </tr>
      {editando && (
        <tr className="bg-white">
          <td colSpan={9} className="border-b border-marca-200">
            <div className="space-y-3 py-1">
              <p className="text-sm text-slate-600">
                Informe as marcações em ordem. Um horário menor que o anterior é do dia seguinte. Marcações do relógio retiradas ficam registradas como desconsideradas.
              </p>
              <div className="flex flex-wrap gap-2">
                {horarios.map((v, i) => (
                  <Entrada
                    key={i}
                    type="time"
                    value={v}
                    onChange={(e) => setHorarios(horarios.map((x, j) => (j === i ? e.target.value : x)))}
                    className="w-32"
                    aria-label={`Marcação ${i + 1}`}
                  />
                ))}
                {horarios.length < 12 && (
                  <Botao type="button" variante="fantasma" onClick={() => setHorarios([...horarios, "", ""])}>
                    + Marcações
                  </Botao>
                )}
              </div>
              <Entrada
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Justificativa do ajuste (obrigatória)"
                maxLength={300}
                aria-label="Justificativa"
              />
              {mensagem && <p className={`text-sm ${mensagem.ok ? "text-emerald-700" : "text-red-600"}`}>{mensagem.texto}</p>}
              <div className="flex gap-2">
                <Botao type="button" onClick={salvar} disabled={salvando}>
                  {salvando ? "Salvando…" : "Salvar marcações"}
                </Botao>
                <Botao type="button" variante="secundario" onClick={() => setEditando(false)}>
                  Cancelar
                </Botao>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
