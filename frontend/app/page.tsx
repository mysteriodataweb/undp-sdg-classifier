import type { Metadata } from "next";
import "./globals.css";
import SdgClassifier from "@/components/sdg-classifier";

export const metadata: Metadata = {
  title: "UNDP SDG Text Classifier",
  description:
    "Identifiez les Objectifs de Développement Durable (ODD) concernés par un rapport ou un projet. NLP multilingue entraîné sur le corpus officiel du PNUD.",
};

export default function Home() {
  return <SdgClassifier />;
}
