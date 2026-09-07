# -*- coding: utf-8 -*-
"""Corpus-level analysis: batch classification, per-paragraph evidence, mini summaries.

Given one or more documents, we:
  - classify each paragraph independently to locate the *evidence* behind each SDG
  - emit a short, factual summary assembled from the strongest evidence excerpts
  - aggregate counts per SDG for the coverage dashboard
This is attribution, not generation: every quote is a verbatim passage from the text.
"""
import re
from typing import List, Dict, Any, Tuple, Optional

from .model import SDGClassifier

# Split text into clean paragraphs (>= ~25 chars to skip headers/noise)
def split_paragraphs(text: str) -> List[str]:
    parts = re.split(r"\n\s*\n", text)
    out = []
    for p in parts:
        p = " ".join(p.split()).strip()
        if len(p) >= 25:
            out.append(p)
    return out


def analyze_document(
    clf: SDGClassifier,
    text: str,
    top_goals: int = 6,
    max_paragraphs: int = 120,
) -> Dict[str, Any]:
    """Return per-goal scores plus verbatim evidence excerpts and a mini summary."""
    paragraphs = split_paragraphs(text)[:max_paragraphs]
    para_scores: List[List[Tuple[int, float]]] = []

    # Score each paragraph (cap to keep latency sane)
    for para in paragraphs:
        ranked = clf.predict_all(para)
        para_scores.append([(r["goal"], r["probability"]) for r in ranked])

    # Aggregate: document-level score per goal = max over paragraphs
    doc_score = {}
    for scores in para_scores:
        for goal, p in scores:
            if p > doc_score.get(goal, 0.0):
                doc_score[goal] = p

    ranked_goals = sorted(doc_score.items(), key=lambda x: -x[1])[:top_goals]

    # Evidence: best paragraph for each kept goal, with a snippet
    evidence = []
    for goal, score in ranked_goals:
        best = None
        best_p = -1.0
        for para, scores in zip(paragraphs, para_scores):
            for g, p in scores:
                if g == goal and p > best_p:
                    best_p = p
                    best = para
        snippet = best if best else ""
        evidence.append({
            "goal": goal,
            "probability": round(score, 4),
            "tier": _tier(score),
            "quote": _snippet(snippet, 220),
        })

    # Mini summary from the strongest evidence (verbatim-backed)
    summary = _build_summary(evidence, paragraphs)

    # Coverage counts for the dashboard
    counts = {g: 0 for g in range(1, 18)}
    for scores in para_scores:
        hit = set(g for g, p in scores if p >= 0.20)
        for g in hit:
            counts[g] += 1

    return {
        "goals": [
            {"goal": g, "probability": round(p, 4), "tier": _tier(p), "evidence": _quote_for(evidence, g)}
            for g, p in ranked_goals
        ],
        "summary": summary,
        # Main objective of the document (goal #1) if above the significance floor
        "top_goal": _build_top_goal(ranked_goals),
        # Every goal touched by at least one paragraph above the floor
        "goals_hit": sorted(g for g in range(1, 18) if _doc_hit(doc_score, g)),
        # The most informative passages, ranked by their best goal score
        "passages": _top_passages(paragraphs, para_scores, limit=5),
        # Extracted key figures (amounts, percentages, years, units)
        "key_figures": extract_key_figures(text),
        "counts": counts,
        "paragraph_count": len(paragraphs),
    }


def _build_top_goal(ranked_goals) -> Optional[Dict[str, Any]]:
    if not ranked_goals:
        return None
    g, p = ranked_goals[0]
    if p < 0.20:
        return None
    return {"goal": g, "probability": round(p, 4), "tier": _tier(p)}


def _doc_hit(doc_score, goal: int) -> bool:
    return doc_score.get(goal, 0.0) >= 0.20


def _top_passages(paragraphs, para_scores, limit: int = 5) -> List[Dict[str, Any]]:
    best = []
    for para, scores in zip(paragraphs, para_scores):
        if not scores:
            continue
        goal, p = scores[0]  # predict_all is already sorted desc
        best.append((p, goal, para))
    best.sort(key=lambda x: -x[0])
    return [
        {"goal": goal, "probability": round(p, 4), "quote": _snippet(para, 260)}
        for p, goal, para in best[:limit]
    ]


def _tier(p: float) -> str:
    return "high" if p >= 0.40 else ("medium" if p >= 0.20 else "low")


def _snippet(text: str, n: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1] + "…"


def _quote_for(evidence: List[Dict[str, Any]], goal: int) -> str:
    for e in evidence:
        if e["goal"] == goal:
            return e["quote"]
    return ""


def _build_summary(evidence: List[Dict[str, Any]], paragraphs: List[str]) -> str:
    """Compose a short factual summary from the top evidence excerpts."""
    strong = [e for e in evidence if e["tier"] == "high"][:3]
    if not strong:
        strong = evidence[:2]
    if not strong:
        return ""
    lines = []
    for e in strong:
        quote = e["quote"].strip()
        tail = quote[-1] if quote else ""
        if tail not in ".!?…":
            quote += "…"
        lines.append(f"SDG {e['goal']} ({int(round(e['probability']*100))}%) : « {quote} »")
    return " ".join(lines)


# --- Key figures extraction (rule-based, no LLM) ------------------------------

_FIGURE_PATTERNS = [
    # percentages: 12.5 %
    (re.compile(r"\d+(?:[.,]\d+)?\s*%"), "percentage"),
    # monetary amounts with currency symbols or ISO codes
    (re.compile(r"(?:\$|€|£|USD|EUR|FCFA|XAF|GNF)\s?\d+(?:[.,]\d+)*"), "amount"),
    (re.compile(r"\d+(?:[.,]\d+)*(?:\s?(?:USD|EUR|FCFA|XAF|dollars?|euros?|francs?))"), "amount"),
    # four-digit years
    (re.compile(r"\b(?:19|20)\d{2}\b"), "year"),
    # large counts with units (MW, tonnes, hectares, beneficiaries, people…)
    (re.compile(r"\b\d+(?:[.,]\d+)*(?:\s?(?:MW|GW|kWh|MWh|tonnes?|ha|hectares?|beneficiaries?|people|households?|students?|women|men|jobs?|schools?|patients?))\b"), "count"),
]


def extract_key_figures(text: str, max_figures: int = 12) -> List[Dict[str, Any]]:
    """Extract salient numbers with their surrounding sentence for business insight."""
    flat = " ".join(text.split())
    figures: List[Dict[str, Any]] = []
    seen = set()
    for pattern, kind in _FIGURE_PATTERNS:
        for m in pattern.finditer(flat):
            value = m.group(0).strip()
            key = (kind, value)
            if key in seen:
                continue
            seen.add(key)
            start = max(0, m.start() - 60)
            end = min(len(flat), m.end() + 90)
            context = flat[start:end].strip()
            figures.append({
                "type": kind,
                "value": value,
                "context": _snippet(context, 150),
            })
        if len(figures) >= max_figures:
            break
    return figures[:max_figures]
