"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirUsuario, registrarAuditoria } from "@/server/dal";
import { importarMarcacoes, type ResumoImportacao } from "@/server/importacao";

const LIMITE_BYTES = 8 * 1024 * 1024;

export async function importarArquivo(_: ResumoImportacao | undefined, fd: FormData): Promise<ResumoImportacao> {
  const usuario = await exigirUsuario();
  const empresaId = z.uuid().safeParse(fd.get("empresaId"));
  if (!empresaId.success) return { ok: false, mensagem: "Selecione a empresa." };
  const tipo = z.enum(["auto", "afd", "csv"]).catch("auto").parse(fd.get("tipo"));
  const arquivo = fd.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, mensagem: "Escolha o arquivo." };
  if (arquivo.size > LIMITE_BYTES) return { ok: false, mensagem: "O arquivo passa de 8 MB. Divida-o por período." };
  if (!/\.(txt|afd|csv)$/i.test(arquivo.name)) return { ok: false, mensagem: "Envie um arquivo .txt, .afd ou .csv." };

  const resumo = await importarMarcacoes({
    nomeArquivo: arquivo.name,
    bytes: new Uint8Array(await arquivo.arrayBuffer()),
    tipo,
    empresaId: empresaId.data,
    usuarioId: usuario.id,
  });
  await registrarAuditoria(usuario, "importar", "marcacoes", empresaId.data, {
    arquivo: arquivo.name,
    ok: resumo.ok,
    importadas: resumo.importadas ?? 0,
  });
  revalidatePath("/importacao");
  revalidatePath("/lancamentos");
  return resumo;
}
