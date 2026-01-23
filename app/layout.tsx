import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "./globals.css";
import { MainLayout } from "@/components/layout/main-layout";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const interTight = Inter_Tight({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vitalitty AI",
  description: "Backoffice Dietas Vitalitty AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} ${interTight.variable} antialiased`}>
        <MainLayout>{children}</MainLayout>
      </body>
    </html>
  );
}
