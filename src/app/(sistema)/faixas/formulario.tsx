"use client";

import { useActionState, useState } from "react";
import { BotaoEnviar, MensagemForm } from "@/components/form-client";
import { Botao, Campo, Cartao, Entrada, LinkBotao, Selecao } from "@/components/ui";
import { salvarTabela } from "./actions";

export type LinhaFaixa = { ate: string; pct: string };
export type InicialTabela = {
  id?: string;
  nome: string;
  descricao: string;
  base: "diaria" | "mensal";
  util: LinhaFaixa[];
  descanso: LinhaFaixa[];
};

function Faixas({
  tipo,
  titulo,
  descricao,
  linhas,
  setLinhas,
  erro,
}: {
  tipo: "util" | "descanso";
  titulo: string;
  descricao: string;
  linhas: LinhaFaixa[];
  setLinhas: (l: LinhaFaixa[]) => void;
  erro?: string[];
}) {
  const altera = (i: number, campo: keyof LinhaFaixa, valor: string) =>
    setLinhas(linhas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  return (
    <Cartao titulo={titulo} descricao={descricao}>
      {erro && <p className="mb-3 text-sm text-red-600">{erro[0]}</p>}
      <div className="space-y-2">
        {linhas.map((l, i) => {
          const ultima = i === linhas.length - 1;
          const de = i === 0 ? "0" : linhas[i - 1].ate || "?";
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-28 text-slate-500">{i === 0 ? "Primeiras" : `Acima de ${de}h`}</span>
              {ultima ? (
                <span className="w-36 text-slate-500">{i === 0 ? "todas as horas" : "em diante"}</span>
              ) : (
                <label className="flex w-36 items-center gap-1">
                  <span className="text-slate-500">até</span>
                  <Entrada
                    name={`${tipo}_${i}_ate`}
                    value={l.ate}
                    onChange={(e) => altera(i, "ate", e.target.value)}
                    inputMode="decimal"
                    className="w-20"
                    aria-label={`Limite da faixa ${i + 1} em horas`}
                  />
                  <span className="text-slate-500">h</span>
                </label>
              )}
              <label className="flex items-center gap-1">
                <Entrada
                  name={`${tipo}_${i}_pct`}
                  value={l.pct}
                  onChange={(e) => altera(i, "pct", e.target.value)}
                  inputMode="decimal"
                  className="w-20"
                  required
                  aria-label={`Percentual da faixa ${i + 1}`}
                />
                <span className="text-slate-500">%</span>
              </label>
              {linhas.length > 1 && (
                <button type="button" onClick={() => setLinhas(linhas.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600" aria-label="Remover faixa">
                  Remover
                </button>
              )}
            </div>
          );
        })}
      </div>
      <Botao
        type="button"
        variante="fantasma"
        className="mt-3 px-0"
        onClick={() => setLinhas([...linhas.slice(0, -1), { ...linhas[linhas.length - 1], ate: "" }, { ate: "", pct: linhas[linhas.length - 1].pct }])}
      >
        + Adicionar faixa
      </Botao>
    </Cartao>
  );
}

export function FormularioTabela({ inicial }: { inicial: InicialTabela }) {
  const [estado, acao] = useActionState(salvarTabela, undefined);
  const [nome, setNome] = useState(inicial.nome);
  const [descricao, setDescricao] = useState(inicial.descricao);
  const [base, setBase] = useState(inicial.base);
  const [util, setUtil] = useState(inicial.util);
  const [descanso, setDescanso] = useState(inicial.descanso);
  const e = estado?.erros ?? {};

  return (
    <form action={acao} className="space-y-6">
      <MensagemForm estado={estado} />
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}
      <Cartao titulo="Tabela">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Nome" nome="nome" erro={e.nome}>
            <Entrada name="nome" value={nome} onChange={(ev) => setNome(ev.target.value)} erro={e.nome} placeholder="Ex.: Convenção comércio 2026" required />
          </Campo>
          <Campo rotulo="Contagem das faixas" nome="base" dica="Mensal: as horas acumulam no mês. Diária: recomeça a cada dia.">
            <Selecao name="base" value={base} onChange={(ev) => setBase(ev.target.value as "diaria" | "mensal")}>
              <option value="mensal">Acumulada no mês</option>
              <option value="diaria">Por dia</option>
            </Selecao>
          </Campo>
          <Campo rotulo="Descrição" nome="descricao" className="sm:col-span-2">
            <Entrada name="descricao" value={descricao} onChange={(ev) => setDescricao(ev.target.value)} />
          </Campo>
        </div>
      </Cartao>
      <div className="grid gap-6 lg:grid-cols-2">
        <Faixas
          tipo="util"
          titulo="Dias úteis"
          descricao="Horas extras de segunda a sábado (mínimo legal de 50%)."
          linhas={util}
          setLinhas={setUtil}
          erro={e.util}
        />
        <Faixas
          tipo="descanso"
          titulo="Folgas, domingos e feriados"
          descricao="Trabalho em dia de descanso sem compensação (mínimo de 100%)."
          linhas={descanso}
          setLinhas={setDescanso}
          erro={e.descanso}
        />
      </div>
      <div className="flex gap-3">
        <BotaoEnviar>Salvar tabela</BotaoEnviar>
        <LinkBotao href="/faixas" variante="secundario">
          Cancelar
        </LinkBotao>
      </div>
    </form>
  );
}
