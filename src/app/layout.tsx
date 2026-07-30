import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "TakoSensei — Teach it to learn it.",
  description:
    "Teach a topic to Tako, your curious AI student. As you explain, Tako asks thoughtful questions that reveal gaps in your understanding.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const themeScript = `
    try {
      var saved = localStorage.getItem('tako-theme');
      var theme = saved === 'light' || saved === 'dark'
        ? saved
        : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.dataset.theme = theme;
    } catch (_) {}
  `;

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-[#FAFAF9] text-neutral-900 antialiased">
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
