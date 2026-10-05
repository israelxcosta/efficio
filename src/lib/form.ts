import { z } from "zod";

export type EstadoForm = {
  ok?: boolean;
  mensagem?: string;
  erros?: Record<string, string[] | undefined>;
  /** Valores enviados, para reexibir o formulário após um erro. */
  valores?: Record<string, string>;
};

export function lerFormData(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  return out;
}

export function errosDeValidacao(erro: z.ZodError, valores: Record<string, string>): EstadoForm {
  return {
    ok: false,
    mensagem: "Corrija os campos destacados.",
    erros: z.flattenError(erro).fieldErrors as Record<string, string[]>,
    valores,
  };
}

/** Campos de texto opcionais: string vazia vira null. */
export const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v));

export const obrigatorio = (max: number, mensagem = "Campo obrigatório.") =>
  z.string().trim().min(1, mensagem).max(max, `Use no máximo ${max} caracteres.`);

export const dataOpcional = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida.")
  .transform((v) => (v === "" ? null : v));

export const dataObrigatoria = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.");

/** Violação de unicidade do PostgreSQL. */
export function ehViolacaoUnica(e: unknown): boolean {
  const causa = (e as { cause?: { code?: string } })?.cause ?? e;
  return (causa as { code?: string })?.code === "23505";
}
