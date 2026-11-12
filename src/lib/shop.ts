import "server-only";
import { cache, type CSSProperties } from "react";
import { db } from "./db";

export const RESERVED_SLUGS = new Set(["painel", "entrar", "api", "pagamento", "sair", "_next", "favicon.ico"]);

export const getShopBySlug = cache(async (slug: string) => {
  if (RESERVED_SLUGS.has(slug)) return null;
  return db.barbershop.findUnique({
    where: { slug },
    include: {
      businessHours: { orderBy: [{ weekday: "asc" }, { openTime: "asc" }] },
    },
  });
});

export function brandStyle(color: string) {
  // cor de texto sobre a cor da marca: escura para cores claras, clara para escuras
  const hex = color.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return { "--brand": color, "--brand-ink": luminance > 0.55 ? "#171204" : "#ffffff" } as CSSProperties;
}
