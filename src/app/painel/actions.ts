"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasConflict } from "@/lib/availability";
import { markConfirmationSent, sendConfirmationViaApi, skipConfirmation, undoConfirmationSent } from "@/lib/confirmations";
import { requireUser } from "@/lib/auth";
import { decodeCsv, parseBirthdayLoose, parseCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { normalizePhone, parseMoneyToCents, STATUS_LABEL } from "@/lib/format";
import { formatWhen, isValidDateKey, isValidTime, minutesOf, zonedToUtc } from "@/lib/time";

// ---------- helpers ----------
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => str(fd, k) || null;
const int = (fd: FormData, k: string, min: number, max: number, fallback: number) => {
  const n = Number(str(fd, k));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
/** primeiro valor preenchido entre as colunas aceitas */
const col = (r: Record<string, string>, ...keys: string[]) => keys.map((k) => r[k]?.trim()).find(Boolean) ?? "";
const tagsOf = (v: string) => [...new Set(v.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 15);
const back = (path: string, params: Record<string, string>) =>
  redirect(`${path}?${new URLSearchParams(params).toString()}`);

function parseHours(fd: FormData) {
  const out: { weekday: number; start: string; end: string }[] = [];
  for (let wd = 0; wd < 7; wd++) {
    if (fd.get(`h_${wd}_on`) !== "on") continue;
    const start = str(fd, `h_${wd}_start`);
    const end = str(fd, `h_${wd}_end`);
    if (isValidTime(start) && isValidTime(end) && minutesOf(start) < minutesOf(end)) out.push({ weekday: wd, start, end });
  }
  return out;
}

// ---------- agenda ----------
export async function setAppointmentStatus(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!["CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED"].includes(status)) throw new Error("Status inválido");
  const appt = await db.appointment.findFirst({
    where: { id, barbershopId: user.barbershopId },
    include: { service: true },
  });
  if (!appt) throw new Error("Agendamento não encontrado");

  await db.$transaction([
    db.appointment.update({
      where: { id },
      // concluído = recebido o restante no balcão
      data: { status, holdExpiresAt: null, ...(status === "COMPLETED" ? { paidCents: Math.max(appt.paidCents, appt.priceCents) } : {}) },
    }),
    ...(status === "COMPLETED" || status === "CONFIRMED"
      ? [db.customer.update({ where: { id: appt.customerId }, data: { leadStatus: "CONVERTED" } })]
      : []),
    db.interaction.create({
      data: {
        barbershopId: user.barbershopId,
        customerId: appt.customerId,
        type: "BOOKING_STATUS",
        content: `${STATUS_LABEL[status]}: ${appt.service.name} (${formatWhen(appt.startsAt, user.barbershop.timezone)})`,
        createdBy: user.name,
      },
    }),
  ]);
  revalidatePath("/painel", "layout");
}

export async function createManualAppointment(fd: FormData) {
  const user = await requireUser();
  const shop = user.barbershop;
  const date = str(fd, "date");
  const time = str(fd, "time");
  const backTo = (erro: string) => back("/painel/agenda", { data: date, erro });

  const phone = normalizePhone(str(fd, "phone"));
  const name = str(fd, "name");
  if (!phone) backTo("Telefone inválido — use DDD + número.");
  if (!isValidDateKey(date) || !isValidTime(time)) backTo("Data ou hora inválida.");

  const [service, professional] = await Promise.all([
    db.service.findFirst({ where: { id: str(fd, "serviceId"), barbershopId: shop.id } }),
    db.professional.findFirst({ where: { id: str(fd, "professionalId"), barbershopId: shop.id } }),
  ]);
  if (!service || !professional) backTo("Escolha serviço e profissional.");

  const startsAt = zonedToUtc(date, time, shop.timezone);
  const endsAt = new Date(startsAt.getTime() + service!.durationMinutes * 60_000);

  const conflict = await db.$transaction(async (tx) => {
    if (await hasConflict(tx, professional!.id, startsAt, endsAt)) return true;
    const existing = await tx.customer.findUnique({ where: { barbershopId_phone: { barbershopId: shop.id, phone: phone! } } });
    const customer =
      existing ??
      (await tx.customer.create({
        data: { barbershopId: shop.id, name: name || "Cliente", phone: phone!, source: "balcao", leadStatus: "CONVERTED" },
      }));
    await tx.appointment.create({
      data: {
        barbershopId: shop.id,
        customerId: customer.id,
        professionalId: professional!.id,
        serviceId: service!.id,
        startsAt,
        endsAt,
        status: "CONFIRMED",
        priceCents: service!.priceCents,
        source: "MANUAL",
        notes: opt(fd, "notes"),
      },
    });
    await tx.customer.update({ where: { id: customer.id }, data: { leadStatus: "CONVERTED" } });
    await tx.interaction.create({
      data: {
        barbershopId: shop.id,
        customerId: customer.id,
        type: "BOOKING_CREATED",
        content: `Encaixe pelo painel: ${service!.name} com ${professional!.name} (${formatWhen(startsAt, shop.timezone)})`,
        createdBy: user.name,
      },
    });
    return false;
  });
  if (conflict) backTo(`${professional!.name} já tem atendimento nesse horário.`);
  revalidatePath("/painel", "layout");
  back("/painel/agenda", { data: date, ok: "Agendamento criado" });
}

export async function createTimeOff(fd: FormData) {
  const user = await requireUser();
  const shop = user.barbershop;
  const date = str(fd, "date");
  const start = str(fd, "start");
  const end = str(fd, "end");
  if (!isValidDateKey(date) || !isValidTime(start) || !isValidTime(end) || minutesOf(start) >= minutesOf(end)) {
    back("/painel/agenda", { data: date, erro: "Horário de bloqueio inválido." });
  }
  const professionalId = opt(fd, "professionalId");
  if (professionalId && !(await db.professional.findFirst({ where: { id: professionalId, barbershopId: shop.id } }))) {
    throw new Error("Profissional inválido");
  }
  await db.timeOff.create({
    data: {
      barbershopId: shop.id,
      professionalId,
      startsAt: zonedToUtc(date, start, shop.timezone),
      endsAt: zonedToUtc(date, end, shop.timezone),
      reason: opt(fd, "reason"),
    },
  });
  revalidatePath("/painel/agenda");
  back("/painel/agenda", { data: date, ok: "Horário bloqueado" });
}

export async function deleteTimeOff(fd: FormData) {
  const user = await requireUser();
  await db.timeOff.deleteMany({ where: { id: str(fd, "id"), barbershopId: user.barbershopId } });
  revalidatePath("/painel/agenda");
}

// ---------- clientes / CRM ----------
export async function createCustomer(fd: FormData) {
  const user = await requireUser();
  const phone = normalizePhone(str(fd, "phone"));
  if (!phone) back("/painel/clientes", { erro: "Telefone inválido — use DDD + número." });
  const existing = await db.customer.findUnique({ where: { barbershopId_phone: { barbershopId: user.barbershopId, phone: phone! } } });
  if (existing) redirect(`/painel/clientes/${existing.id}`);
  const c = await db.customer.create({
    data: {
      barbershopId: user.barbershopId,
      name: str(fd, "name") || "Sem nome",
      phone: phone!,
      email: opt(fd, "email"),
      birthday: parseBirthdayLoose(str(fd, "birthday")) ?? null,
      source: opt(fd, "source") ?? "manual",
      tags: tagsOf(str(fd, "tags")),
      notes: opt(fd, "notes"),
      marketingConsent: fd.get("consent") === "on",
    },
  });
  revalidatePath("/painel", "layout");
  redirect(`/painel/clientes/${c.id}`);
}

export async function updateCustomer(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "id");
  const phone = normalizePhone(str(fd, "phone"));
  const path = `/painel/clientes/${id}`;
  if (!phone) back(path, { erro: "Telefone inválido." });
  const dup = await db.customer.findFirst({ where: { barbershopId: user.barbershopId, phone: phone!, id: { not: id } } });
  if (dup) back(path, { erro: "Já existe outro cliente com esse telefone." });
  await db.customer.updateMany({
    where: { id, barbershopId: user.barbershopId },
    data: {
      name: str(fd, "name") || "Sem nome",
      phone: phone!,
      email: opt(fd, "email"),
      birthday: parseBirthdayLoose(str(fd, "birthday")) ?? null,
      source: opt(fd, "source"),
      tags: tagsOf(str(fd, "tags")),
      notes: opt(fd, "notes"),
      marketingConsent: fd.get("consent") === "on",
    },
  });
  revalidatePath(path);
  back(path, { ok: "Dados salvos" });
}

export async function deleteCustomer(fd: FormData) {
  const user = await requireUser();
  await db.customer.deleteMany({ where: { id: str(fd, "id"), barbershopId: user.barbershopId } });
  revalidatePath("/painel", "layout");
  redirect("/painel/clientes");
}

export async function addNote(fd: FormData) {
  const user = await requireUser();
  const customerId = str(fd, "customerId");
  const content = str(fd, "content").slice(0, 2000);
  if (!content) return;
  const customer = await db.customer.findFirst({ where: { id: customerId, barbershopId: user.barbershopId } });
  if (!customer) throw new Error("Cliente não encontrado");
  await db.interaction.create({
    data: { barbershopId: user.barbershopId, customerId, type: "NOTE", content, createdBy: user.name },
  });
  revalidatePath(`/painel/clientes/${customerId}`);
}

export async function setLeadStatus(fd: FormData) {
  const user = await requireUser();
  const customerId = str(fd, "customerId");
  const status = str(fd, "status");
  if (!["NEW", "CONTACTED", "CONVERTED", "LOST"].includes(status)) throw new Error("Status inválido");
  const res = await db.customer.updateMany({ where: { id: customerId, barbershopId: user.barbershopId }, data: { leadStatus: status } });
  if (res.count) {
    const labels: Record<string, string> = { NEW: "Novo", CONTACTED: "Em contato", CONVERTED: "Convertido", LOST: "Perdido" };
    await db.interaction.create({
      data: { barbershopId: user.barbershopId, customerId, type: "LEAD_STATUS", content: `Lead movido para "${labels[status]}"`, createdBy: user.name },
    });
  }
  revalidatePath("/painel", "layout");
}

/** Registra no histórico que o cliente foi contatado pelo WhatsApp. */
export async function logWhatsApp(customerId: string, label: string) {
  const user = await requireUser();
  const customer = await db.customer.findFirst({ where: { id: customerId, barbershopId: user.barbershopId } });
  if (!customer) return;
  await db.$transaction([
    db.interaction.create({
      data: { barbershopId: user.barbershopId, customerId, type: "WHATSAPP", content: `WhatsApp enviado: ${label}`.slice(0, 200), createdBy: user.name },
    }),
    ...(customer.leadStatus === "NEW" ? [db.customer.update({ where: { id: customerId }, data: { leadStatus: "CONTACTED" } })] : []),
  ]);
  revalidatePath("/painel", "layout");
}

export async function importCustomers(fd: FormData) {
  const user = await requireUser();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back("/painel/clientes", { erro: "Selecione um arquivo CSV." });
  if ((file as File).size > 5_000_000) back("/painel/clientes", { erro: "Arquivo muito grande (máx. 5 MB)." });
  const rows = parseCsv(decodeCsv(await (file as File).arrayBuffer()));
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const r of rows) {
    // aceita a planilha exportada pela Trinks (Nome, Celular, Telefone, E-mail, Data de Nascimento, Observações)
    // e planilhas simples (nome, telefone, email, aniversario, tags, observacoes)
    const phone =
      normalizePhone(col(r, "celular", "telefone_celular", "whatsapp")) ?? normalizePhone(col(r, "telefone", "fone", "phone"));
    const name = col(r, "nome", "nome_completo", "cliente", "name");
    const email = col(r, "email", "e-mail", "e_mail") || null;
    const notes = col(r, "observacoes", "observacao", "obs") || null;
    if (!phone || !name) {
      skipped++;
      continue;
    }
    const birthday = parseBirthdayLoose(col(r, "aniversario", "data_de_nascimento", "nascimento", "data_nascimento"));
    const existing = await db.customer.findUnique({ where: { barbershopId_phone: { barbershopId: user.barbershopId, phone } } });
    if (existing) {
      await db.customer.update({
        where: { id: existing.id },
        data: { email: existing.email ?? email, birthday: existing.birthday ?? birthday ?? null },
      });
      updated++;
    } else {
      const c = await db.customer.create({
        data: {
          barbershopId: user.barbershopId,
          name,
          phone,
          email,
          birthday: birthday ?? null,
          tags: tagsOf(col(r, "tags", "etiquetas")),
          notes,
          source: "importado",
          leadStatus: "CONVERTED",
        },
      });
      await db.interaction.create({
        data: { barbershopId: user.barbershopId, customerId: c.id, type: "IMPORT", content: "Importado de planilha", createdBy: user.name },
      });
      created++;
    }
  }
  revalidatePath("/painel", "layout");
  back("/painel/clientes", { ok: `Importação concluída: ${created} novos, ${updated} atualizados, ${skipped} ignorados.` });
}

// ---------- serviços ----------
export async function saveService(fd: FormData) {
  const user = await requireUser();
  const id = opt(fd, "id");
  const priceCents = parseMoneyToCents(str(fd, "price"));
  const name = str(fd, "name");
  if (!name || priceCents === null) back("/painel/servicos", { erro: "Informe nome e preço válidos." });
  const data = {
    name,
    description: opt(fd, "description"),
    category: opt(fd, "category"),
    durationMinutes: int(fd, "duration", 5, 600, 30),
    priceCents: priceCents!,
    active: fd.get("active") === "on",
  };
  if (id) {
    await db.service.updateMany({ where: { id, barbershopId: user.barbershopId }, data });
  } else {
    const count = await db.service.count({ where: { barbershopId: user.barbershopId } });
    const service = await db.service.create({ data: { ...data, barbershopId: user.barbershopId, sortOrder: count } });
    // por padrão, todos os profissionais ativos fazem o novo serviço
    const pros = await db.professional.findMany({ where: { barbershopId: user.barbershopId, active: true }, select: { id: true } });
    await db.professionalService.createMany({ data: pros.map((p) => ({ professionalId: p.id, serviceId: service.id })) });
  }
  revalidatePath("/painel/servicos");
  back("/painel/servicos", { ok: "Serviço salvo" });
}

// ---------- equipe ----------
export async function saveProfessional(fd: FormData) {
  const user = await requireUser();
  const id = opt(fd, "id");
  const name = str(fd, "name");
  if (!name) back("/painel/equipe", { erro: "Informe o nome." });
  const serviceIds = fd.getAll("services").map(String);
  const validServices = await db.service.findMany({
    where: { id: { in: serviceIds }, barbershopId: user.barbershopId },
    select: { id: true },
  });
  const hours = parseHours(fd);
  const data = { name, role: str(fd, "role") || "Barbeiro", bio: opt(fd, "bio"), active: fd.get("active") === "on" };

  await db.$transaction(async (tx) => {
    let proId = id;
    if (proId) {
      const res = await tx.professional.updateMany({ where: { id: proId, barbershopId: user.barbershopId }, data });
      if (!res.count) throw new Error("Profissional não encontrado");
      await tx.professionalService.deleteMany({ where: { professionalId: proId } });
      await tx.workingHour.deleteMany({ where: { professionalId: proId } });
    } else {
      const count = await tx.professional.count({ where: { barbershopId: user.barbershopId } });
      proId = (await tx.professional.create({ data: { ...data, barbershopId: user.barbershopId, sortOrder: count } })).id;
    }
    await tx.professionalService.createMany({ data: validServices.map((s) => ({ professionalId: proId!, serviceId: s.id })) });
    await tx.workingHour.createMany({
      data: hours.map((h) => ({ professionalId: proId!, weekday: h.weekday, startTime: h.start, endTime: h.end })),
    });
  });
  revalidatePath("/painel", "layout");
  back("/painel/equipe", { ok: `${name} salvo` });
}

// ---------- configurações ----------
export async function saveSettings(fd: FormData) {
  const user = await requireUser();
  const mode = str(fd, "paymentMode");
  const color = str(fd, "primaryColor");
  const rating = Number(str(fd, "googleRating").replace(",", "."));
  const whatsapp = str(fd, "whatsapp") ? normalizePhone(str(fd, "whatsapp")) : null;
  if (str(fd, "whatsapp") && !whatsapp) back("/painel/configuracoes", { erro: "WhatsApp inválido." });

  await db.barbershop.update({
    where: { id: user.barbershopId },
    data: {
      name: str(fd, "name") || user.barbershop.name,
      tagline: opt(fd, "tagline"),
      description: opt(fd, "description"),
      address: opt(fd, "address"),
      neighborhood: opt(fd, "neighborhood"),
      city: opt(fd, "city"),
      phone: str(fd, "phone").replace(/\D/g, "") || null,
      whatsapp,
      instagram: str(fd, "instagram").replace(/^@/, "") || null,
      googleMapsUrl: opt(fd, "googleMapsUrl"),
      googleRating: Number.isFinite(rating) && rating > 0 && rating <= 5 ? rating : null,
      googleReviewCount: str(fd, "googleReviewCount") ? int(fd, "googleReviewCount", 0, 1_000_000, 0) : null,
      amenities: tagsOf(str(fd, "amenities")),
      cancellationPolicy: opt(fd, "cancellationPolicy"),
      primaryColor: /^#[0-9a-fA-F]{6}$/.test(color) ? color : user.barbershop.primaryColor,
      paymentMode: ["NONE", "DEPOSIT", "FULL"].includes(mode) ? mode : user.barbershop.paymentMode,
      depositPercent: int(fd, "depositPercent", 5, 100, 30),
      slotIntervalMinutes: int(fd, "slotIntervalMinutes", 5, 120, 15),
      minAdvanceMinutes: int(fd, "minAdvanceMinutes", 0, 10_080, 60),
      maxAdvanceDays: int(fd, "maxAdvanceDays", 1, 180, 30),
      holdMinutes: int(fd, "holdMinutes", 5, 120, 15),
      inactiveAfterDays: int(fd, "inactiveAfterDays", 7, 365, 45),
      confirmationEnabled: fd.get("confirmationEnabled") === "on",
      // só as opções da lista: 24h, 3h, 2h ou 1h antes
      confirmationLeadMinutes: [1440, 180, 120, 60].includes(Number(str(fd, "confirmationLeadMinutes")))
        ? Number(str(fd, "confirmationLeadMinutes"))
        : user.barbershop.confirmationLeadMinutes,
      confirmationBatchMinutes: [0, 30, 60].includes(Number(str(fd, "confirmationBatchMinutes"))) ? Number(str(fd, "confirmationBatchMinutes")) : 0,
    },
  });
  const hours = parseHours(fd);
  await db.$transaction([
    db.businessHour.deleteMany({ where: { barbershopId: user.barbershopId } }),
    db.businessHour.createMany({
      data: hours.map((h) => ({ barbershopId: user.barbershopId, weekday: h.weekday, openTime: h.start, closeTime: h.end })),
    }),
  ]);
  revalidatePath("/", "layout");
  back("/painel/configuracoes", { ok: "Configurações salvas" });
}

// ---------- confirmação de presença ----------
/** Equipe tocou em "Enviar": o WhatsApp abriu com a mensagem pronta. */
export async function markConfirmationSentAction(appointmentId: string) {
  const user = await requireUser();
  await markConfirmationSent(appointmentId, user.barbershopId, user.name);
  revalidatePath("/painel", "layout");
}

/** Desfaz o último "enviado" (a mensagem não foi mandada de fato). */
export async function undoConfirmationSentAction(appointmentId: string) {
  const user = await requireUser();
  await undoConfirmationSent(appointmentId, user.barbershopId);
  revalidatePath("/painel", "layout");
}

/** Tira da fila sem enviar. */
export async function skipConfirmationAction(appointmentId: string) {
  const user = await requireUser();
  await skipConfirmation(appointmentId, user.barbershopId, user.name);
  revalidatePath("/painel", "layout");
}

/** Envio pela API oficial (só quando configurada). */
export async function sendConfirmationApiAction(appointmentId: string) {
  const user = await requireUser();
  const appt = await db.appointment.findFirst({ where: { id: appointmentId, barbershopId: user.barbershopId } });
  if (!appt) throw new Error("Agendamento não encontrado");
  const r = await sendConfirmationViaApi(appointmentId, user.name);
  revalidatePath("/painel", "layout");
  return r;
}

/** Dono marca a presença como confirmada (ex.: cliente respondeu por telefone). */
export async function setAttendanceConfirmed(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "id");
  const confirmed = str(fd, "value") !== "false";
  const appt = await db.appointment.findFirst({ where: { id, barbershopId: user.barbershopId }, include: { service: true } });
  if (!appt) throw new Error("Agendamento não encontrado");
  await db.$transaction([
    db.appointment.update({ where: { id }, data: { attendanceConfirmedAt: confirmed ? new Date() : null } }),
    db.interaction.create({
      data: {
        barbershopId: user.barbershopId,
        customerId: appt.customerId,
        type: "BOOKING_STATUS",
        content: confirmed
          ? `✅ Presença confirmada pela equipe: ${appt.service.name} (${formatWhen(appt.startsAt, user.barbershop.timezone)})`
          : `Confirmação de presença desfeita: ${appt.service.name}`,
        createdBy: user.name,
      },
    }),
  ]);
  revalidatePath("/painel", "layout");
}
