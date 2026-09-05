import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UNDP SDG Text Classifier",
  description:
    "Identifiez les Objectifs de Développement Durable (ODD) concernés par un rapport ou un projet. NLP multilingue entraîné sur le corpus officiel du PNUD.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
