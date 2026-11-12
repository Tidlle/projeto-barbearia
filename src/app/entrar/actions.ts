"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function login(_prev: { error: string }, formData: FormData): Promise<{ error: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = await db.user.findUnique({ where: { email } });
  // compara mesmo sem usuário para não revelar quais e-mails existem pelo tempo de resposta
  const okPassword = await bcrypt.compare(password, user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
  if (!user || !okPassword) return { error: "E-mail ou senha incorretos." };
  await createSession(user.id);
  redirect("/painel");
}

export async function logout() {
  await destroySession();
  redirect("/entrar");
}
