"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SHOP_SLUG } from "@/lib/shop";
import { formatWhen } from "@/lib/time";

async function load(token: string) {
  const appt = await db.appointment.findUnique({
    where: { publicToken: token },
    include: { barbershop: true, service: true },
  });
  if (!appt || appt.barbershop.slug !== SHOP_SLUG) throw new Error("Agendamento não encontrado");
  return appt;
}

/** Cliente confirma que vai comparecer. */
export async function confirmAttendance(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  const appt = await load(token);
  if (appt.status === "CONFIRMED" && !appt.attendanceConfirmedAt && appt.endsAt > new Date()) {
    await db.$transaction([
      db.appointment.update({ where: { id: appt.id }, data: { attendanceConfirmedAt: new Date() } }),
      db.interaction.create({
        data: {
          barbershopId: appt.barbershopId,
          customerId: appt.customerId,
          type: "BOOKING_STATUS",
          content: `✅ Cliente confirmou presença: ${appt.service.name} (${formatWhen(appt.startsAt, appt.barbershop.timezone)})`,
        },
      }),
    ]);
    revalidatePath("/painel", "layout");
  }
  redirect(`/confirmar/${token}`);
}

/** Cliente avisa que não vai: cancela e libera o horário para outra pessoa. */
export async function declineAttendance(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  const appt = await load(token);
  if (appt.status === "CONFIRMED" && appt.startsAt > new Date()) {
    await db.$transaction([
      db.appointment.update({ where: { id: appt.id }, data: { status: "CANCELLED", attendanceConfirmedAt: null } }),
      db.interaction.create({
        data: {
          barbershopId: appt.barbershopId,
          customerId: appt.customerId,
          type: "BOOKING_STATUS",
          content: `❌ Cliente avisou que não vai — horário liberado: ${appt.service.name} (${formatWhen(appt.startsAt, appt.barbershop.timezone)})`,
        },
      }),
    ]);
    revalidatePath("/painel", "layout");
  }
  redirect(`/confirmar/${token}`);
}
