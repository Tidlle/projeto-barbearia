/**
 * Seed de demonstração: Barbearia Zer0nze (Alto da Mooca) com serviços, equipe e horários reais
 * (fonte: página pública da barbearia, nov/2026) + clientes FICTÍCIOS para demonstrar o CRM.
 *
 * Acesso ao painel de demonstração:
 *   e-mail: dono@zer0nze.local
 *   senha:  zer0nze123
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDaysToKey, dateKeyInTz, weekdayOf, zonedToUtc } from "../src/lib/time";

const db = new PrismaClient();
const TZ = "America/Sao_Paulo";

// PRNG determinístico para o seed ser reproduzível
let seed = 20261111;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

async function main() {
  await db.barbershop.deleteMany({ where: { slug: "zer0nze" } });

  const shop = await db.barbershop.create({
    data: {
      slug: "zer0nze",
      name: "Barbearia Zer0nze Co.",
      tagline: "Tradição clássica com atitude urbana de São Paulo",
      description:
        "A Zer0nze nasceu da mistura entre a barbearia clássica e a cultura street de São Paulo. Corte bem feito, barba alinhada e um ambiente pra quem valoriza estilo e autenticidade.",
      foundedYear: 2015,
      paymentMethods: ["Pix", "Crédito", "Débito", "Dinheiro"],
      address: "Rua da Mooca, 4053",
      neighborhood: "Alto da Mooca",
      city: "São Paulo - SP",
      phone: "1126014771",
      whatsapp: "5511983944279",
      instagram: "barbeariazer0nze",
      googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=BARBEARIA+ZER0NZE+ALTO+DA+MOOCA",
      googleRating: 4.9,
      googleReviewCount: 117,
      amenities: ["Estacionamento grátis", "Bar e lanchonete", "Wi-Fi", "TV", "Acessibilidade", "Adultos e crianças"],
      cancellationPolicy:
        "Imprevistos acontecem! Se for atrasar ou precisar cancelar, avise com antecedência pelo WhatsApp — assim a gente não atrasa o próximo cliente nem a agenda da casa.",
      primaryColor: "#e0a12a",
      // sem sinal: o cliente paga na barbearia e confirma presença pelo WhatsApp 2h antes
      paymentMode: "NONE",
      depositPercent: 30,
      confirmationEnabled: true,
      confirmationLeadMinutes: 120,
      slotIntervalMinutes: 15,
      minAdvanceMinutes: 60,
      maxAdvanceDays: 30,
    },
  });

  await db.user.create({
    data: {
      barbershopId: shop.id,
      name: "Equipe Zer0nze",
      email: "dono@zer0nze.local",
      passwordHash: await bcrypt.hash("zer0nze123", 10),
      role: "OWNER",
    },
  });

  const hours = [
    ...[2, 3, 4, 5].map((weekday) => ({ weekday, openTime: "10:00", closeTime: "20:00" })),
    { weekday: 6, openTime: "10:00", closeTime: "17:00" },
  ];
  await db.businessHour.createMany({ data: hours.map((h) => ({ ...h, barbershopId: shop.id })) });

  const servicesData = [
    // nomes, preços e durações da tabela pública da barbearia (nov/2026)
    { name: "Corte masculino", durationMinutes: 30, priceCents: 6000, category: "Cabelo", description: null },
    { name: "Corte raspado uniforme", durationMinutes: 15, priceCents: 3000, category: "Cabelo", description: "Máquina em altura única." },
    { name: "Barba", durationMinutes: 30, priceCents: 5000, category: "Barba", description: null },
    { name: "Bigode", durationMinutes: 10, priceCents: 2000, category: "Barba", description: null },
    { name: "Combo cabelo raspado + barba", durationMinutes: 45, priceCents: 8000, category: "Combos", description: "Corte raspado uniforme + barba." },
    { name: "Combo cabelo tesoura e máquina + barba", durationMinutes: 60, priceCents: 9000, category: "Combos", description: "Corte na tesoura e máquina + barba." },
  ];
  const services = [];
  for (const [i, s] of servicesData.entries()) {
    services.push(await db.service.create({ data: { ...s, barbershopId: shop.id, sortOrder: i } }));
  }

  const pros = [];
  for (const [i, name] of ["André", "China", "Bruno"].entries()) {
    pros.push(
      await db.professional.create({
        data: {
          barbershopId: shop.id,
          name,
          role: "Barbeiro",
          sortOrder: i,
          services: { create: services.map((s) => ({ serviceId: s.id })) },
          workingHours: { create: hours.map((h) => ({ weekday: h.weekday, startTime: h.openTime, endTime: h.closeTime })) },
        },
      }),
    );
  }

  // ---------- clientes fictícios ----------
  const names = [
    "Lucas Ferreira", "Gabriel Souza", "Rafael Lima", "Matheus Oliveira", "Pedro Santos", "Thiago Almeida",
    "Felipe Rocha", "Bruno Carvalho", "Diego Martins", "Rodrigo Ribeiro", "Caio Mendes", "Vinícius Barbosa",
    "Leonardo Costa", "Gustavo Pereira", "Henrique Araújo", "Eduardo Gomes", "Marcelo Dias", "André Nogueira",
    "Fernando Teixeira", "Igor Cardoso", "Samuel Moreira", "Daniel Freitas", "Renan Batista", "Victor Monteiro",
    "Otávio Pires", "João Vitor Campos", "Murilo Duarte", "Arthur Ramos", "Enzo Vieira", "Davi Correia",
  ];
  const sources = ["site", "instagram", "google", "indicacao", "whatsapp", "balcao"];
  const now = new Date();
  const todayKey = dateKeyInTz(now, TZ);
  const busy: Record<string, [number, number][]> = {};
  const fits = (proId: string, s: Date, e: Date) => {
    const list = (busy[proId] ??= []);
    if (list.some(([a, b]) => a < e.getTime() && b > s.getTime())) return false;
    list.push([s.getTime(), e.getTime()]);
    return true;
  };
  const randomSlot = (dayOffsetMin: number, dayOffsetMax: number) => {
    for (let tries = 0; tries < 50; tries++) {
      const key = addDaysToKey(todayKey, Math.floor(dayOffsetMin + rand() * (dayOffsetMax - dayOffsetMin + 1)));
      const wd = weekdayOf(key);
      if (wd === 0 || wd === 1) continue;
      const lastHour = wd === 6 ? 16 : 19;
      const h = 10 + Math.floor(rand() * (lastHour - 10));
      const m = pick([0, 30]);
      return { key, time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
    }
    return null;
  };

  for (const [i, name] of names.entries()) {
    const isLead = i >= 24; // últimos 6 são leads sem atendimento
    const phone = `55119${String(80000000 + Math.floor(rand() * 19999999)).padStart(8, "0")}`;
    const bMonth = i % 4 === 0 ? Number(todayKey.slice(5, 7)) : 1 + Math.floor(rand() * 12);
    const customer = await db.customer.create({
      data: {
        barbershopId: shop.id,
        name,
        phone,
        email: rand() > 0.5 ? `${name.split(" ")[0].toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}${i}@exemplo.com` : null,
        birthday: rand() > 0.3 ? new Date(Date.UTC(1985 + Math.floor(rand() * 20), bMonth - 1, 1 + Math.floor(rand() * 27))) : null,
        source: pick(sources),
        tags: rand() > 0.7 ? [pick(["VIP", "Prefere tesoura", "Barba toda semana", "Indica amigos"])] : [],
        leadStatus: isLead ? pick(["NEW", "NEW", "CONTACTED", "LOST"]) : "CONVERTED",
        marketingConsent: rand() > 0.2,
        createdAt: new Date(now.getTime() - (isLead ? rand() * 10 : 30 + rand() * 150) * 86_400_000),
      },
    });

    if (isLead) {
      const s = pick(services);
      await db.interaction.create({
        data: {
          barbershopId: shop.id,
          customerId: customer.id,
          type: "BOOKING_STARTED",
          content: `Começou a agendar "${s.name}" pelo site e não finalizou`,
          createdAt: customer.createdAt,
        },
      });
      continue;
    }

    // histórico: "sumidos" (i % 5 === 0) só têm visitas antigas
    const visits = 1 + Math.floor(rand() * 6);
    const oldOnly = i % 5 === 0;
    const favPro = pick(pros);
    for (let v = 0; v < visits; v++) {
      const slot = oldOnly ? randomSlot(-160, -60) : randomSlot(-120, -1);
      if (!slot) continue;
      const svc = pick(services);
      const pro = rand() > 0.25 ? favPro : pick(pros);
      const startsAt = zonedToUtc(slot.key, slot.time, TZ);
      const endsAt = new Date(startsAt.getTime() + svc.durationMinutes * 60_000);
      if (!fits(pro.id, startsAt, endsAt)) continue;
      const status = rand() > 0.93 ? "NO_SHOW" : "COMPLETED";
      await db.appointment.create({
        data: {
          barbershopId: shop.id,
          customerId: customer.id,
          professionalId: pro.id,
          serviceId: svc.id,
          startsAt,
          endsAt,
          status,
          priceCents: svc.priceCents,
          paidCents: status === "COMPLETED" ? svc.priceCents : 0,
          source: rand() > 0.4 ? "ONLINE" : "MANUAL",
          createdAt: new Date(startsAt.getTime() - 2 * 86_400_000),
        },
      });
    }

    // próximos horários (hoje até +6 dias) para a agenda não ficar vazia
    if (!oldOnly && rand() > 0.35) {
      const slot = randomSlot(0, 6);
      if (slot) {
        const svc = pick(services);
        const pro = favPro;
        const startsAt = zonedToUtc(slot.key, slot.time, TZ);
        const endsAt = new Date(startsAt.getTime() + svc.durationMinutes * 60_000);
        if (startsAt > now && fits(pro.id, startsAt, endsAt)) {
          // horários dentro das próximas 2h: metade ainda na fila de confirmações, metade já enviada
          const inWindow = startsAt.getTime() - now.getTime() <= 120 * 60_000;
          const reminderSentAt = inWindow && rand() > 0.5 ? new Date(startsAt.getTime() - 120 * 60_000) : null;
          const attendanceConfirmedAt = reminderSentAt && rand() > 0.4 ? new Date(reminderSentAt.getTime() + 20 * 60_000) : null;
          await db.appointment.create({
            data: {
              barbershopId: shop.id,
              customerId: customer.id,
              professionalId: pro.id,
              serviceId: svc.id,
              startsAt,
              endsAt,
              status: "CONFIRMED",
              priceCents: svc.priceCents,
              source: "ONLINE",
              reminderSentAt,
              attendanceConfirmedAt,
              createdAt: new Date(now.getTime() - (1 + rand() * 5) * 86_400_000),
            },
          });
        }
      }
    }

    await db.interaction.create({
      data: {
        barbershopId: shop.id,
        customerId: customer.id,
        type: "NOTE",
        content: pick(["Gosta de degradê baixo.", "Prefere horário depois das 18h.", "Sempre pede café.", "Cliente desde a inauguração.", "Usa pomada matte."]),
        createdBy: "Equipe Zer0nze",
        createdAt: new Date(customer.createdAt.getTime() + 86_400_000),
      },
    });
  }

  const counts = await Promise.all([db.customer.count(), db.appointment.count()]);
  console.log(`Seed ok: ${shop.name} · ${counts[0]} clientes · ${counts[1]} agendamentos`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
