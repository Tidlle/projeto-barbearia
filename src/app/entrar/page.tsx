import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { brandStyle, getShop } from "@/lib/shop";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Área da equipe", robots: { index: false } };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/painel");
  const shop = await getShop();
  return (
    <div style={brandStyle(shop?.primaryColor ?? "#e0a12a")} className="grid min-h-screen md:grid-cols-2">
      <div className="barber-stripes relative hidden bg-oliva md:block">
        <div className="absolute inset-0 flex flex-col justify-end p-12 text-creme">
          <p className="font-slab text-xs font-bold uppercase tracking-[0.3em] text-brand">Área da equipe</p>
          <p className="mt-3 font-display text-6xl leading-none">
            Zer0nze <span className="text-brand">Co.</span>
          </p>
          <p className="mt-4 max-w-sm text-creme/70">Agenda, clientes e pagamentos da barbearia em um só lugar.</p>
        </div>
      </div>
      <div className="paper flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <p className="font-display text-4xl text-oliva md:hidden">
            Zer0nze <span className="text-brand">Co.</span>
          </p>
          <h1 className="mt-4 font-slab text-2xl font-bold">Entrar no painel</h1>
          <p className="mt-1 text-sm text-tinta/60">Acesso restrito à equipe da {shop?.name.replace(/\.$/, "") ?? "barbearia"}.</p>
          <LoginForm />
          <Link href="/" className="mt-8 block text-center text-sm text-tinta/50 hover:text-oliva">
            ← Voltar para o site
          </Link>
        </div>
      </div>
    </div>
  );
}
