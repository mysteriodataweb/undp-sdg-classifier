import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UNDP SDG Classifier",
  description: "Classify development text/reports against the 17 Sustainable Development Goals.",
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
