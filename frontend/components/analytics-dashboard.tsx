"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import GoalExplorer from "./goal-explorer";
import AiInsights from "./ai-insights";

interface BatchMeta {
  id: number;
  name: string;
  lang: string;
  created_at: string;
  total_documents: number;
}

interface BatchList {
  batches: BatchMeta[];
}

interface GoalResult {
  goal: number;
  probability: number;
  tier: string;
  evidence?: string;
}

interface DocAnalysis {
  goals: GoalResult[];
  summary?: string;
  top_goal?: { goal: number; probability: number; tier: string } | null;
  goals_hit?: number[];
  passages?: Array<{ goal: number; probability: number; quote: string }>;
  key_figures?: Array<{ type: string; value: string; context: string }>;
  paragraph_count?: number;
}

interface DocResult {
  name: string;
  analysis: DocAnalysis;
}

interface AnalyzeResult {
  batch_id?: number;
  _meta?: { id: number; name: string; lang: string; created_at: string; total_documents: number };
  documents: DocResult[];
  coverage: Array<{ goal: number; doc_count: number; max_probability: number; tier: string }>;
  total_documents: number;
  labels: { sdg: string[] };
  model?: string;
}

const TIER_BADGE: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-400",
  medium: "bg-amber-500/15 text-amber-400",
  low: "bg-slate-500/15 text-slate-400",
};

function IconHistogram({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 20V10m6 10V4m6 16v-8m4 8H2" strokeLinecap="round" strokeLinejoin="round" />
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

function IconRefresh({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function AnalyticsDashboard() {
  const [batches, setBatches] = useState<BatchMeta[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);

  const loadBatches = useCallback(async () => {
    try {
      const res = await fetch("/api/batches");
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data: BatchList = await res.json();
      setBatches(data.batches ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger l'historique.");
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const loadBatch = async (id: number) => {
    setLoading(true);
    setError("");
    setSelectedId(id);
    setResult(null);
    try {
      const res = await fetch(`/api/batches/${id}`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger ce lot.");
    } finally {
      setLoading(false);
    }
  };

  const removeBatch = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(id);
    try {
      const res = await fetch(`/api/batches/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`API ${res.status}`);
      if (id === selectedId) {
        setSelectedId(null);
        setResult(null);
      }
      setBatches((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible.");
    } finally {
      setDeleting(null);
    }
  };

  const exportCsv = async () => {
    if (selectedId === null) return;
    try {
      const res = await fetch(`/api/batches/${selectedId}/export`);
      if (!res.ok) throw new Error(`Export API ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `batch_${selectedId}_coverage.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export impossible.");
    }
  };

  const goalsSorted = (() => {
    if (!result) return [];
    return [...result.coverage].sort(
      (a, b) => b.doc_count - a.doc_count || a.goal - b.goal
    );
  })();

  return (
    <div className="space-y-4">
      {/* Historique */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardDescription>Corpus stockés côté serveur</CardDescription>
            <CardTitle>Historique des analyses</CardTitle>
          </div>
          <Button size="icon" variant="outline" onClick={loadBatches} aria-label="Rafraîchir">
            <IconRefresh className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <p className="text-sm text-[#93a0b4] italic">
              Aucun lot analysé pour l&apos;instant — allez sur l&apos;onglet « Lot » pour analyser et stocker un corpus.
            </p>
          ) : (
            <div className="space-y-2">
              {batches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => loadBatch(b.id)}
                  className={[
                    "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                    selectedId === b.id
                      ? "border-[#4f8ef7] bg-[#4f8ef7]/10"
                      : "border-[#1e2a45] bg-[#0a1120] hover:border-[#3d5a8a]",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#eef2fb]">
                      {b.name}
                      <span className="ml-2 text-[11px] text-[#5c6a83]">#{b.id}</span>
                    </p>
                    <p className="text-xs text-[#93a0b4]">
                      {fmtDate(b.created_at)} · {b.total_documents} document{b.total_documents > 1 ? "s" : ""} · {b.lang.toUpperCase()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => removeBatch(b.id, e)}
                      disabled={deleting === b.id}
                      aria-label={`Supprimer ${b.name}`}
                    >
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  </div>
                </button>
              ))}
            </div>
          )}
          {error && (
            <p className="mt-3 text-sm text-[#f87171]">
              <span className="mr-1">!</span>
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {loading && (
        <Card>
          <CardContent className="p-5 text-sm text-[#93a0b4]">
            Chargement du corpus…
          </CardContent>
        </Card>
      )}

      {result && !loading && (
        <>
          {/* En-tête lot sélectionné */}
          <Card className="animate-fade-up">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardDescription>Session sélectionnée</CardDescription>
                <CardTitle className="flex items-center gap-2">
                  <IconHistogram className="h-5 w-5 text-[#4f8ef7]" />
                  {result._meta ? `Lot #${result._meta.id}` : "Corpus"}
                </CardTitle>
              </div>
              <Button size="sm" variant="outline" onClick={exportCsv}>
                Exporter CSV
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-[#5c6a83]">
                {result.total_documents} document{result.total_documents > 1 ? "s" : ""} ·{" "}
                {result.coverage.filter((c) => c.doc_count > 0).length}/17 ODD couverts
              </p>
              <div className="space-y-1.5">
                {goalsSorted.slice(0, 6).map((row) => {
                  const name = result.labels.sdg[row.goal - 1] ?? `SDG ${row.goal}`;
                  const pct = result.total_documents
                    ? Math.round((row.doc_count / result.total_documents) * 100)
                    : 0;
                  return (
                    <div key={row.goal} className="flex items-center gap-3">
                      <img
                        src={`/sdg/sdg-${row.goal}.png`}
                        alt={`SDG ${row.goal}`}
                        className="h-7 w-7 shrink-0 rounded-md object-cover"
                      />
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

          <GoalExplorer documents={result.documents} labels={result.labels.sdg} />
          <AiInsights
            batchId={result.batch_id}
            documents={result.documents}
            coverage={result.coverage}
            totalDocuments={result.total_documents}
            labels={result.labels.sdg}
          />
        </>
      )}
    </div>
  );
}