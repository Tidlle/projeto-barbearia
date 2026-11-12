import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDuration, formatMoney, formatPhone } from "@/lib/format";
import { brandStyle, getShop, openStatus } from "@/lib/shop";
import { WEEKDAYS, dateKeyInTz, weekdayOf } from "@/lib/time";
import { waLink } from "@/lib/whatsapp";
import { WhatsAppIcon, cn } from "@/components/ui";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ origem?: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const shop = await getShop();
  if (!shop) return {};
  return {
    title: { absolute: `${shop.name} — ${shop.neighborhood ?? "São Paulo"}` },
    description: shop.tagline ?? shop.description ?? undefined,
  };
}

const AMENITY_ICON: Record<string, string> = {
  "Estacionamento grátis": "P",
  "Bar e lanchonete": "☕︎",
  "Wi-Fi": "≋",
  TV: "▭",
  Acessibilidade: "♿︎",
  "Adultos e crianças": "✂",
};

export default async function ShopHome({ searchParams }: Props) {
  const { origem } = await searchParams;
  const shop = await getShop();
  if (!shop) notFound();

  const [services, professionals] = await Promise.all([
    db.service.findMany({ where: { barbershopId: shop.id, active: true }, orderBy: { sortOrder: "asc" } }),
    db.professional.findMany({ where: { barbershopId: shop.id, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const book = (params: Record<string, string> = {}) => {
    const q = new URLSearchParams({ ...params, ...(origem ? { origem } : {}) }).toString();
    return `/agendar${q ? `?${q}` : ""}`;
  };
  const categories = [...new Set(services.map((s) => s.category ?? "Serviços"))];
  const todayWd = weekdayOf(dateKeyInTz(new Date(), shop.timezone));
  const status = openStatus(shop.businessHours, shop.timezone);
  const week = [1, 2, 3, 4, 5, 6, 0].map((wd) => ({
    wd,
    label: WEEKDAYS[wd],
    ranges: shop.businessHours.filter((h) => h.weekday === wd).map((h) => `${h.openTime} – ${h.closeTime}`),
  }));
  const fullAddress = [shop.address, shop.neighborhood, shop.city].filter(Boolean).join(", ");
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(`${shop.name}, ${fullAddress}`)}&output=embed`;
  const [brandMain, brandSuffix] = splitName(shop.name);

  return (
    <div style={brandStyle(shop.primaryColor)} className="min-h-screen bg-creme text-tinta">
      {/* Topo */}
      <header className="sticky top-0 z-30 border-b border-tinta/10 bg-creme/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-display text-2xl leading-none text-oliva">{brandMain}</span>
            {brandSuffix && <span className="font-slab text-sm font-bold uppercase tracking-widest text-brand">{brandSuffix}</span>}
          </Link>
          <nav className="hidden gap-7 font-slab text-sm font-semibold uppercase tracking-wider text-tinta/70 md:flex">
            <a href="#servicos" className="hover:text-oliva">Serviços</a>
            <a href="#a-casa" className="hover:text-oliva">A casa</a>
            <a href="#equipe" className="hover:text-oliva">Equipe</a>
            <a href="#visite" className="hover:text-oliva">Visite</a>
          </nav>
          <Link href={book()} className="rounded-full bg-oliva px-5 py-2 font-slab text-sm font-bold uppercase tracking-wider text-creme hover:bg-oliva-escuro">
            Agendar
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl gap-3 px-4 pt-4 md:grid-cols-[1.45fr_1fr]">
        <div className="relative overflow-hidden rounded-3xl bg-oliva px-7 py-12 text-creme md:px-12 md:py-16">
          <div className="barber-stripes absolute inset-y-0 right-0 w-1/2 opacity-70 [mask-image:linear-gradient(to_left,black,transparent)]" />
          <div className="relative">
            <p className="font-slab text-xs font-bold uppercase tracking-[0.3em] text-brand">
              Barbearia · {shop.neighborhood ?? "São Paulo"}
              {shop.foundedYear ? ` · desde ${shop.foundedYear}` : ""}
            </p>
            <h1 className="mt-5 font-display text-6xl leading-[0.95] sm:text-7xl md:text-8xl">
              {brandMain}
              {brandSuffix && <span className="block text-brand">{brandSuffix}</span>}
            </h1>
            {shop.tagline && <p className="mt-6 max-w-md font-slab text-xl font-medium text-creme/85">{shop.tagline}</p>}
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href={book()} className="rounded-full bg-brand px-7 py-3.5 font-slab text-base font-bold uppercase tracking-wider text-brand-ink hover:brightness-105">
                Agendar meu horário
              </Link>
              {shop.whatsapp && (
                <a
                  href={waLink(shop.whatsapp, `Olá! Vim pelo site da ${shop.name}.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-creme/30 px-6 py-3.5 font-medium hover:bg-creme/10"
                >
                  <WhatsAppIcon /> WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-1 items-center justify-center rounded-3xl bg-brand p-8">
            <Seal name={brandMain.toUpperCase()} place={(shop.neighborhood ?? "São Paulo").toUpperCase()} year={shop.foundedYear} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {shop.googleRating && (
              <a
                href={shop.googleMapsUrl ?? "#visite"}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-3xl bg-white p-5 ring-1 ring-tinta/10 hover:ring-oliva/40"
              >
                <p className="font-display text-4xl text-oliva">{shop.googleRating.toFixed(1).replace(".", ",")}</p>
                <p className="mt-1 text-sm text-brand">★★★★★</p>
                <p className="text-xs text-tinta/60">{shop.googleReviewCount} avaliações no Google</p>
              </a>
            )}
            <a href="#visite" className="rounded-3xl bg-white p-5 ring-1 ring-tinta/10 hover:ring-oliva/40">
              <span className={cn("inline-block size-2.5 rounded-full", status.open ? "bg-emerald-500" : "bg-tinta/30")} />
              <p className="mt-2 font-slab text-lg font-bold leading-tight">{status.open ? "Aberto agora" : "Fechado agora"}</p>
              <p className="text-xs text-tinta/60">{status.label.split("· ")[1]}</p>
            </a>
          </div>
        </div>
      </section>

      {/* Faixa */}
      <div className="mt-10 overflow-hidden border-y border-tinta/10 bg-oliva-escuro py-3 text-creme" aria-hidden>
        <div className="animate-marquee flex w-max gap-8 whitespace-nowrap font-slab text-sm font-bold uppercase tracking-[0.25em]">
          {Array.from({ length: 2 }, (_, k) => (
            <span key={k} className="flex gap-8">
              {[...services.map((s) => s.name), `Desde ${shop.foundedYear ?? ""}`, shop.neighborhood ?? ""].filter(Boolean).map((t, i) => (
                <span key={i} className="flex gap-8">
                  {t} <span className="text-brand">✦</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* Serviços */}
      <section id="servicos" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <SectionTitle kicker="Tabela de preços" title="Serviços" />
          <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => (
              <div key={cat}>
                <h3 className="mb-3 border-b-2 border-oliva pb-2 font-slab text-sm font-bold uppercase tracking-[0.25em] text-oliva">{cat}</h3>
                <ul>
                  {services
                    .filter((s) => (s.category ?? "Serviços") === cat)
                    .map((s) => (
                      <li key={s.id}>
                        <Link href={book({ servico: s.id })} className="group block py-3">
                          <span className="flex items-baseline gap-2">
                            <span className="font-slab text-lg font-semibold group-hover:text-oliva">{s.name}</span>
                            <span className="mb-1 flex-1 border-b-2 border-dotted border-tinta/25" />
                            <span className="font-slab text-lg font-bold tabular-nums">{formatMoney(s.priceCents).replace(",00", "")}</span>
                          </span>
                          <span className="text-sm text-tinta/55">
                            {formatDuration(s.durationMinutes)}
                            {s.description && ` · ${s.description}`}
                            <span className="ml-2 text-oliva opacity-0 transition group-hover:opacity-100">Agendar →</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
          {shop.paymentMethods.length > 0 && (
            <p className="mt-10 text-sm text-tinta/60">Aceitamos {joinPt(shop.paymentMethods.map((m) => m.toLowerCase()).map((m, i) => (i === 0 ? cap(m) : m)))}.</p>
          )}
        </div>
      </section>

      {/* A casa */}
      <section id="a-casa" className="scroll-mt-20 bg-oliva-escuro text-creme">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <SectionTitle kicker="A casa" title="Herança do barbeiro clássico" light />
            {shop.description && <p className="mt-6 max-w-lg text-lg leading-relaxed text-creme/80">{shop.description}</p>}
            {shop.instagram && (
              <a
                href={`https://instagram.com/${shop.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-flex items-center gap-2 rounded-full border border-creme/25 px-5 py-3 font-slab font-semibold hover:bg-creme/10"
              >
                Siga @{shop.instagram} no Instagram →
              </a>
            )}
          </div>
          {shop.amenities.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 self-center">
              {shop.amenities.map((a) => (
                <li key={a} className="flex items-center gap-3 rounded-2xl bg-creme/[0.06] p-4 ring-1 ring-creme/10">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand font-slab text-lg font-bold text-brand-ink">
                    {AMENITY_ICON[a] ?? "✦"}
                  </span>
                  <span className="font-slab font-semibold leading-tight">{a}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Equipe */}
      <section id="equipe" className="paper scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <SectionTitle kicker="Quem atende" title="Equipe" />
          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {professionals.map((p) => (
              <Link
                key={p.id}
                href={book({ profissional: p.id })}
                className="group rounded-3xl bg-white p-5 ring-1 ring-tinta/10 transition hover:-translate-y-0.5 hover:ring-oliva/50"
              >
                {p.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photoUrl} alt={p.name} className="aspect-square w-full rounded-2xl object-cover" />
                ) : (
                  <div className="barber-stripes flex aspect-square items-center justify-center rounded-2xl bg-oliva">
                    <span className="font-display text-7xl text-creme">{p.name.slice(0, 1)}</span>
                  </div>
                )}
                <p className="mt-4 font-display text-2xl text-oliva">{p.name}</p>
                <p className="text-sm text-tinta/60">{p.role}</p>
                {p.bio && <p className="mt-2 text-sm text-tinta/70">{p.bio}</p>}
                <p className="mt-3 font-slab text-sm font-bold uppercase tracking-wider text-oliva">Agendar com {p.name} →</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Avaliações */}
      {shop.googleRating && (
        <section className="bg-brand text-brand-ink">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-12 md:flex-row md:items-center">
            <div className="flex items-center gap-5">
              <span className="font-display text-7xl leading-none">{shop.googleRating.toFixed(1).replace(".", ",")}</span>
              <div>
                <p className="text-2xl tracking-wider">★★★★★</p>
                <p className="font-slab text-lg font-semibold">{shop.googleReviewCount} avaliações de clientes no Google</p>
              </div>
            </div>
            {shop.googleMapsUrl && (
              <a
                href={shop.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-oliva-escuro px-6 py-3 font-slab font-bold uppercase tracking-wider text-creme hover:bg-tinta"
              >
                Ler as avaliações
              </a>
            )}
          </div>
        </section>
      )}

      {/* Visite */}
      <section id="visite" className="scroll-mt-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <SectionTitle kicker="Visite" title="Como chegar" />
            <p className="mt-6 font-slab text-xl font-semibold">{shop.address}</p>
            <p className="text-tinta/60">
              {shop.neighborhood} · {shop.city}
            </p>

            <ul className="mt-8 divide-y divide-tinta/10 border-y border-tinta/10 text-sm">
              {week.map((d) => (
                <li key={d.wd} className={cn("flex justify-between py-2.5", d.wd === todayWd && "font-semibold text-oliva")}>
                  <span>
                    {d.label}
                    {d.wd === todayWd && <span className="ml-2 rounded bg-oliva px-1.5 py-0.5 text-[10px] uppercase text-creme">hoje</span>}
                  </span>
                  <span className={d.ranges.length ? "" : "text-tinta/40"}>{d.ranges.length ? d.ranges.join(", ") : "Fechado"}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap gap-3">
              {shop.whatsapp && (
                <a href={waLink(shop.whatsapp)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-3 font-semibold text-[#0b2e17]">
                  <WhatsAppIcon /> {formatPhone(shop.whatsapp)}
                </a>
              )}
              {shop.phone && (
                <a href={`tel:+55${shop.phone}`} className="rounded-full border border-tinta/20 px-5 py-3 font-semibold hover:bg-white">
                  ☎ {formatPhone(shop.phone)}
                </a>
              )}
            </div>
            {shop.cancellationPolicy && <p className="mt-8 rounded-2xl bg-white p-4 text-sm text-tinta/70 ring-1 ring-tinta/10">{shop.cancellationPolicy}</p>}
          </div>
          <div className="min-h-80 overflow-hidden rounded-3xl ring-1 ring-tinta/10">
            <iframe title={`Mapa — ${shop.name}`} src={mapSrc} className="h-full min-h-80 w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </div>
        </div>
      </section>

      <footer className="bg-oliva-escuro px-4 pb-28 pt-10 text-creme/70 md:pb-10">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 text-sm md:flex-row md:items-center">
          <div>
            <p className="font-display text-2xl text-creme">
              {brandMain} <span className="text-brand">{brandSuffix}</span>
            </p>
            <p>
              {fullAddress}
              {shop.foundedYear ? ` · desde ${shop.foundedYear}` : ""}
            </p>
          </div>
          <Link href="/entrar" className="text-xs text-creme/40 hover:text-creme">
            Área da equipe
          </Link>
        </div>
      </footer>

      {/* CTA fixo no celular */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-tinta/10 bg-creme/95 p-3 backdrop-blur md:hidden">
        <Link href={book()} className="block rounded-full bg-oliva py-3.5 text-center font-slab font-bold uppercase tracking-wider text-creme">
          Agendar meu horário
        </Link>
      </div>
    </div>
  );
}

function SectionTitle({ kicker, title, light }: { kicker: string; title: string; light?: boolean }) {
  return (
    <div>
      <p className="font-slab text-xs font-bold uppercase tracking-[0.3em] text-brand">{kicker}</p>
      <h2 className={cn("mt-2 font-display text-4xl md:text-5xl", light ? "text-creme" : "text-oliva")}>{title}</h2>
    </div>
  );
}

/** Selo circular: nome em volta, ano no centro. */
function Seal({ name, place, year }: { name: string; place: string; year: number | null }) {
  const ring = `BARBEARIA ${name} ✦ ${place} ✦ SÃO PAULO ✦ `;
  return (
    <svg viewBox="0 0 200 200" className="w-full max-w-60 text-oliva-escuro" role="img" aria-label={`${name}${year ? `, desde ${year}` : ""}`}>
      <defs>
        <path id="seal-ring" d="M100,100 m-74,0 a74,74 0 1,1 148,0 a74,74 0 1,1 -148,0" />
      </defs>
      <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="100" cy="100" r="58" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text className="font-slab" fontSize="13" fontWeight="700" letterSpacing="2.2" fill="currentColor">
        <textPath href="#seal-ring" textLength="462">
          {ring}
        </textPath>
      </text>
      <text x="100" y="92" textAnchor="middle" fontSize="11" fontWeight="700" letterSpacing="3" fill="currentColor" className="font-slab">
        DESDE
      </text>
      <text x="100" y="124" textAnchor="middle" fontSize="34" fill="currentColor" className="font-display">
        {year ?? "SP"}
      </text>
    </svg>
  );
}

function splitName(name: string): [string, string] {
  // "Barbearia Zer0nze Co." -> ["Zer0nze", "Co."]
  const clean = name.replace(/^barbearia\s+/i, "");
  const m = clean.match(/^(.*?)\s+(co\.?|& co\.?)$/i);
  return m ? [m[1], m[2]] : [clean, ""];
}

function joinPt(list: string[]) {
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} e ${list.at(-1)}`;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
