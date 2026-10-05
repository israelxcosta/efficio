"use client";

import { useActionState } from "react";
import { BotaoEnviar, MensagemForm } from "@/components/form-client";
import { Campo, Cartao, Entrada, Selecao } from "@/components/ui";
import { salvarConfiguracoes } from "./actions";

type Config = {
  toleranciaDiaria: boolean;
  intervaloReduzido: boolean;
  prorrogacaoNoturna: boolean;
  separacaoJornadasMinutos: number;
  tabelaHorasExtrasPadraoId: string | null;
};

function Opcao({ nome, marcado, titulo, texto, lei }: { nome: string; marcado: boolean; titulo: string; texto: string; lei: string }) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-4 hover:bg-slate-50 has-checked:border-marca-200 has-checked:bg-marca-50/50">
      <input type="checkbox" name={nome} defaultChecked={marcado} className="mt-0.5 size-4 shrink-0 accent-marca-600" />
      <span>
        <span className="block text-sm font-medium text-slate-900">{titulo}</span>
        <span className="mt-0.5 block text-sm text-slate-600">{texto}</span>
        <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{lei}</span>
      </span>
    </label>
  );
}

export function FormularioConfiguracoes({ config, tabelas }: { config: Config; tabelas: { id: string; nome: string }[] }) {
  const [estado, acao] = useActionState(salvarConfiguracoes, undefined);
  return (
    <form action={acao} className="space-y-6">
      <MensagemForm estado={estado} />
      <Cartao titulo="Regras de cálculo">
        <div className="space-y-3">
          <Opcao
            nome="toleranciaDiaria"
            marcado={config.toleranciaDiaria}
            titulo="Considerar 10 minutos de tolerância diária"
            texto="Diferenças de até 10 minutos no dia, para mais ou para menos, não contam como atraso nem como hora extra. Acima disso, conta o tempo todo."
            lei="Art. 58, §1º da CLT · Súmula 366 do TST"
          />
          <Opcao
            nome="intervaloReduzido"
            marcado={config.intervaloReduzido}
            titulo="Intervalo mínimo de 30 minutos por norma coletiva"
            texto="Para jornadas acima de 6 horas, considera 30 minutos em vez de 1 hora ao calcular o intervalo suprimido."
            lei="Art. 611-A, III da CLT"
          />
          <Opcao
            nome="prorrogacaoNoturna"
            marcado={config.prorrogacaoNoturna}
            titulo="Adicional noturno nas horas após as 5h"
            texto="Quando a jornada é cumprida no período noturno e continua após as 5h, as horas seguintes também são noturnas."
            lei="Súmula 60, II do TST"
          />
        </div>
      </Cartao>
      <Cartao titulo="Padrões">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="Faixas de horas extras padrão"
            nome="tabelaHorasExtrasPadraoId"
            dica="Usada pelas empresas sem tabela própria."
          >
            <Selecao name="tabelaHorasExtrasPadraoId" defaultValue={config.tabelaHorasExtrasPadraoId ?? ""}>
              <option value="">Padrão legal (50% e 100%)</option>
              {tabelas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo
            rotulo="Separação entre jornadas (horas)"
            nome="separacaoJornadasHoras"
            dica="Um intervalo sem marcações maior que este inicia uma nova jornada. Use 6h para a maioria dos casos."
          >
            <Entrada name="separacaoJornadasHoras" type="number" min={2} max={11} step={0.5} defaultValue={config.separacaoJornadasMinutos / 60} />
          </Campo>
        </div>
      </Cartao>
      <BotaoEnviar>Salvar configurações</BotaoEnviar>
    </form>
  );
}
