import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Baza firm elektrycznych",
  description: "Pipeline do budowy i przeglądu bazy firm elektrycznych",
};

function AppNavigation() {
  return (
    <header
      style={{
        borderBottom: "1px solid #e5e5e5",
        padding: "16px 24px",
        position: "sticky",
        top: 0,
        background: "#fff",
        zIndex: 10,
      }}
    >
      <nav
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 700, marginRight: "12px" }}>
          Baza firm elektrycznych
        </span>

        <Link
          href="/"
          className="btn"
        >
          Start
        </Link>

        <Link
          href="/companies"
          className="btn"
        >
          Firmy
        </Link>

        <Link
          href="/enrichQueue"
          className="btn"
        >
          Wzbogacanie
        </Link>

        <Link
          href="/reviewQueue"
          className="btn"
        >
          Weryfikacja
        </Link>

        <Link
          href="/importBatches"
          className="btn"
        >
          Importy
        </Link>
      </nav>
    </header>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pl"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <AppNavigation />
        {children}
      </body>
    </html>
  );
}
