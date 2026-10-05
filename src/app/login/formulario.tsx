"use client";

import { useActionState } from "react";
import { BotaoEnviar, MensagemForm } from "@/components/form-client";
import { Campo, Entrada } from "@/components/ui";
import { entrar } from "./actions";

export function FormularioLogin({ de }: { de?: string }) {
  const [estado, acao] = useActionState(entrar, undefined);
  return (
    <form action={acao} className="space-y-4">
      <MensagemForm estado={estado} />
      {de && <input type="hidden" name="de" value={de} />}
      <Campo rotulo="E-mail" nome="email">
        <Entrada name="email" type="email" autoComplete="username" required defaultValue={estado?.valores?.email} autoFocus />
      </Campo>
      <Campo rotulo="Senha" nome="senha">
        <Entrada name="senha" type="password" autoComplete="current-password" required />
      </Campo>
      <BotaoEnviar className="w-full" pendente="Entrando…">
        Entrar
      </BotaoEnviar>
    </form>
  );
}
