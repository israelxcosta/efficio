import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { Cabecalho, Cartao, Selo, Tabela, Th } from "@/components/ui";
import { exigirAdmin } from "@/server/dal";
import { alterarPerfil, alternarUsuario } from "./actions";
import { FormularioNovoUsuario, FormularioRedefinir } from "./formularios";

export const metadata: Metadata = { title: "Usuários" };

export default async function PaginaUsuarios() {
  const eu = await exigirAdmin();
  const lista = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      perfil: usuarios.perfil,
      ativo: usuarios.ativo,
      ultimoAcesso: usuarios.ultimoAcesso,
      bloqueadoAte: usuarios.bloqueadoAte,
    })
    .from(usuarios)
    .orderBy(asc(usuarios.nome));
  const agora = new Date();

  return (
    <>
      <Cabecalho titulo="Usuários" descricao="Quem acessa o sistema e com qual perfil." />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Tabela>
          <thead>
            <tr>
              <Th>Usuário</Th>
              <Th>Perfil</Th>
              <Th>Último acesso</Th>
              <Th>Situação</Th>
              <Th>Senha</Th>
            </tr>
          </thead>
          <tbody>
            {lista.map((u) => {
              const proprio = u.id === eu.id;
              return (
                <tr key={u.id} className="align-top">
                  <td>
                    <p className="font-medium text-slate-900">
                      {u.nome} {proprio && <span className="text-xs text-slate-500">(você)</span>}
                    </p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td>
                    {proprio ? (
                      <Selo tom="marca">{u.perfil === "admin" ? "Administrador" : "Operador"}</Selo>
                    ) : (
                      <form action={alterarPerfil} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="perfil" value={u.perfil === "admin" ? "operador" : "admin"} />
                        <Selo tom={u.perfil === "admin" ? "marca" : "neutro"}>{u.perfil === "admin" ? "Administrador" : "Operador"}</Selo>
                        <button className="text-xs text-marca-700 hover:underline">trocar</button>
                      </form>
                    )}
                  </td>
                  <td className="text-xs whitespace-nowrap text-slate-600">
                    {u.ultimoAcesso ? u.ultimoAcesso.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Nunca"}
                  </td>
                  <td>
                    <div className="flex flex-col items-start gap-1">
                      {u.ativo ? <Selo tom="sucesso">Ativo</Selo> : <Selo>Desativado</Selo>}
                      {u.bloqueadoAte && u.bloqueadoAte > agora && <Selo tom="alerta">Bloqueado por tentativas</Selo>}
                      {!proprio && (
                        <form action={alternarUsuario}>
                          <input type="hidden" name="id" value={u.id} />
                          <button className="text-xs text-slate-500 hover:text-red-600">{u.ativo ? "Desativar" : "Reativar"}</button>
                        </form>
                      )}
                    </div>
                  </td>
                  <td>{!proprio && <FormularioRedefinir id={u.id} />}</td>
                </tr>
              );
            })}
          </tbody>
        </Tabela>
        <Cartao titulo="Novo usuário">
          <FormularioNovoUsuario />
        </Cartao>
      </div>
    </>
  );
}
