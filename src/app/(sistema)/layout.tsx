import { sair } from "@/app/login/actions";
import { exigirUsuario } from "@/server/dal";
import { Menu } from "./menu";

export default async function LayoutSistema({ children }: LayoutProps<"/">) {
  const usuario = await exigirUsuario();
  return (
    <div className="min-h-screen">
      <Menu admin={usuario.perfil === "admin"} nome={usuario.nome} sair={sair} />
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
