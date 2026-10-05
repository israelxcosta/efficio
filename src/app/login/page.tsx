import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { usuarioAtual } from "@/server/dal";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaLogin(props: PageProps<"/login">) {
  if (await usuarioAtual()) redirect("/");
  const { de } = await props.searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-marca-50 via-white to-slate-100 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-3xl font-bold tracking-tight text-marca-600">efficio</p>
          <p className="mt-1 text-sm text-slate-500">Gestão de jornada e cálculo de ponto</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="mb-6 text-lg font-semibold text-slate-900">Acesse sua conta</h1>
          <FormularioLogin de={typeof de === "string" ? de : undefined} />
        </div>
      </div>
    </main>
  );
}
