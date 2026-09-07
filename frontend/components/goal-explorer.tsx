"use client";

import { useMemo, useState } from "react";
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
  top_goal?: { goal: number; probability: number; tier: string } | null;
}

interface DocResult {
  name: string;
  analysis: DocAnalysis;
}

const TIER_BADGE: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-400",
  medium: "bg-amber-500/15 text-amber-400",
  low: "bg-slate-500/15 text-slate-400",
};

export default function GoalExplorer({
  documents,
  labels,
}: {
  documents: DocResult[];
  labels: string[];
}) {
  const [selectedGoal, setSelectedGoal] = useState<number | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);

  // documents dont ce goal est l'objectif principal
  const byGoal = useMemo(() => {
    const map: Record<number, DocResult[]> = {};
    for (const doc of documents) {
      const top = doc.analysis.top_goal?.goal;
      if (top) {
        (map[top] ??= []).push(doc);
      }
    }
    return map;
  }, [documents]);

  const docsForGoal = selectedGoal ? (byGoal[selectedGoal] ?? []) : [];

  const docDetail = selectedDoc
    ? documents.find((d) => d.name === selectedDoc) ?? null
    : null;

  const topGoal = docDetail?.analysis.top_goal;
  // top 3 sous-objectifs = les goals suivants (probas les plus hautes après le top)
  const subGoals = useMemo(() => {
    if (!docDetail) return [];
    return docDetail.analysis.goals
      .filter((g) => g.goal !== topGoal?.goal && g.probability >= 0.2)
      .slice(0, 3);
  }, [docDetail, topGoal]);

  const unclassifiedCount = documents.filter((d) => !d.analysis.top_goal).length;

  return (
    <Card className="animate-fade-up">
      <CardHeader>
        <CardDescription>Documents classés par objectif principal</CardDescription>
        <CardTitle>Explorer par ODD</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sélecteur de goal : grille de pastilles */}
        <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-[repeat(17,minmax(0,1fr))]">
          {labels.map((name, i) => {
            const g = i + 1;
            const count = (byGoal[g] ?? []).length;
            const active = selectedGoal === g;
            return (
              <button
                key={g}
                onClick={() => {
                  setSelectedGoal(active ? null : g);
                  setSelectedDoc(null);
                }}
                title={`SDG ${g} — ${name}`}
                className={[
                  "relative flex aspect-square items-center justify-center overflow-hidden rounded-lg transition-transform",
                  `sdg-${g}`,
                  active ? "ring-2 ring-white ring-offset-2 ring-offset-[#0d1424]" : "opacity-90 hover:scale-105",
                ].join(" ")}
              >
                <img
                  src={`/sdg/sdg-${g}.png`}
                  alt={`SDG ${g}`}
                  className="h-full w-full object-cover"
                />
                {count > 0 && (
                  <span className="absolute bottom-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-tl-md bg-black/60 px-1 text-[10px] font-bold tabular-nums text-white">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Liste des documents pour ce goal */}
        {selectedGoal !== null && (
          <div className="space-y-2">
            <p className="text-sm text-[#eef2fb]">
              SDG {selectedGoal} — <span className="text-[#93a0b4]">{labels[selectedGoal - 1]}</span>
            </p>
            {docsForGoal.length === 0 ? (
              <p className="text-sm text-[#93a0b4] italic">
                Aucun document n&apos;a cet objectif en premier.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {docsForGoal.map((doc) => (
                  <button
                    key={doc.name}
                    onClick={() => setSelectedDoc(doc.name)}
                    className={[
                      "rounded-lg border px-3 py-1.5 text-sm text-[#eef2fb] transition-colors",
                      selectedDoc === doc.name
                        ? "border-[#4f8ef7] bg-[#4f8ef7]/10"
                        : "border-[#1e2a45] bg-[#0a1120] hover:border-[#3d5a8a]",
                    ].join(" ")}
                  >
                    {doc.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Fiche du document sélectionné */}
        {docDetail && (
          <div className="space-y-3 rounded-xl border border-[#1e2a45] bg-[#0a1120] p-4">
            <div className="flex items-center justify-between gap-2 border-b border-[#1e2a45] pb-2">
              <span className="truncate font-medium text-white">{selectedDoc}</span>
              <button
                onClick={() => setSelectedDoc(null)}
                className="shrink-0 text-xs text-[#5c6a83] hover:text-white"
              >
                Fermer
              </button>
            </div>

            {docDetail.analysis.summary && (
              <p className="rounded-lg border border-[#1e2a45] bg-[#0d1424] px-3 py-2 text-[13px] leading-relaxed text-[#c8d2e5]">
                <span className="mr-1.5 font-semibold text-[#4f8ef7]">Résumé :</span>
                {docDetail.analysis.summary}
              </p>
            )}

            {/* Objectif principal */}
            {topGoal && (
              <div className="flex items-center gap-2 rounded-lg border border-[#1e2a45] bg-[#0d1424] px-3 py-2">
                <img
                  src={`/sdg/sdg-${topGoal.goal}.png`}
                  alt={`SDG ${topGoal.goal}`}
                  className="h-8 w-8 shrink-0 rounded-md object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      {labels[topGoal.goal - 1]}
                    </span>
                    <span className="text-xs tabular-nums text-[#93a0b4]">
                      {Math.round(topGoal.probability * 100)}%
                    </span>
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        TIER_BADGE[topGoal.tier] ?? TIER_BADGE.low,
                      ].join(" ")}
                    >
                      Objectif principal
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Top 3 sous-objectifs */}
            {subGoals.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5c6a83]">
                  Top 3 sous-objectifs
                </p>
                {subGoals.map((sg) => {
                  const evidence = docDetail.analysis.goals.find((g) => g.goal === sg.goal)?.evidence;
                  return (
                    <div key={sg.goal} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`sdg-${sg.goal} flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white`}
                        >
                          {sg.goal}
                        </span>
                        <span className="truncate text-sm text-[#eef2fb]">{labels[sg.goal - 1]}</span>
                        <span className="text-xs tabular-nums text-[#93a0b4]">
                          {Math.round(sg.probability * 100)}%
                        </span>
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            TIER_BADGE[sg.tier] ?? TIER_BADGE.low,
                          ].join(" ")}
                        >
                          {sg.tier}
                        </span>
                      </div>
                      {evidence && (
                        <p className="ml-7 border-l-2 border-[#2a3a5f] pl-3 text-[13px] italic leading-relaxed text-[#93a0b4]">
                          « {evidence} »
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {unclassifiedCount > 0 && (
          <p className="text-[11px] italic text-[#5c6a83]">
            {unclassifiedCount} document{unclassifiedCount > 1 ? "s" : ""} sans objectif principal
            significatif (tous les scores &lt; 20 %).
          </p>
        )}
      </CardContent>
    </Card>
  );
}