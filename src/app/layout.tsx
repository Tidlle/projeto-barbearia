import type { Metadata } from "next";
import { Geist, Geist_Mono, Rye, Zilla_Slab } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Letreiro vintage e serifa "slab", na linha da nova identidade da Zer0nze Co.
const display = Rye({ variable: "--font-display", subsets: ["latin"], weight: "400" });
const slab = Zilla_Slab({ variable: "--font-slab", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: { default: "Barbearia Zer0nze Co. — Mooca, São Paulo", template: "%s · Zer0nze Co." },
  description: "Barbearia clássica com atitude urbana no Alto da Mooca, desde 2015. Agende seu horário online.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} ${slab.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
