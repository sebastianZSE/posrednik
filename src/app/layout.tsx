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
  const navStyle = {
    padding: "10px 16px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    textDecoration: "none",
    color: "inherit",
    display: "inline-block",
    background: "#fff",
  } as const;

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
        <Link
          href="/"
          style={navStyle}
        >
          Home
        </Link>

        <Link
          href="/companies"
          style={navStyle}
        >
          Companies
        </Link>

        <Link
          href="/enrichQueue"
          style={navStyle}
        >
          Enrich
        </Link>

        <Link
          href="/reviewQueue"
          style={navStyle}
        >
          Review
        </Link>

        <Link
          href="/importBatches"
          style={navStyle}
        >
          ImportBatches
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
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body
        style={{
          margin: 0,
          background: "#fafafa",
        }}
      >
        <AppNavigation />
        {children}
      </body>
    </html>
  );
}
