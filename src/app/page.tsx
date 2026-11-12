import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const FEATURES = [
  { t: "Site com a sua marca", d: "Página própria da barbearia com serviços, equipe, avaliações e botão de agendar — nada de marketplace com concorrente ao lado." },
  { t: "Agendamento em 1 minuto", d: "Serviço, barbeiro, horário e pronto. Funciona no celular, direto do Instagram ou do Google." },
  { t: "Sinal via Pix ou cartão", d: "Cobre um sinal na hora de agendar e reduza as faltas. O dinheiro cai na sua conta do Mercado Pago." },
  { t: "CRM da sua carteira", d: "Histórico, ticket médio, frequência, aniversários e clientes sumidos — com mensagem pronta no WhatsApp." },
  { t: "Leads que não se perdem", d: "Quem começou a agendar e desistiu vira lead. Você chama no WhatsApp enquanto o interesse está quente." },
  { t: "Agenda da equipe", d: "Visão do dia por barbeiro, encaixes, bloqueios e status de cada atendimento." },
];

export default async function Home() {
  const shops = await db.barbershop.findMany({ select: { slug: true, name: true }, take: 5, orderBy: { createdAt: "asc" } });
  return (
    <div className="min-h-screen bg-[#0d0c0b] text-stone-300">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <span className="font-display text-3xl text-white">
          Navalha<span className="text-brand">.</span>
        </span>
        <Link href="/entrar" className="rounded-full border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/5">
          Entrar
        </Link>
      </header>
      <section className="relative overflow-hidden">
        <div className="barber-stripes absolute inset-y-0 right-0 w-1/2 opacity-50 [mask-image:linear-gradient(to_left,black,transparent)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-24">
          <h1 className="max-w-3xl font-display text-6xl leading-[0.95] text-white md:text-8xl">
            Agenda cheia, <span className="text-brand">cadeira</span> sem falta.
          </h1>
          <p className="mt-6 max-w-xl text-lg">
            Agendamento online com pagamento antecipado e um CRM feito para barbearias conhecerem — e trazerem de volta — seus clientes.
          </p>
          {shops.length > 0 && (
            <div className="mt-10 flex flex-wrap gap-3">
              {shops.map((s) => (
                <Link key={s.slug} href={`/${s.slug}`} className="rounded-full bg-brand px-6 py-3 font-semibold text-brand-ink hover:brightness-110">
                  Ver demo: {s.name} →
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 px-0 md:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.t} className="bg-[#0d0c0b] p-6">
            <h2 className="font-display text-2xl tracking-wide text-white">{f.t}</h2>
            <p className="mt-2 text-sm text-stone-400">{f.d}</p>
          </div>
        ))}
      </section>
      <footer className="py-12 text-center text-xs text-stone-600">Navalha · protótipo</footer>
    </div>
  );
}
