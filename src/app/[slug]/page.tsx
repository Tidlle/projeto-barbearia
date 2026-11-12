import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDuration, formatMoney, formatPhone } from "@/lib/format";
import { brandStyle, getShopBySlug } from "@/lib/shop";
import { WEEKDAYS, dateKeyInTz, weekdayOf } from "@/lib/time";
import { waLink } from "@/lib/whatsapp";
import { WhatsAppIcon, cn } from "@/components/ui";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ origem?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shop = await getShopBySlug((await params).slug);
  if (!shop) return {};
  return {
    title: `${shop.name} — agende seu horário`,
    description: shop.tagline ?? shop.description ?? undefined,
  };
}

export default async function ShopPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { origem } = await searchParams;
  const shop = await getShopBySlug(slug);
  if (!shop) notFound();

  const [services, professionals] = await Promise.all([
    db.service.findMany({ where: { barbershopId: shop.id, active: true }, orderBy: { sortOrder: "asc" } }),
    db.professional.findMany({ where: { barbershopId: shop.id, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const q = origem ? `?origem=${encodeURIComponent(origem)}` : "";
  const bookHref = `/${shop.slug}/agendar${q}`;
  const withParam = (k: string, v: string) => `/${shop.slug}/agendar?${k}=${v}${origem ? `&origem=${encodeURIComponent(origem)}` : ""}`;

  const categories = [...new Set(services.map((s) => s.category ?? "Serviços"))];
  const todayWd = weekdayOf(dateKeyInTz(new Date(), shop.timezone));
  const hoursByDay = WEEKDAYS.map((label, wd) => ({
    label,
    wd,
    ranges: shop.businessHours.filter((h) => h.weekday === wd).map((h) => `${h.openTime} – ${h.closeTime}`),
  }));
  // mostra a semana começando na segunda
  const week = [...hoursByDay.slice(1), hoursByDay[0]];

  return (
    <div style={brandStyle(shop.primaryColor)} className="min-h-screen bg-[#0d0c0b] text-stone-200">
      {/* Topo */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0d0c0b]/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href={`/${shop.slug}`} className="font-display text-2xl tracking-wide text-white">
            {shop.name}
          </Link>
          <nav className="hidden gap-7 text-sm text-stone-400 md:flex">
            <a href="#servicos" className="hover:text-white">Serviços</a>
            <a href="#equipe" className="hover:text-white">Equipe</a>
            <a href="#visite" className="hover:text-white">Como chegar</a>
          </nav>
          <Link href={bookHref} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-brand-ink hover:brightness-110">
            Agendar
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="barber-stripes absolute inset-y-0 right-0 hidden w-1/3 opacity-60 md:block [mask-image:linear-gradient(to_left,black,transparent)]" />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 md:pb-28 md:pt-24">
          {shop.neighborhood && (
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-brand">
              {shop.neighborhood} · {shop.city}
            </p>
          )}
          <h1 className="font-display text-6xl leading-[0.9] text-white sm:text-7xl md:text-8xl">
            {shop.name.split(" ").map((w, i, arr) => (
              <span key={i} className={cn("block", i === arr.length - 1 && "text-brand")}>
                {w}
              </span>
            ))}
          </h1>
          {shop.tagline && <p className="mt-6 max-w-xl text-lg text-stone-300">{shop.tagline}</p>}

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href={bookHref} className="rounded-full bg-brand px-7 py-3.5 font-semibold text-brand-ink shadow-[0_0_40px_-8px_var(--brand)] hover:brightness-110">
              Agendar meu horário
            </Link>
            {shop.whatsapp && (
              <a
                href={waLink(shop.whatsapp, `Olá! Vim pelo site da ${shop.name}.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3.5 font-medium text-white hover:bg-white/5"
              >
                <WhatsAppIcon /> WhatsApp
              </a>
            )}
          </div>

          {shop.googleRating && (
            <a
              href={shop.googleMapsUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-10 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 hover:bg-white/[0.06]"
            >
              <span className="font-display text-4xl text-white">{shop.googleRating.toFixed(1).replace(".", ",")}</span>
              <span className="text-sm leading-tight">
                <span className="block text-brand">★★★★★</span>
                <span className="text-stone-400">{shop.googleReviewCount} avaliações no Google</span>
              </span>
            </a>
          )}
        </div>
      </section>

      {/* Serviços */}
      <section id="servicos" className="scroll-mt-20 border-t border-white/5 bg-[#121110]">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <SectionTitle kicker="Cardápio" title="Serviços" />
          <div className="mt-10 grid gap-12 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => (
              <div key={cat}>
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-stone-500">{cat}</h3>
                <ul className="space-y-1">
                  {services
                    .filter((s) => (s.category ?? "Serviços") === cat)
                    .map((s) => (
                      <li key={s.id}>
                        <Link
                          href={withParam("servico", s.id)}
                          className="group -mx-3 flex items-start justify-between gap-4 rounded-lg px-3 py-3 hover:bg-white/[0.04]"
                        >
                          <span>
                            <span className="block font-medium text-white group-hover:text-brand">{s.name}</span>
                            {s.description && <span className="mt-0.5 block text-sm text-stone-400">{s.description}</span>}
                            <span className="mt-1 block text-xs text-stone-500">{formatDuration(s.durationMinutes)}</span>
                          </span>
                          <span className="font-display text-2xl text-brand">{formatMoney(s.priceCents).replace(",00", "")}</span>
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Equipe */}
      <section id="equipe" className="scroll-mt-20 border-t border-white/5">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <SectionTitle kicker="Quem atende" title="Equipe" />
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {professionals.map((p) => (
              <Link
                key={p.id}
                href={withParam("profissional", p.id)}
                className="group rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-brand/60"
              >
                <div className="barber-stripes flex aspect-square items-center justify-center rounded-xl bg-white/[0.03]">
                  <span className="font-display text-6xl text-white">{p.name.slice(0, 1)}</span>
                </div>
                <p className="mt-4 font-display text-2xl tracking-wide text-white">{p.name}</p>
                <p className="text-sm text-stone-400">{p.role}</p>
                <p className="mt-3 text-sm font-medium text-brand opacity-80 group-hover:opacity-100">Agendar com {p.name} →</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Visite */}
      <section id="visite" className="scroll-mt-20 border-t border-white/5 bg-[#121110]">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 md:grid-cols-3 md:py-20">
          <div>
            <SectionTitle kicker="Funcionamento" title="Horários" />
            <ul className="mt-6 space-y-2 text-sm">
              {week.map((d) => (
                <li key={d.wd} className={cn("flex justify-between border-b border-white/5 pb-2", d.wd === todayWd && "text-brand")}>
                  <span>
                    {d.label}
                    {d.wd === todayWd && <span className="ml-2 text-xs">(hoje)</span>}
                  </span>
                  <span className={d.ranges.length ? "text-stone-200" : "text-stone-500"}>
                    {d.ranges.length ? d.ranges.join(", ") : "Fechado"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionTitle kicker="Endereço" title="Como chegar" />
            <p className="mt-6 text-stone-200">{shop.address}</p>
            <p className="text-stone-400">
              {shop.neighborhood} · {shop.city}
            </p>
            {shop.googleMapsUrl && (
              <a href={shop.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
                Abrir no Google Maps →
              </a>
            )}
            {shop.amenities.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2">
                {shop.amenities.map((a) => (
                  <span key={a} className="rounded-full border border-white/10 px-3 py-1 text-xs text-stone-300">
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <SectionTitle kicker="Fale com a gente" title="Contato" />
            <ul className="mt-6 space-y-3 text-sm">
              {shop.whatsapp && (
                <li>
                  <a href={waLink(shop.whatsapp)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-brand">
                    <WhatsAppIcon /> {formatPhone(shop.whatsapp)}
                  </a>
                </li>
              )}
              {shop.phone && <li>Telefone: {formatPhone(shop.phone)}</li>}
              {shop.instagram && (
                <li>
                  <a href={`https://instagram.com/${shop.instagram}`} target="_blank" rel="noopener noreferrer" className="hover:text-brand">
                    @{shop.instagram}
                  </a>
                </li>
              )}
            </ul>
            {shop.cancellationPolicy && (
              <div className="mt-8 rounded-xl border border-white/10 p-4 text-sm text-stone-400">
                <p className="mb-1 font-medium text-stone-200">Política de cancelamento</p>
                {shop.cancellationPolicy}
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 px-4 pb-28 pt-8 text-center text-xs text-stone-500 md:pb-8">
        Agendamento online por <span className="font-semibold text-stone-300">Navalha</span>
      </footer>

      {/* CTA fixo no celular */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#0d0c0b]/95 p-3 backdrop-blur md:hidden">
        <Link href={bookHref} className="block rounded-full bg-brand py-3.5 text-center font-semibold text-brand-ink">
          Agendar meu horário
        </Link>
      </div>
    </div>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand">{kicker}</p>
      <h2 className="mt-2 font-display text-5xl text-white">{title}</h2>
    </div>
  );
}
