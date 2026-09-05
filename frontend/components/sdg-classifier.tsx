"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

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

const ACCEPTED = [".pdf", ".txt", ".md", ".docx", ".rtf"];

function IconDocument({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconUpload({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 16V4m0 0 4 4m-4-4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSparkles({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4M18.4 5.6 17 7m-10 10-1.4 1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconTrash({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SdgClassifier() {
  const [mode, setMode] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [lang, setLang] = useState("en");
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const runFile = () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("mode", "file");
    fd.append("file", file);
    fd.append("lang", lang);
    classify(fd);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
      setFileName(f.name);
      // if text-like, prefill the textarea
      if (/\.(txt|md)$/i.test(f.name)) {
        const r = new FileReader();
        r.onload = () => setText(String(r.result ?? "").slice(0, 8000));
        r.readAsText(f);
      }
    }
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
          {(["text", "file"] as const).map((m) => (
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
              {m === "text" ? "Texte" : "Fichier"}
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="space-y-4 p-5">
            {mode === "text" ? (
              <>
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
              </>
            ) : (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPTED.join(",")}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setFile(f);
                      setFileName(f.name);
                      if (/\.(txt|md)$/i.test(f.name)) {
                        const r = new FileReader();
                        r.onload = () => setText(String(r.result ?? ""));
                        r.readAsText(f);
                      }
                    }
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={onDrop}
                  className={[
                    "flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors",
                    drag
                      ? "border-[#4f8ef7] bg-[#4f8ef7]/5"
                      : "border-[#2a3a5f] hover:border-[#3d5a8a] hover:bg-[#0a1120]",
                  ].join(" ")}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1a2540] text-[#93a0b4]">
                    {file ? <IconDocument className="h-5 w-5" /> : <IconUpload className="h-5 w-5" />}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium text-white">
                      {file ? fileName : "Glissez un fichier ou cliquez"}
                    </span>
                    <p className="mt-1 text-xs text-[#5c6a83]">
                      PDF · TXT · DOCX · MD — maximum 8 Mo
                    </p>
                  </div>
                </button>

                {file && (
                  <div className="flex items-center justify-between rounded-lg border border-[#1e2a45] bg-[#0a1120] px-3 py-2">
                    <div className="flex items-center gap-2 text-sm text-[#eef2fb]">
                      <IconDocument className="h-4 w-4 text-[#4f8ef7]" />
                      {fileName}
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={lang}
                        onChange={(e) => setLang(e.target.value)}
                        className="h-9 rounded-lg border border-[#2a3a5f] bg-[#0a1120] px-2 text-sm text-[#eef2fb] focus:outline-none"
                      >
                        <option value="en">EN</option>
                        <option value="fr">FR</option>
                        <option value="es">ES</option>
                      </select>
                      <Button size="sm" onClick={runFile} disabled={loading}>
                        {loading ? "Analyse…" : "Classer"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setFile(null); setFileName(""); }}
                        aria-label="Retirer le fichier"
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {error && (
              <p className="flex items-center gap-2 text-sm text-[#f87171]">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f87171]/15 text-xs">!</span>
                {error}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {preds.length > 0 && (
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
