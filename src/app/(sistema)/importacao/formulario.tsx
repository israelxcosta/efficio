"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotaoEnviar } from "@/components/form-client";
import { Aviso, Campo, Selecao } from "@/components/ui";
import type { ResumoImportacao } from "@/server/importacao";
import { importarArquivo } from "./actions";

export function FormularioImportacao({ empresas }: { empresas: { id: string; nome: string }[] }) {
  const [r, acao] = useActionState<ResumoImportacao | undefined, FormData>(importarArquivo, undefined);
  return (
    <div className="space-y-4">
      <form action={acao} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Empresa" nome="empresaId">
            <Selecao name="empresaId" required defaultValue="">
              <option value="">Selecione…</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Formato" nome="tipo">
            <Selecao name="tipo" defaultValue="auto">
              <option value="auto">Detectar automaticamente</option>
              <option value="afd">AFD do relógio de ponto</option>
              <option value="csv">Planilha CSV</option>
            </Selecao>
          </Campo>
        </div>
        <Campo rotulo="Arquivo" nome="arquivo" dica="Arquivos .txt, .afd ou .csv de até 8 MB.">
          <input
            id="arquivo"
            name="arquivo"
            type="file"
            accept=".txt,.afd,.csv,text/plain,text/csv"
            required
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-marca-50 file:px-4 file:py-2 file:font-medium file:text-marca-700 hover:file:bg-marca-100"
          />
        </Campo>
        <BotaoEnviar pendente="Importando…">Importar marcações</BotaoEnviar>
      </form>

      {r && (
        <div className="space-y-3">
          <Aviso tom={r.ok ? "sucesso" : "erro"}>{r.mensagem}</Aviso>
          {r.ok && (
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[
                ["Lidas", r.totalRegistros],
                ["Importadas", r.importadas],
                ["Já existiam", r.duplicadas],
                ["Sem empregado", r.naoEncontradas],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className="text-xl font-semibold tabular-nums">{v ?? 0}</dd>
                </div>
              ))}
            </dl>
          )}
          {r.arquivoRepetido && <Aviso tom="alerta">Este mesmo arquivo já tinha sido importado. Marcações repetidas foram ignoradas.</Aviso>}
          {!!r.naoEncontrados?.length && (
            <Aviso tom="alerta">
              <p className="font-medium">Marcações de pessoas não cadastradas nesta empresa:</p>
              <p className="mt-1">{r.naoEncontrados.join(", ")}</p>
              <p className="mt-1">
                Cadastre-as em <Link href="/empregados/novo" className="underline">Empregados</Link> (com CPF ou PIS) e importe o arquivo de novo.
              </p>
            </Aviso>
          )}
          {!!r.erros?.length && (
            <details className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <summary className="cursor-pointer font-medium">{r.erros.length} linha(s) com problema</summary>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-slate-600">
                {r.erros.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
