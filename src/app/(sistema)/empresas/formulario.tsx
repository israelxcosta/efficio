"use client";

import { useActionState, useState, useTransition } from "react";
import { BotaoEnviar, MensagemForm } from "@/components/form-client";
import { Aviso, Botao, Campo, Cartao, Entrada, LinkBotao, Selecao } from "@/components/ui";
import { UFS } from "@/lib/constantes";
import { formatarCnpj } from "@/lib/validacao/documentos";
import { consultarCnpj, salvarEmpresa } from "./actions";

export type ValoresEmpresa = Record<string, string>;

const CAMPOS_RECEITA = [
  "razaoSocial", "nomeFantasia", "situacaoCadastral", "dataAbertura", "naturezaJuridica", "cnaePrincipal",
  "cnaeDescricao", "porte", "cep", "logradouro", "numero", "complemento", "bairro", "municipio", "uf", "telefone", "email",
] as const;

export function FormularioEmpresa({
  inicial,
  tabelas,
}: {
  inicial: ValoresEmpresa;
  tabelas: { id: string; nome: string }[];
}) {
  const [estado, acao] = useActionState(salvarEmpresa, undefined);
  const [v, setV] = useState<ValoresEmpresa>(inicial);
  const [consulta, setConsulta] = useState<{ tom: "sucesso" | "erro"; texto: string } | null>(null);
  const [consultando, iniciar] = useTransition();
  const e = estado?.erros ?? {};

  const muda = (campo: string) => (ev: { target: { value: string } }) => setV((x) => ({ ...x, [campo]: ev.target.value }));
  const entrada = (campo: string, props: Partial<React.ComponentProps<"input">> = {}) => (
    <Entrada name={campo} value={v[campo] ?? ""} onChange={muda(campo)} erro={e[campo]} {...props} />
  );

  function buscar() {
    setConsulta(null);
    iniciar(async () => {
      const r = await consultarCnpj(v.cnpj ?? "");
      if (!r.ok) {
        setConsulta({ tom: "erro", texto: r.mensagem });
        return;
      }
      setV((x) => {
        const novo: ValoresEmpresa = { ...x, cnpj: formatarCnpj(r.dados.cnpj) };
        for (const c of CAMPOS_RECEITA) novo[c] = r.dados[c] ?? "";
        return novo;
      });
      setConsulta({ tom: "sucesso", texto: `Dados importados da Receita Federal (fonte: ${r.fonte}). Confira e salve.` });
    });
  }

  return (
    <form action={acao} className="space-y-6">
      <MensagemForm estado={estado} />
      {v.id && <input type="hidden" name="id" value={v.id} />}

      <Cartao titulo="Identificação" descricao="Digite o CNPJ e busque os dados na Receita Federal. Aceita o CNPJ alfanumérico.">
        <div className="grid gap-4 sm:grid-cols-6">
          <Campo rotulo="CNPJ" nome="cnpj" erro={e.cnpj} className="sm:col-span-3">
            <div className="flex gap-2">
              {entrada("cnpj", { placeholder: "00.000.000/0000-00", required: true, maxLength: 18, autoComplete: "off" })}
              <Botao type="button" variante="secundario" onClick={buscar} disabled={consultando || !v.cnpj}>
                {consultando ? "Buscando…" : "Buscar na Receita"}
              </Botao>
            </div>
          </Campo>
          <Campo rotulo="Situação cadastral" nome="situacaoCadastral" erro={e.situacaoCadastral} className="sm:col-span-3">
            {entrada("situacaoCadastral")}
          </Campo>
          {consulta && (
            <div className="sm:col-span-6">
              <Aviso tom={consulta.tom}>{consulta.texto}</Aviso>
            </div>
          )}
          <Campo rotulo="Razão social" nome="razaoSocial" erro={e.razaoSocial} className="sm:col-span-6">
            {entrada("razaoSocial", { required: true })}
          </Campo>
          <Campo rotulo="Nome fantasia" nome="nomeFantasia" erro={e.nomeFantasia} className="sm:col-span-3">
            {entrada("nomeFantasia")}
          </Campo>
          <Campo rotulo="Data de abertura" nome="dataAbertura" erro={e.dataAbertura} className="sm:col-span-3">
            {entrada("dataAbertura", { type: "date" })}
          </Campo>
          <Campo rotulo="Natureza jurídica" nome="naturezaJuridica" erro={e.naturezaJuridica} className="sm:col-span-3">
            {entrada("naturezaJuridica")}
          </Campo>
          <Campo rotulo="Porte" nome="porte" erro={e.porte} className="sm:col-span-3">
            {entrada("porte")}
          </Campo>
          <Campo rotulo="CNAE principal" nome="cnaePrincipal" erro={e.cnaePrincipal} className="sm:col-span-2">
            {entrada("cnaePrincipal")}
          </Campo>
          <Campo rotulo="Atividade principal" nome="cnaeDescricao" erro={e.cnaeDescricao} className="sm:col-span-4">
            {entrada("cnaeDescricao")}
          </Campo>
        </div>
      </Cartao>

      <Cartao titulo="Endereço e contato">
        <div className="grid gap-4 sm:grid-cols-6">
          <Campo rotulo="CEP" nome="cep" erro={e.cep} className="sm:col-span-2">
            {entrada("cep", { inputMode: "numeric", maxLength: 9 })}
          </Campo>
          <Campo rotulo="Logradouro" nome="logradouro" erro={e.logradouro} className="sm:col-span-4">
            {entrada("logradouro")}
          </Campo>
          <Campo rotulo="Número" nome="numero" erro={e.numero} className="sm:col-span-1">
            {entrada("numero")}
          </Campo>
          <Campo rotulo="Complemento" nome="complemento" erro={e.complemento} className="sm:col-span-2">
            {entrada("complemento")}
          </Campo>
          <Campo rotulo="Bairro" nome="bairro" erro={e.bairro} className="sm:col-span-3">
            {entrada("bairro")}
          </Campo>
          <Campo rotulo="Município" nome="municipio" erro={e.municipio} className="sm:col-span-4">
            {entrada("municipio")}
          </Campo>
          <Campo rotulo="UF" nome="uf" erro={e.uf} className="sm:col-span-2">
            <Selecao name="uf" value={v.uf ?? ""} onChange={muda("uf")} erro={e.uf}>
              <option value="">—</option>
              {UFS.map((uf) => (
                <option key={uf}>{uf}</option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Telefone" nome="telefone" erro={e.telefone} className="sm:col-span-3">
            {entrada("telefone", { type: "tel" })}
          </Campo>
          <Campo rotulo="E-mail" nome="email" erro={e.email} className="sm:col-span-3">
            {entrada("email", { type: "email" })}
          </Campo>
        </div>
      </Cartao>

      <Cartao titulo="Regras de ponto">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="Faixas de horas extras"
            nome="tabelaHorasExtrasId"
            dica="Sem tabela, vale a tabela padrão das configurações (ou 50% e 100%)."
          >
            <Selecao name="tabelaHorasExtrasId" value={v.tabelaHorasExtrasId ?? ""} onChange={muda("tabelaHorasExtrasId")}>
              <option value="">Usar a tabela padrão</option>
              {tabelas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </Selecao>
          </Campo>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              name="ativo"
              checked={v.ativo !== "off"}
              onChange={(ev) => setV((x) => ({ ...x, ativo: ev.target.checked ? "on" : "off" }))}
              className="size-4 accent-marca-600"
            />
            Empresa ativa
          </label>
        </div>
      </Cartao>

      <div className="flex gap-3">
        <BotaoEnviar>Salvar empresa</BotaoEnviar>
        <LinkBotao href="/empresas" variante="secundario">
          Cancelar
        </LinkBotao>
      </div>
    </form>
  );
}
