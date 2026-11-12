import "server-only";
import { cache, type CSSProperties } from "react";
import { db } from "./db";
import { WEEKDAYS, dateKeyInTz, minutesOf, timeInTz, weekdayOf } from "./time";

/** Barbearia dona deste site (o banco continua preparado para várias). */
export const SHOP_SLUG = process.env.SHOP_SLUG ?? "zer0nze";

export const getShop = cache(async () => {
  return db.barbershop.findUnique({
    where: { slug: SHOP_SLUG },
    include: { businessHours: { orderBy: [{ weekday: "asc" }, { openTime: "asc" }] } },
  });
});

export function brandStyle(color: string) {
  // cor de texto sobre a cor da marca: escura para cores claras, clara para escuras
  const hex = color.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return { "--brand": color, "--brand-ink": luminance > 0.55 ? "#1e2015" : "#ffffff" } as CSSProperties;
}

/** "Aberto agora · até 20:00" / "Fechado · abre terça às 10:00" */
export function openStatus(hours: { weekday: number; openTime: string; closeTime: string }[], tz: string, now = new Date()) {
  const today = weekdayOf(dateKeyInTz(now, tz));
  const nowM = minutesOf(timeInTz(now, tz));
  const current = hours.find((h) => h.weekday === today && minutesOf(h.openTime) <= nowM && nowM < minutesOf(h.closeTime));
  if (current) return { open: true, label: `Aberto agora · até ${current.closeTime}` };
  for (let i = 0; i < 7; i++) {
    const wd = (today + i) % 7;
    const next = hours
      .filter((h) => h.weekday === wd && (i > 0 || minutesOf(h.openTime) > nowM))
      .sort((a, b) => a.openTime.localeCompare(b.openTime))[0];
    if (next) {
      const day = i === 0 ? "hoje" : i === 1 ? "amanhã" : WEEKDAYS[wd].toLowerCase();
      return { open: false, label: `Fechado agora · abre ${day} às ${next.openTime}` };
    }
  }
  return { open: false, label: "Fechado" };
}
