"use client";

import { useCallback, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import CorpusDashboard from "./corpus-dashboard";
import AnalyticsDashboard from "./analytics-dashboard";

interface Prediction {
  goal: number;
  probability: number;
  tier: string;
}

interface ApiResponse {
  predictions: Prediction[];
  labels: { sdg: string[] };
  model: string;
}

const EXAMPLES: Record<string, string> = {
  en: "A national program to install solar panels in rural schools, train local teachers, and provide clean drinking water to remote communities.",
  fr: "Un programme national d'installation de panneaux solaires dans les écoles rurales, la formation d'enseignants locaux et l'accès à l'eau potable pour les communautés isolées.",
  es: "Un programa nacional para instalar paneles solares en escuelas rurales, capacitar a docentes locales y garantizar agua potable para comunidades aisladas.",
};

function IconSparkles({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4M18.4 5.6 17 7m-10 10-1.4 1.4" strokeLinecap="round" />
    </svg>
  );
}

export default function SdgClassifier() {
  const [mode, setMode] = useState<"text" | "lot" | "dashboard">("text");
  const [text, setText] = useState("");
  const [lang, setLang] = useState("en");
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function buildSections(
    all: Prediction[],
    _names: string[]
  ): Array<{ title: string; badge: string; items: Prediction[] }> {
    const high = all.filter((p) => p.tier === "high");
    const medium = all.filter((p) => p.tier === "medium");
    const low = all.filter((p) => p.tier === "low");
    const sections: Array<{ title: string; badge: string; items: Prediction[] }> = [
      { title: "Fortement lié", badge: "bg-emerald-500/15 text-emerald-400", items: high },
      { title: "Modérément lié", badge: "bg-amber-500/15 text-amber-400", items: medium },
      { title: "Faiblement lié", badge: "bg-slate-500/15 text-slate-400", items: low },
    ];
    return sections;
  }

  const classify = useCallback(
    async (payload: FormData) => {
      setError("");
      setLoading(true);
      try {
        const res = await fetch("/api/classify", { method: "POST", body: payload });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(
            res.status === 503
              ? "Modèle non disponible — backend en cours de démarrage."
              : `API ${res.status}${t ? ` — ${t.slice(0, 120)}` : ""}`
          );
        }
        const data: ApiResponse = await res.json();
        setLabels(data.labels.sdg);
        setPreds(data.predictions);
        setModel(data.model);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Connexion impossible au service.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const runText = () => {
    const fd = new FormData();
    fd.append("mode", "text");
    fd.append("text", text);
    fd.append("lang", lang);
    classify(fd);
  };

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      {/* Header */}
      <header className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4f8ef7] to-[#7c5cf0] text-white shadow-lg shadow-[#4f8ef7]/25">
          <IconSparkles className="h-6 w-6" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          SDG Text Classifier
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#93a0b4]">
          Identifier automatiquement les <span className="text-white">Objectifs de
          Développement Durable</span> (ODD) concernés par un rapport, une
          description de projet ou une note. Multilingue — entraîné sur le
          corpus officiel du <span className="text-white">PNUD</span>.
        </p>
      </header>

      <div className="mt-8 space-y-4">
        {/* Mode toggle */}
        <div className="flex w-full max-w-xs gap-1 rounded-xl border border-[#1e2a45] bg-[#0d1424] p-1">
          {(["text", "lot", "dashboard"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); }}
              className={[
                "flex-1 rounded-lg py-2 text-sm font-medium transition-colors",
                mode === m
                  ? "bg-[#1a2540] text-white"
                  : "text-[#93a0b4] hover:text-white",
              ].join(" ")}
            >
              {m === "text" ? "Texte" : m === "lot" ? "Lot" : "Dashboard"}
            </button>
          ))}
        </div>

        {mode === "lot" ? (
          <CorpusDashboard />
        ) : mode === "dashboard" ? (
          <AnalyticsDashboard />
        ) : (
        <Card>
          <CardContent className="space-y-4 p-5">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Collez ici un extrait de rapport, une description de projet, un appel à contribution…"
              className="min-h-[150px] w-full rounded-xl border border-[#16203a] bg-[#0a1120] p-4 text-sm text-[#eef2fb] placeholder:text-[#4a5770] focus:border-[#4f8ef7] focus:outline-none focus:ring-1 focus:ring-[#4f8ef7]/40"
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setText(EXAMPLES[lang])}>
                Exemple
              </Button>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="h-10 rounded-lg border border-[#2a3a5f] bg-[#0a1120] px-3 text-sm text-[#eef2fb] focus:outline-none focus:ring-1 focus:ring-[#4f8ef7]/40"
              >
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="es">Español</option>
              </select>
              <Button disabled={loading || !text.trim()} onClick={runText}>
                {loading ? "Analyse…" : "Classer"}
              </Button>
            </div>

            {error && (
              <p className="flex items-center gap-2 text-sm text-[#f87171]">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f87171]/15 text-xs">!</span>
                {error}
              </p>
            )}
          </CardContent>
        </Card>
        )}

        {/* Results */}
        {mode === "text" && preds.length > 0 && (
          <Card className="animate-fade-up">
            <CardHeader>
              <CardDescription>Alerté·e sur les 17 ODD, classés par pertinence</CardDescription>
              <CardTitle>Résultats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {buildSections(preds, labels.map((n, i) => n))
                .filter((s) => s.items.length > 0)
                .map((section) => (
                  <div key={section.title}>
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          section.badge,
                        ].join(" ")}
                      >
                        {section.title}
                      </span>
                    </div>
                    <div className="space-y-2.5">
                      {section.items.map((p) => {
                        const name = labels[p.goal - 1] ?? `SDG ${p.goal}`;
                        const pct = Math.round(p.probability * 100);
                        return (
                          <div key={p.goal} className="flex items-center gap-3">
                            <span
                              className={`sdg-${p.goal} flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white`}
                            >
                              {p.goal}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="truncate text-sm text-[#eef2fb]">{name}</span>
                                <span className="ml-3 text-xs tabular-nums text-[#93a0b4]">{pct}%</span>
                              </div>
                              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#16203a]">
                                <div
                                  className={`sdg-${p.goal} h-full rounded-full transition-all duration-700 opacity-80`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              <p className="pt-1 text-[11px] italic text-[#5c6a83]">{model}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-10 flex flex-col items-center gap-1 border-t border-[#1e2a45] pt-6 text-center">
        <p className="text-xs text-[#5c6a83]">
          Basé sur le corpus officiel du PNUD · NLP multilingue (FR / EN / ES)
        </p>
        <p className="text-xs text-[#3a4a66]">
          Projet personnel — non affilié au PNUD
        </p>
      </footer>
    </div>
  );
}
