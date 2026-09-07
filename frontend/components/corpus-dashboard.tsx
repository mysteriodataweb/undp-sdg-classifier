"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

interface GoalResult {
  goal: number;
  probability: number;
  tier: string;
  evidence?: string;
}

interface DocAnalysis {
  goals: GoalResult[];
  summary?: string;
  counts?: Record<string, number>;
  paragraph_count?: number;
  top_goal?: { goal: number; probability: number; tier: string } | null;
  goals_hit?: number[];
  passages?: Array<{ goal: number; probability: number; quote: string }>;
  key_figures?: Array<{ type: string; value: string; context: string }>;
}

interface DocResult {
  name: string;
  analysis: DocAnalysis;
}

interface CoverageRow {
  goal: number;
  doc_count: number;
  max_probability: number;
  tier: string;
}

interface AnalyzeResult {
  documents: DocResult[];
  coverage: CoverageRow[];
  total_documents: number;
  labels: { sdg: string[] };
  model?: string;
}

const ACCEPTED = [".pdf", ".txt", ".md", ".docx", ".rtf"];

const TIER_BADGE: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-400",
  medium: "bg-amber-500/15 text-amber-400",
  low: "bg-slate-500/15 text-slate-400",
};

function IconUpload({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 16V4m0 0 4 4m-4-4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDocument({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
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

function IconDownload({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 4v12m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function CorpusDashboard() {
  const [files, setFiles] = useState<File[]>([]);
  const [lang, setLang] = useState("en");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name));
      const added = Array.from(list).filter((f) => !seen.has(f.name));
      return [...prev, ...added].slice(0, 10);
    });
    setResult(null);
  };

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
    setResult(null);
  };

  const classify = async () => {
    if (files.length === 0) return;
    setError("");
    setLoading(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      fd.append("lang", lang);
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(res.status === 503 ? "Modèle non disponible — backend en cours de démarrage." : `API ${res.status}${t ? ` — ${t.slice(0, 120)}` : ""}`);
      }
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible au service.");
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = async () => {
    if (files.length === 0 || exporting) return;
    setExporting(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/analyze/export", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Export API ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sdg_coverage.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export impossible.");
    } finally {
      setExporting(false);
    }
  };

  const totalParagraphs = useMemo(
    () => result?.documents.reduce((acc, d) => acc + (d.analysis.paragraph_count ?? 0), 0) ?? 0,
    [result]
  );

  const visibleGoals = (analysis: DocAnalysis) => {
    const ranked = [...analysis.goals].sort((a, b) => b.probability - a.probability);
    const strong = ranked.filter((g) => g.probability >= 0.2);
    return (strong.length >= 2 ? strong.slice(0, 5) : ranked.slice(0, 3));
  };

  const coverage = useMemo(() => {
    if (!result) return [];
    return [...result.coverage].sort(
      (a, b) => b.doc_count - a.doc_count || a.goal - b.goal
    );
  }, [result]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-5">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPTED.join(",")}
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
            className={[
              "flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors",
              drag
                ? "border-[#4f8ef7] bg-[#4f8ef7]/5"
                : "border-[#2a3a5f] hover:border-[#3d5a8a] hover:bg-[#0a1120]",
            ].join(" ")}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1a2540] text-[#93a0b4]">
              <IconUpload className="h-5 w-5" />
            </div>
            <div className="text-sm">
              <span className="font-medium text-white">
                Glissez un lot de documents ou cliquez
              </span>
              <p className="mt-1 text-xs text-[#5c6a83]">
                PDF · TXT · DOCX · MD — jusqu&apos;à 10 documents, 8 Mo chacun
              </p>
            </div>
          </button>

          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((f) => (
                <div
                  key={f.name}
                  className="flex items-center justify-between rounded-lg border border-[#1e2a45] bg-[#0a1120] px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2 text-sm text-[#eef2fb]">
                    <IconDocument className="h-4 w-4 shrink-0 text-[#4f8ef7]" />
                    <span className="truncate">{f.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(f.name)}
                    aria-label={`Retirer ${f.name}`}
                  >
                    <IconTrash className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="h-10 rounded-lg border border-[#2a3a5f] bg-[#0a1120] px-3 text-sm text-[#eef2fb] focus:outline-none focus:ring-1 focus:ring-[#4f8ef7]/40"
            >
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="es">Español</option>
            </select>
            <Button onClick={classify} disabled={loading || files.length === 0}>
              {loading ? "Analyse en cours…" : "Analyser le lot"}
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

      {result && (
        <>
          {/* Vue d'ensemble : couverture du lot */}
          <Card className="animate-fade-up">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardDescription>Couverture du lot par objectif</CardDescription>
                <CardTitle>Vue d&apos;ensemble</CardTitle>
              </div>
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={exporting}>
                <IconDownload className="h-4 w-4" />
                {exporting ? "Export…" : "Exporter CSV"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-[#5c6a83]">
                {result.total_documents} document{result.total_documents > 1 ? "s" : ""} analysé
                {result.total_documents > 1 ? "s" : ""} · {totalParagraphs} paragraphes instruits
              </p>
              <div className="space-y-1.5">
                {coverage.map((row) => {
                  const name = result.labels.sdg[row.goal - 1] ?? `SDG ${row.goal}`;
                  const pct = result.total_documents
                    ? Math.round((row.doc_count / result.total_documents) * 100)
                    : 0;
                  return (
                    <div key={row.goal} className="flex items-center gap-3">
                      <span
                        className={`sdg-${row.goal} flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white`}
                      >
                        {row.goal}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm text-[#eef2fb]">{name}</span>
                          <span className="shrink-0 text-xs tabular-nums text-[#93a0b4]">
                            {row.doc_count}/{result.total_documents} · {pct}%
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#16203a]">
                          <div
                            className={`sdg-${row.goal} h-full rounded-full transition-all duration-700 opacity-80`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* La preuve : extraits par document */}
          <Card className="animate-fade-up">
            <CardHeader>
              <CardDescription>La preuve — extraits textuels qui justifient chaque étiquette</CardDescription>
              <CardTitle>Pourquoi ce score sur chaque document&nbsp;?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {result.documents.map((doc) => {
                const goals = visibleGoals(doc.analysis);
                return (
                  <div key={doc.name} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e2a45] pb-2">
                      <span className="flex items-center gap-2 font-medium text-white">
                        <IconDocument className="h-4 w-4 text-[#4f8ef7]" />
                        <span className="truncate">{doc.name}</span>
                      </span>
                      <span className="text-xs text-[#5c6a83]">
                        {doc.analysis.paragraph_count ?? "-"} paragraphes
                      </span>
                    </div>
                    {doc.analysis.summary && (
                      <p className="rounded-lg border border-[#1e2a45] bg-[#0a1120] px-3 py-2 text-[13px] leading-relaxed text-[#c8d2e5]">
                        <span className="mr-1.5 font-semibold text-[#4f8ef7]">Résumé :</span>
                        {doc.analysis.summary}
                      </p>
                    )}
                    {goals.length === 0 && (
                      <p className="text-sm text-[#93a0b4] italic">
                        Aucun objectif détecté avec un score significatif.
                      </p>
                    )}
                    {goals.map((g) => {
                      const name = result.labels.sdg[g.goal - 1] ?? `SDG ${g.goal}`;
                      const pct = Math.round(g.probability * 100);
                      return (
                        <div key={g.goal} className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`sdg-${g.goal} flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white`}
                            >
                              {g.goal}
                            </span>
                            <span className="text-sm text-[#eef2fb]">{name}</span>
                            <span className="text-xs tabular-nums text-[#93a0b4]">{pct}%</span>
                            <span
                              className={[
                                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                TIER_BADGE[g.tier] ?? TIER_BADGE.low,
                              ].join(" ")}
                            >
                              {g.tier}
                            </span>
                          </div>
                          {g.evidence && (
                            <p className="ml-8 border-l-2 border-[#2a3a5f] pl-3 text-[13px] italic leading-relaxed text-[#93a0b4]">
                              « {g.evidence} »
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {doc.analysis.key_figures && doc.analysis.key_figures.length > 0 && (
                      <div className="ml-1 space-y-1">
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[#5c6a83]">
                          Chiffres clés
                        </p>
                        {doc.analysis.key_figures.map((kf, i) => (
                          <p key={i} className="border-l-2 border-[#fd9d24]/40 pl-3 text-[13px] leading-relaxed text-[#c8d2e5]">
                            <span className="font-semibold text-[#fd9d24]">{kf.value}</span>
                            <span className="text-[#93a0b4]"> — {kf.context}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {result.model && (
                <p className="pt-1 text-[11px] italic text-[#5c6a83]">{result.model}</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}