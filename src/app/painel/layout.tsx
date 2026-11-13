import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { countReadyConfirmations } from "@/lib/confirmations";
import { brandStyle } from "@/lib/shop";
import { logout } from "../entrar/actions";
import { PainelNav } from "./nav";

export const metadata: Metadata = { title: "Painel", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const shop = user.barbershop;

  return (
    <div style={brandStyle(shop.primaryColor)} className="min-h-screen bg-[#f7f6f2] md:flex">
      <aside className="border-b border-tinta/10 bg-oliva-escuro text-creme/80 md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-b-0">
        <div className="flex items-center justify-between px-4 py-4 md:block md:px-5 md:py-6">
          <div>
            <p className="font-display text-2xl leading-none text-creme">
              Zer0nze <span className="text-brand">Co.</span>
            </p>
            <p className="mt-1.5 font-slab text-[11px] font-bold uppercase tracking-[0.25em] text-creme/50">Painel da barbearia</p>
          </div>
          <Link
            href="/"
            target="_blank"
            className="rounded-lg border border-creme/15 px-3 py-1.5 text-xs hover:bg-creme/10 md:hidden"
          >
            Ver site ↗
          </Link>
        </div>
        <PainelNav initialQueueCount={await countReadyConfirmations(shop)} />
        <div className="hidden border-t border-creme/10 p-4 text-sm md:mt-auto md:block">
          <Link href="/" target="_blank" className="mb-3 block text-brand hover:underline">
            Ver o site ↗
          </Link>
          <p className="truncate text-creme/60">{user.name}</p>
          <form action={logout}>
            <button className="mt-1 text-xs text-creme/40 hover:text-creme">Sair</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
