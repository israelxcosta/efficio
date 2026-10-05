"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { empresas, empregados } from "@/db/schema";
import { UFS } from "@/lib/constantes";
import { dataOpcional, ehViolacaoUnica, errosDeValidacao, lerFormData, obrigatorio, opcional, type EstadoForm } from "@/lib/form";
import { normalizarCnpj, validarCnpj } from "@/lib/validacao/documentos";
import { consultarCnpjReceita, type ResultadoConsulta } from "@/server/consulta-cnpj";
import { exigirUsuario, registrarAuditoria } from "@/server/dal";

const esquema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  cnpj: z.string().transform(normalizarCnpj).refine(validarCnpj, "CNPJ inválido."),
  razaoSocial: obrigatorio(200, "Informe a razão social."),
  nomeFantasia: opcional(200),
  situacaoCadastral: opcional(40),
  dataAbertura: dataOpcional,
  naturezaJuridica: opcional(200),
  cnaePrincipal: opcional(10),
  cnaeDescricao: opcional(300),
  porte: opcional(60),
  cep: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || v.length === 8, "CEP deve ter 8 dígitos.")
    .transform((v) => v || null),
  logradouro: opcional(200),
  numero: opcional(20),
  complemento: opcional(120),
  bairro: opcional(120),
  municipio: opcional(120),
  uf: z
    .string()
    .refine((v) => v === "" || (UFS as readonly string[]).includes(v), "UF inválida.")
    .transform((v) => v || null),
  telefone: opcional(40),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => v === "" || z.email().safeParse(v).success, "E-mail inválido.")
    .transform((v) => v || null),
  tabelaHorasExtrasId: z
    .string()
    .refine((v) => v === "" || z.uuid().safeParse(v).success)
    .transform((v) => v || null),
  ativo: z.string().optional().transform((v) => v === "on"),
});

export async function salvarEmpresa(_: EstadoForm | undefined, fd: FormData): Promise<EstadoForm> {
  const usuario = await exigirUsuario();
  const valores = lerFormData(fd);
  const r = esquema.safeParse(valores);
  if (!r.success) return errosDeValidacao(r.error, valores);
  const { id, ...dados } = r.data;

  let empresaId = id || "";
  try {
    if (empresaId) {
      await db.update(empresas).set(dados).where(eq(empresas.id, empresaId));
      await registrarAuditoria(usuario, "alterar", "empresa", empresaId, dados);
    } else {
      const [nova] = await db.insert(empresas).values(dados).returning({ id: empresas.id });
      empresaId = nova.id;
      await registrarAuditoria(usuario, "criar", "empresa", empresaId, dados);
    }
  } catch (e) {
    if (ehViolacaoUnica(e)) return { ok: false, mensagem: "Já existe uma empresa com este CNPJ.", erros: { cnpj: ["CNPJ já cadastrado."] }, valores };
    throw e;
  }
  revalidatePath("/empresas");
  redirect(`/empresas?salvo=${empresaId}`);
}

export async function consultarCnpj(cnpj: string): Promise<ResultadoConsulta> {
  await exigirUsuario();
  if (!validarCnpj(cnpj)) return { ok: false, mensagem: "CNPJ inválido. Confira os dígitos." };
  return consultarCnpjReceita(cnpj);
}

export async function excluirEmpresa(fd: FormData) {
  const usuario = await exigirUsuario();
  const id = z.uuid().parse(fd.get("id"));
  const [vinculo] = await db.select({ id: empregados.id }).from(empregados).where(eq(empregados.empresaId, id)).limit(1);
  if (vinculo) {
    // Com empregados vinculados, a empresa é apenas inativada para preservar o histórico.
    await db.update(empresas).set({ ativo: false }).where(eq(empresas.id, id));
    await registrarAuditoria(usuario, "inativar", "empresa", id);
  } else {
    await db.delete(empresas).where(eq(empresas.id, id));
    await registrarAuditoria(usuario, "excluir", "empresa", id);
  }
  revalidatePath("/empresas");
  redirect("/empresas");
}
