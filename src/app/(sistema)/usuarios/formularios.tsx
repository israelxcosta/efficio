"use client";

import { useActionState, useEffect, useRef } from "react";
import { BotaoEnviar, MensagemForm } from "@/components/form-client";
import { Campo, Entrada, Selecao } from "@/components/ui";
import { criarUsuario, redefinirSenha, trocarMinhaSenha } from "./actions";

export function FormularioNovoUsuario() {
  const [estado, acao] = useActionState(criarUsuario, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado?.ok) form.current?.reset();
  }, [estado]);
  const e = estado?.erros ?? {};
  return (
    <form ref={form} action={acao} className="space-y-4">
      <MensagemForm estado={estado} />
      <Campo rotulo="Nome" nome="nome" erro={e.nome}>
        <Entrada name="nome" required erro={e.nome} defaultValue={estado?.valores?.nome} />
      </Campo>
      <Campo rotulo="E-mail" nome="email" erro={e.email}>
        <Entrada name="email" type="email" required erro={e.email} defaultValue={estado?.valores?.email} autoComplete="off" />
      </Campo>
      <Campo rotulo="Perfil" nome="perfil" dica="Administradores também gerenciam usuários e configurações.">
        <Selecao name="perfil" defaultValue="operador">
          <option value="operador">Operador</option>
          <option value="admin">Administrador</option>
        </Selecao>
      </Campo>
      <Campo rotulo="Senha inicial" nome="senha" erro={e.senha} dica="Mínimo de 12 caracteres.">
        <Entrada name="senha" type="password" required minLength={12} erro={e.senha} autoComplete="new-password" />
      </Campo>
      <BotaoEnviar>Criar usuário</BotaoEnviar>
    </form>
  );
}

export function FormularioRedefinir({ id }: { id: string }) {
  const [estado, acao] = useActionState(redefinirSenha, undefined);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Entrada name="senha" type="password" placeholder="Nova senha" minLength={12} required className="w-44" autoComplete="new-password" aria-label="Nova senha" />
      <BotaoEnviar variante="secundario" pendente="…">
        Redefinir
      </BotaoEnviar>
      {estado?.mensagem && <span className={`text-xs ${estado.ok ? "text-emerald-700" : "text-red-600"}`}>{estado.mensagem}</span>}
    </form>
  );
}

export function FormularioMinhaSenha() {
  const [estado, acao] = useActionState(trocarMinhaSenha, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado?.ok) form.current?.reset();
  }, [estado]);
  const e = estado?.erros ?? {};
  return (
    <form ref={form} action={acao} className="space-y-4">
      <MensagemForm estado={estado} />
      <Campo rotulo="Senha atual" nome="atual" erro={e.atual}>
        <Entrada name="atual" type="password" required erro={e.atual} autoComplete="current-password" />
      </Campo>
      <Campo rotulo="Nova senha" nome="nova" erro={e.nova} dica="Mínimo de 12 caracteres. Uma frase longa é mais segura e fácil de lembrar.">
        <Entrada name="nova" type="password" required minLength={12} erro={e.nova} autoComplete="new-password" />
      </Campo>
      <Campo rotulo="Confirme a nova senha" nome="confirmacao" erro={e.confirmacao}>
        <Entrada name="confirmacao" type="password" required erro={e.confirmacao} autoComplete="new-password" />
      </Campo>
      <BotaoEnviar>Alterar senha</BotaoEnviar>
    </form>
  );
}
