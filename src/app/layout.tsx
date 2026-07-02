import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AL's brainfarts — interní analyzátor",
  description: "Analyzátor tržní ceny nemovitostí pro interní potřeby.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" className={`${mono.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-black text-white font-mono antialiased">
        <header className="border-b border-[#39ff14]/20 px-6 py-3 flex items-center justify-between">
          <span className="text-xs text-[#39ff14] tracking-widest uppercase font-bold">
            AL&apos;s brainfarts
          </span>
          <span className="text-[10px] text-[#39ff14]/40">
            RealAdvisor © internal use only
          </span>
        </header>

        <main className="flex-1 flex flex-col">
          {children}
        </main>

        <footer className="border-t border-[#39ff14]/15 px-6 py-2 text-[10px] text-[#39ff14]/35">
          Data jsou orientační. Model P&nbsp;~&nbsp;N(E[P],&nbsp;Var(P)) využívá simulovaný rozptyl dle Reas.cz.
        </footer>
      </body>
    </html>
  );
}
