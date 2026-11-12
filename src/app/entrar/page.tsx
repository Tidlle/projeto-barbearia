import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar — Navalha" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/painel");
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="barber-stripes relative hidden bg-[#0d0c0b] md:block">
        <div className="absolute inset-0 flex flex-col justify-end p-12">
          <p className="font-display text-7xl leading-none text-white">
            Navalha<span className="text-brand">.</span>
          </p>
          <p className="mt-4 max-w-sm text-stone-400">Agenda, pagamentos e carteira de clientes da sua barbearia em um só lugar.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <p className="font-display text-4xl text-stone-900 md:hidden">
            Navalha<span className="text-brand">.</span>
          </p>
          <h1 className="mt-4 text-2xl font-semibold text-stone-900">Entrar no painel</h1>
          <p className="mt-1 text-sm text-stone-500">Acesso para donos e equipe da barbearia.</p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
