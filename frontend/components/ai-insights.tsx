"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

const SDG_COLORS = [
  "#E5243B", "#DDA63A", "#4C9F38", "#C5192D", "#FF3A21",
  "#26BDE2", "#FCC30B", "#A21942", "#FD6925", "#DD1367",
  "#FD9D24", "#BF8B2E", "#3F7E44", "#0A97D9", "#56C02B",
  "#00689D", "#19486A",
];

interface GoalRow {
  goal: number;
  doc_count: number;
  max_probability: number;
  tier: string;
}

interface DistributionRow {
  goal: number;
  doc_count: number;
  share: number;
  avg_intensity: number;
  mentions: number;
}

interface InsightDoc {
  name: string;
  top_goal?: { goal: number; probability: number; tier: string } | null;
  summary: string;
  key_figures: Array<{ type: string; value: string; context: string }>;
  top_passages: Array<{ goal: number; probability: number; quote: string }>;
  paragraph_count: number;
}

interface CoPair {
  a: number;
  b: number;
  count: number;
  docs: string[];
}

interface InsightsReport {
  total_documents: number;
  unclassified_documents: number;
  unclassified_rate: number;
  distribution: DistributionRow[];
  documents: InsightDoc[];
  coverage: GoalRow[];
}

interface CoocResponse {
  matrix: number[][];
  pairs: CoPair[];
}

function fmtPct(x: number) {
  return `${Math.round(x * 100)}%`;
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-[#2a3a5f] bg-[#0d1424] px-3 py-2 text-xs text-[#eef2fb] shadow-xl">
      <p className="font-medium text-white">
        {label !== undefined && label !== "" ? `${label} (SDG ${payload[0]?.payload?.goal ?? ""})` : ""}
      </p>
      <p className="text-[#93a0b4]">
        {payload[0]?.name}: <span className="tabular-nums text-white">{payload[0]?.value}</span>
      </p>
    </div>
  );
}

export default function AiInsights({
  batchId,
  documents,
  coverage,
  totalDocuments,
  labels,
}: {
  batchId?: number;
  documents: any[];
  coverage: GoalRow[];
  totalDocuments: number;
  labels: string[];
}) {
  const [report, setReport] = useState<InsightsReport | null>(null);
  const [cooc, setCooc] = useState<CoocResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (batchId === undefined || batchId === null) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setReport(null);
    setCooc(null);
    Promise.all([
      fetch(`/api/batches/${batchId}/insights`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`API ${r.status}`)))),
      fetch(`/api/batches/${batchId}/cooccurrence`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`API ${r.status}`)))),
    ])
      .then(([rep, co]: [InsightsReport, CoocResponse]) => {
        if (cancelled) return;
        setReport(rep);
        setCooc(co);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Impossible de charger les insights.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const goalName = (g: number) => labels[g - 1] ?? `SDG ${g}`;

  const coocMax = (() => {
    if (!cooc) return 1;
    let m = 0;
    for (const row of cooc.matrix) for (const v of row) if (v > m) m = v;
    return m || 1;
  })();

  const topPairs = cooc?.pairs.slice(0, 8) ?? [];

  return (
    <div className="space-y-4">
      <Card className="animate-fade-up">
        <CardHeader>
          <CardDescription>Analyse extractive sans LLM — calculée à partir des scores du modèle</CardDescription>
          <CardTitle>Mode IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading && <p className="text-sm text-[#93a0b4]">Calcul des insights…</p>}
          {error && <p className="text-sm text-[#f87171]">! {error}</p>}
          {!report && !loading && !error && (
            <p className="text-sm text-[#93a0b4] italic">
              Sélectionnez un lot dans l&apos;historique pour afficher l&apos;analyse.
            </p>
          )}

          {report && (
            <>
              {/* Chiffres clés globaux */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-[#1e2a45] bg-[#0a1120] p-3">
                  <p className="text-[11px] uppercase tracking-wide text-[#5c6a83]">Documents</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-white">{report.total_documents}</p>
                </div>
                <div className="rounded-lg border border-[#1e2a45] bg-[#0a1120] p-3">
                  <p className="text-[11px] uppercase tracking-wide text-[#5c6a83]">Non classés</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-white">
                    {report.unclassified_documents}
                    <span className="ml-1 text-xs font-normal text-[#93a0b4]">
                      ({fmtPct(report.unclassified_rate)})
                    </span>
                  </p>
                </div>
                <div className="rounded-lg border border-[#1e2a45] bg-[#0a1120] p-3">
                  <p className="text-[11px] uppercase tracking-wide text-[#5c6a83]">ODD couverts</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-white">
                    {coverage.filter((c) => c.doc_count > 0).length}
                    <span className="ml-1 text-xs font-normal text-[#93a0b4]">/17</span>
                  </p>
                </div>
                <div className="rounded-lg border border-[#1e2a45] bg-[#0a1120] p-3">
                  <p className="text-[11px] uppercase tracking-wide text-[#5c6a83]">Objectif dominant</p>
                  <p className="mt-1 truncate text-lg font-semibold text-white">
                    {(() => {
                      const top = [...report.distribution].sort((a, b) => b.doc_count - a.doc_count)[0];
                      return top && top.doc_count > 0 ? `SDG ${top.goal}` : "—";
                    })()}
                  </p>
                </div>
              </div>

              {/* Couverture : documents par ODD */}
              <div>
                <p className="mb-2 text-sm font-medium text-[#eef2fb]">Couverture — documents touchant chaque ODD</p>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.coverage} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2a45" vertical={false} />
                      <XAxis
                        dataKey="goal"
                        tick={{ fill: "#93a0b4", fontSize: 10 }}
                        tickLine={false}
                        axisLine={{ stroke: "#1e2a45" }}
                        interval={0}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: "#93a0b4", fontSize: 10 }}
                        tickLine={false}
                        axisLine={{ stroke: "#1e2a45" }}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "#16203a" }} />
                      <Bar dataKey="doc_count" name="documents" radius={[4, 4, 0, 0]}>
                        {report.coverage.map((row) => (
                          <Cell key={row.goal} fill={SDG_COLORS[row.goal - 1]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Intensité moyenne par ODD */}
              <div>
                <p className="mb-2 text-sm font-medium text-[#eef2fb]">
                  Intensité moyenne de rattachement par ODD
                </p>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.distribution} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2a45" vertical={false} />
                      <XAxis
                        dataKey="goal"
                        tick={{ fill: "#93a0b4", fontSize: 10 }}
                        tickLine={false}
                        axisLine={{ stroke: "#1e2a45" }}
                        interval={0}
                      />
                      <YAxis
                        tickFormatter={(v: number) => Math.round(v * 100) + "%"}
                        tick={{ fill: "#93a0b4", fontSize: 10 }}
                        tickLine={false}
                        axisLine={{ stroke: "#1e2a45" }}
                        domain={[0, 1]}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "#16203a" }} />
                      <Bar dataKey="avg_intensity" name="intensité" radius={[4, 4, 0, 0]}>
                        {report.distribution.map((row) => (
                          <Cell key={row.goal} fill={SDG_COLORS[row.goal - 1]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Co-occurrence */}
              {cooc && (
                <div>
                  <p className="mb-2 text-sm font-medium text-[#eef2fb]">
                    Co-occurrence — paires d&apos;ODD dans un même document
                  </p>
                  <div className="overflow-x-auto">
                    <div className="grid" style={{ gridTemplateColumns: `repeat(17, minmax(0, 1fr))` }}>
                      {cooc.matrix.map((row, i) =>
                        row.map((v, j) => {
                          const alpha = v === 0 ? 0.06 : 0.25 + (v / coocMax) * 0.75;
                          return (
                            <div
                              key={`${i}-${j}`}
                              title={v > 0 ? `SDG ${i + 1} × SDG ${j + 1} : ${v} document(s)` : undefined}
                              className="aspect-square"
                              style={{
                                backgroundColor: v > 0 ? SDG_COLORS[i] : "#16304a",
                                opacity: v > 0 ? alpha : 0.8,
                                border: i === j ? "1px solid #3d5a8a" : "1px solid #0d1424",
                              }}
                            />
                          );
                        })
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#5c6a83]">
                    <span>Lignes/colonnes : ODD 1→17</span>
                    <span>Diagonale = un seul ODD dans le document</span>
                  </div>

                  {topPairs.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5c6a83]">
                        Associations les plus fréquentes
                      </p>
                      {topPairs.map((p) => (
                        <div
                          key={`${p.a}-${p.b}`}
                          className="rounded-lg border border-[#1e2a45] bg-[#0a1120] px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`sdg-${p.a} flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white`}
                            >
                              {p.a}
                            </span>
                            <span className="text-[#93a0b4]">+</span>
                            <span
                              className={`sdg-${p.b} flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white`}
                            >
                              {p.b}
                            </span>
                            <span className="truncate text-sm text-[#eef2fb]">
                              {labels[p.a - 1] ?? ""} <span className="text-[#5c6a83]">×</span>{" "}
                              {labels[p.b - 1] ?? ""}
                            </span>
                            <span className="ml-auto shrink-0 text-xs tabular-nums text-[#93a0b4]">
                              {p.count} doc{p.count > 1 ? "s" : ""}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-[11px] italic text-[#5c6a83]">
                            {p.docs.join(", ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Fiches documents du Mode IA */}
      {report && report.documents.length > 0 && (
        <Card className="animate-fade-up">
          <CardHeader>
            <CardDescription>Résumé, chiffres clés et passages utiles par document</CardDescription>
            <CardTitle>Lecture assistée</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.documents.map((d) => {
              const tg = d.top_goal;
              return (
                <div key={d.name} className="rounded-xl border border-[#1e2a45] bg-[#0a1120] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e2a45] pb-2">
                    <span className="truncate font-medium text-white">{d.name}</span>
                    <span className="text-[11px] text-[#5c6a83]">{d.paragraph_count} paragraphes</span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {tg ? (
                      <>
                        <img
                          src={`/sdg/sdg-${tg.goal}.png`}
                          alt={`SDG ${tg.goal}`}
                          className="h-7 w-7 rounded-md object-cover"
                        />
                        <span className="text-sm font-semibold text-white">
                          {goalName(tg.goal)}
                        </span>
                        <span className="text-xs tabular-nums text-[#93a0b4]">
                          {Math.round(tg.probability * 100)}% — objectif principal
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-[#93a0b4] italic">
                        Non classé (aucun ODD ≥ 20 %)
                      </span>
                    )}
                  </div>

                  {d.summary && (
                    <p className="mt-3 rounded-lg border border-[#1e2a45] bg-[#0d1424] px-3 py-2 text-[13px] leading-relaxed text-[#c8d2e5]">
                      <span className="mr-1.5 font-semibold text-[#4f8ef7]">Résumé :</span>
                      {d.summary}
                    </p>
                  )}

                  {d.key_figures.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5c6a83]">
                        Chiffres clés
                      </p>
                      {d.key_figures.map((kf, i) => (
                        <p
                          key={i}
                          className="border-l-2 border-[#fd9d24]/40 pl-3 text-[13px] leading-relaxed text-[#c8d2e5]"
                        >
                          <span className="font-semibold text-[#fd9d24]">{kf.value}</span>
                          <span className="text-[#93a0b4]"> — {kf.context}</span>
                        </p>
                      ))}
                    </div>
                  )}

                  {d.top_passages.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5c6a83]">
                        Passages utiles
                      </p>
                      {d.top_passages.map((p, i) => {
                        const pct = Math.round(p.probability * 100);
                        return (
                          <div key={i} className="space-y-0.5">
                            <p className="border-l-2 border-[#4f8ef7]/50 pl-3 text-[13px] italic leading-relaxed text-[#93a0b4]">
                              « {p.quote} »
                            </p>
                            <p className="pl-3 text-[11px] text-[#5c6a83]">
                              SDG {p.goal} — {pct}%
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}