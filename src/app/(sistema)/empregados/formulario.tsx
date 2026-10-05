"use client";

import { useActionState, useState } from "react";
import { BotaoEnviar, MensagemForm } from "@/components/form-client";
import { Campo, Cartao, Entrada, LinkBotao, Selecao } from "@/components/ui";
import { salvarEmpregado } from "./actions";

type Valores = Record<string, string>;

export function FormularioEmpregado({
  inicial,
  empresas,
  horarios,
}: {
  inicial: Valores;
  empresas: { id: string; nome: string }[];
  horarios: { id: string; nome: string; empresaId: string }[];
}) {
  const [estado, acao] = useActionState(salvarEmpregado, undefined);
  const [v, setV] = useState<Valores>(inicial);
  const e = estado?.erros ?? {};
  const set = (k: string) => (ev: { target: { value: string } }) => setV((x) => ({ ...x, [k]: ev.target.value }));
  const entrada = (k: string, props: Partial<React.ComponentProps<"input">> = {}) => (
    <Entrada name={k} value={v[k] ?? ""} onChange={set(k)} erro={e[k]} {...props} />
  );
  const horariosDaEmpresa = horarios.filter((h) => h.empresaId === v.empresaId);

  return (
    <form action={acao} className="space-y-6">
      <MensagemForm estado={estado} />
      {v.id && <input type="hidden" name="id" value={v.id} />}

      <Cartao titulo="Dados pessoais">
        <div className="grid gap-4 sm:grid-cols-6">
          <Campo rotulo="Nome completo" nome="nome" erro={e.nome} className="sm:col-span-6">
            {entrada("nome", { required: true, autoComplete: "off" })}
          </Campo>
          <Campo rotulo="CPF" nome="cpf" erro={e.cpf} className="sm:col-span-2">
            {entrada("cpf", { required: true, inputMode: "numeric", placeholder: "000.000.000-00" })}
          </Campo>
          <Campo rotulo="PIS/PASEP" nome="pis" erro={e.pis} dica="Usado para ler arquivos AFD antigos." className="sm:col-span-2">
            {entrada("pis", { inputMode: "numeric" })}
          </Campo>
          <Campo rotulo="Nascimento" nome="dataNascimento" erro={e.dataNascimento} className="sm:col-span-2">
            {entrada("dataNascimento", { type: "date" })}
          </Campo>
          <Campo rotulo="E-mail" nome="email" erro={e.email} className="sm:col-span-3">
            {entrada("email", { type: "email" })}
          </Campo>
          <Campo rotulo="Telefone" nome="telefone" erro={e.telefone} className="sm:col-span-3">
            {entrada("telefone", { type: "tel" })}
          </Campo>
        </div>
      </Cartao>

      <Cartao titulo="Contrato">
        <div className="grid gap-4 sm:grid-cols-6">
          <Campo rotulo="Empresa" nome="empresaId" erro={e.empresaId} className="sm:col-span-3">
            <Selecao
              name="empresaId"
              value={v.empresaId ?? ""}
              onChange={(ev) => setV((x) => ({ ...x, empresaId: ev.target.value, horarioId: "" }))}
              erro={e.empresaId}
              required
            >
              <option value="">Selecione…</option>
              {empresas.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo
            rotulo="Horário de trabalho"
            nome="horarioId"
            erro={e.horarioId}
            dica={v.empresaId && !horariosDaEmpresa.length ? "Esta empresa ainda não tem horários cadastrados." : undefined}
            className="sm:col-span-3"
          >
            <Selecao name="horarioId" value={v.horarioId ?? ""} onChange={set("horarioId")} erro={e.horarioId} disabled={!v.empresaId}>
              <option value="">{v.empresaId ? "Selecione…" : "Escolha a empresa primeiro"}</option>
              {horariosDaEmpresa.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Matrícula" nome="matricula" erro={e.matricula} className="sm:col-span-2">
            {entrada("matricula")}
          </Campo>
          <Campo rotulo="Cargo" nome="cargo" erro={e.cargo} className="sm:col-span-2">
            {entrada("cargo", { required: true })}
          </Campo>
          <Campo rotulo="Departamento" nome="departamento" erro={e.departamento} className="sm:col-span-2">
            {entrada("departamento")}
          </Campo>
          <Campo rotulo="Admissão" nome="dataAdmissao" erro={e.dataAdmissao} className="sm:col-span-2">
            {entrada("dataAdmissao", { type: "date", required: true })}
          </Campo>
          <Campo rotulo="Demissão" nome="dataDemissao" erro={e.dataDemissao} className="sm:col-span-2">
            {entrada("dataDemissao", { type: "date" })}
          </Campo>
          <Campo rotulo="Salário (R$)" nome="salario" erro={e.salario} className="sm:col-span-2">
            {entrada("salario", { inputMode: "decimal", placeholder: "0,00" })}
          </Campo>
          <label className="flex items-center gap-2 text-sm sm:col-span-6">
            <input
              type="checkbox"
              name="ativo"
              checked={v.ativo !== "off"}
              onChange={(ev) => setV((x) => ({ ...x, ativo: ev.target.checked ? "on" : "off" }))}
              className="size-4 accent-marca-600"
            />
            Empregado ativo
          </label>
        </div>
      </Cartao>

      <div className="flex gap-3">
        <BotaoEnviar>Salvar empregado</BotaoEnviar>
        <LinkBotao href="/empregados" variante="secundario">
          Cancelar
        </LinkBotao>
      </div>
    </form>
  );
}
