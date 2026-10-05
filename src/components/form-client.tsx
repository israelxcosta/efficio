"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Aviso, Botao, type Variante } from "./ui";
import type { EstadoForm } from "@/lib/form";

export function BotaoEnviar({
  children,
  pendente = "Salvando…",
  variante = "primario",
  ...props
}: ComponentProps<"button"> & { pendente?: string; variante?: Variante }) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" variante={variante} disabled={pending} aria-busy={pending} {...props}>
      {pending ? pendente : children}
    </Botao>
  );
}

export function MensagemForm({ estado }: { estado: EstadoForm | undefined }) {
  if (!estado?.mensagem) return null;
  return <Aviso tom={estado.ok ? "sucesso" : "erro"}>{estado.mensagem}</Aviso>;
}

/** Botão que pede confirmação na própria página antes de enviar. */
export function BotaoConfirmar({ children, mensagem }: { children: React.ReactNode; mensagem: string }) {
  return (
    <Botao
      type="submit"
      variante="perigo"
      onClick={(e) => {
        if (!window.confirm(mensagem)) e.preventDefault();
      }}
    >
      {children}
    </Botao>
  );
}
