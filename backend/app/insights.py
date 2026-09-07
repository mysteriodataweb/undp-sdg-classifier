# -*- coding: utf-8 -*-
"""Analytics helpers over a stored batch: documents grouped by main goal,
co-occurrence between SDGs, and an extractive AI report.

Everything here is computed from already-stored per-document analysis —
no model inference, no LLM.
"""
from typing import Any, Dict, List

GOAL_FLOOR = 0.20


def group_by_goal(documents: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Group documents by their primary (top) objective.

    A document is *unclassified* when no SDG reaches the significance floor.
    """
    primary: Dict[int, List[str]] = {g: [] for g in range(1, 18)}
    secondary: Dict[int, List[str]] = {g: [] for g in range(1, 18)}
    unclassified: List[str] = []

    for doc in documents:
        name = doc.get("name", "document")
        analysis = doc.get("analysis", {})
        top = analysis.get("top_goal")

        if not top:
            unclassified.append(name)
            continue

        primary[top["goal"]].append(name)

        # secondary = every other goal the document touches
        for g in analysis.get("goals_hit", []):
            if g != top["goal"]:
                secondary[g].append(name)

    goals = []
    for g in range(1, 18):
        goals.append({
            "goal": g,
            "primary": sorted(set(primary[g])),
            "secondary": sorted(set(secondary[g])),
        })
    return {
        "goals": goals,
        "unclassified": sorted(set(unclassified)),
    }


def cooccurrence(documents: List[Dict[str, Any]]) -> Dict[str, Any]:
    """17x17 matrix counting how often two SDGs appear in the same document,
    plus the top pairs ranked by count."""
    matrix = [[0] * 17 for _ in range(17)]
    for doc in documents:
        hit = sorted(doc.get("analysis", {}).get("goals_hit", []))
        for i in range(len(hit)):
            for j in range(i + 1, len(hit)):
                a, b = hit[i], hit[j]
                matrix[a - 1][b - 1] += 1
                matrix[b - 1][a - 1] += 1

    pairs = []
    for a in range(1, 18):
        for b in range(a + 1, 18):
            n = matrix[a - 1][b - 1]
            if n > 0:
                pairs.append({"a": a, "b": b, "count": n, "docs": [
                    doc.get("name", "document")
                    for doc in documents
                    if a in doc.get("analysis", {}).get("goals_hit", [])
                    and b in doc.get("analysis", {}).get("goals_hit", [])
                ]})
    pairs.sort(key=lambda x: -x["count"])

    return {"matrix": matrix, "pairs": pairs}


def report(documents: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregated extractive report: top-objective distribution, average
    intensity per goal, unclassified rate, and per-document insights."""
    total = len(documents) or 1

    top_count = {g: 0 for g in range(1, 18)}
    intensity_sum = {g: 0.0 for g in range(1, 18)}
    intensity_n = {g: 0 for g in range(1, 18)}
    unclassified = 0

    for doc in documents:
        analysis = doc.get("analysis", {})
        top = analysis.get("top_goal")
        if top:
            top_count[top["goal"]] += 1
        else:
            unclassified += 1
        for goal in analysis.get("goals", []):
            g = goal["goal"]
            intensity_sum[g] += goal["probability"]
            intensity_n[g] += 1

    distribution = []
    for g in range(1, 18):
        distribution.append({
            "goal": g,
            "doc_count": top_count[g],
            "share": round(top_count[g] / total, 4),
            "avg_intensity": round(intensity_sum[g] / intensity_n[g], 4) if intensity_n[g] else 0.0,
            "mentions": intensity_n[g],
        })

    doc_insights = []
    for doc in documents:
        analysis = doc.get("analysis", {})
        key_figures = [f for f in analysis.get("key_figures", []) if f.get("type") in ("amount", "percentage", "count")]
        doc_insights.append({
            "name": doc.get("name", "document"),
            "top_goal": analysis.get("top_goal"),
            "summary": analysis.get("summary", ""),
            "key_figures": key_figures[:6],
            "top_passages": analysis.get("passages", [])[:3],
            "paragraph_count": analysis.get("paragraph_count", 0),
        })

    return {
        "total_documents": len(documents),
        "unclassified_documents": unclassified,
        "unclassified_rate": round(unclassified / total, 4),
        "distribution": distribution,
        "documents": doc_insights,
    }