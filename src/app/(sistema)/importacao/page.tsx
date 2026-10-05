import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { empresas, importacoes, usuarios } from "@/db/schema";
import { Cabecalho, Cartao, Selo, Tabela, Th } from "@/components/ui";
import { exigirUsuario } from "@/server/dal";
import { listarEmpresasAtivas } from "@/server/consultas/basicas";
import { FormularioImportacao } from "./formulario";

export const metadata: Metadata = { title: "Importar arquivo" };

export default async function PaginaImportacao() {
  await exigirUsuario();
  const [listaEmpresas, historico] = await Promise.all([
    listarEmpresasAtivas(),
    db
      .select({
        id: importacoes.id,
        nomeArquivo: importacoes.nomeArquivo,
        tipo: importacoes.tipo,
        importadas: importacoes.importadas,
        duplicadas: importacoes.duplicadas,
        naoEncontradas: importacoes.naoEncontradas,
        criadoEm: importacoes.criadoEm,
        empresa: empresas.razaoSocial,
        usuario: usuarios.nome,
      })
      .from(importacoes)
      .leftJoin(empresas, eq(empresas.id, importacoes.empresaId))
      .leftJoin(usuarios, eq(usuarios.id, importacoes.usuarioId))
      .orderBy(desc(importacoes.criadoEm))
      .limit(30),
  ]);

  return (
    <>
      <Cabecalho titulo="Importar arquivo" descricao="As marcações do arquivo são lançadas automaticamente no espelho de cada empregado." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Cartao titulo="Enviar arquivo">
          <FormularioImportacao empresas={listaEmpresas} />
        </Cartao>
        <Cartao titulo="Formatos aceitos">
          <div className="space-y-4 text-sm text-slate-600">
            <div>
              <p className="font-medium text-slate-800">AFD do relógio de ponto</p>
              <p>Arquivo Fonte de Dados nos leiautes da Portaria 1.510/2009 (identificação por PIS) e da Portaria MTP 671/2021 (por CPF). O CNPJ do arquivo precisa ser o da empresa escolhida.</p>
            </div>
            <div>
              <p className="font-medium text-slate-800">Planilha CSV</p>
              <p>Primeira linha com os nomes das colunas: uma coluna para identificar o empregado (cpf, pis ou matricula), a coluna data e os horários.</p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs">
                {`cpf;data;entrada;saida;entrada;saida
529.982.247-25;05/10/2026;08:00;12:00;13:00;17:48`}
              </pre>
              <p className="mt-2">Também vale uma marcação por linha (cpf;data;hora). Separador ; ou ,.</p>
            </div>
            <p>Marcações que já existem são ignoradas, então reenviar um arquivo não duplica nada.</p>
          </div>
        </Cartao>
      </div>

      <h2 className="mt-8 mb-3 text-base font-semibold text-slate-900">Últimas importações</h2>
      {historico.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma importação ainda.</p>
      ) : (
        <Tabela>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Arquivo</Th>
              <Th>Empresa</Th>
              <Th className="text-right">Importadas</Th>
              <Th className="text-right">Repetidas</Th>
              <Th className="text-right">Sem empregado</Th>
              <Th>Usuário</Th>
            </tr>
          </thead>
          <tbody>
            {historico.map((h) => (
              <tr key={h.id}>
                <td className="whitespace-nowrap tabular-nums">{h.criadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                <td>
                  {h.nomeArquivo} <Selo>{h.tipo.toUpperCase()}</Selo>
                </td>
                <td>{h.empresa ?? "—"}</td>
                <td className="text-right tabular-nums">{h.importadas}</td>
                <td className="text-right tabular-nums">{h.duplicadas}</td>
                <td className="text-right tabular-nums">{h.naoEncontradas ? <Selo tom="alerta">{h.naoEncontradas}</Selo> : 0}</td>
                <td>{h.usuario ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </>
  );
}
