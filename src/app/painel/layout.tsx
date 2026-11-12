import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { brandStyle } from "@/lib/shop";
import { logout } from "../entrar/actions";
import { PainelNav } from "./nav";

export const metadata: Metadata = { title: "Painel — Navalha", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const shop = user.barbershop;

  return (
    <div style={brandStyle(shop.primaryColor)} className="min-h-screen bg-stone-50 md:flex">
      <aside className="border-b border-stone-200 bg-[#0d0c0b] text-stone-300 md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-b-0">
        <div className="flex items-center justify-between px-4 py-4 md:block md:px-5 md:py-6">
          <div>
            <p className="font-display text-3xl leading-none text-white">
              Navalha<span className="text-brand">.</span>
            </p>
            <p className="mt-1 truncate text-xs text-stone-500">{shop.name}</p>
          </div>
          <Link
            href={`/${shop.slug}`}
            target="_blank"
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5 md:hidden"
          >
            Ver site ↗
          </Link>
        </div>
        <PainelNav />
        <div className="hidden border-t border-white/5 p-4 text-sm md:mt-auto md:block">
          <Link href={`/${shop.slug}`} target="_blank" className="mb-3 block text-brand hover:underline">
            Ver meu site ↗
          </Link>
          <p className="truncate text-stone-400">{user.name}</p>
          <form action={logout}>
            <button className="mt-1 text-xs text-stone-500 hover:text-white">Sair</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
