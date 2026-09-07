# -*- coding: utf-8 -*-
"""FastAPI backend for the UNDP SDG text classifier."""
import os
from typing import List, Optional

from fastapi import FastAPI, Form, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .model import SDGClassifier
from .sdg import SDG_NAMES, DEFAULT_LANG
from .file_text import extract_text_or_raise
from . import analysis
from . import insights
from . import batches

app = FastAPI(title="UNDP SDG Classifier API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_clf = None


def get_clf() -> SDGClassifier:
    global _clf
    if _clf is None:
        _clf = SDGClassifier()
    return _clf


class PredictRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    top_k: int = Field(5, ge=1, le=17)
    lang: str = Field(DEFAULT_LANG, max_length=2)


class PredictResponse(BaseModel):
    predictions: List[dict]
    labels: dict
    model: str


@app.on_event("startup")
def _load():
    get_clf()


@app.get("/health")
def health():
    clf = get_clf()
    return {
        "status": "ok",
        "model": clf.model_dir or clf.model.config._name_or_path,
        "fallback": clf.loaded_from_fallback,
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    clf = get_clf()
    preds = clf.predict(req.text, top_k=req.top_k)
    lang = req.lang if req.lang in SDG_NAMES else DEFAULT_LANG
    return {
        "predictions": preds,
        "labels": {"sdg": SDG_NAMES[lang]},
        "model": clf.model_dir or clf.model.config._name_or_path,
    }


@app.get("/sdg")
def sdg(lang: str = DEFAULT_LANG):
    lang = lang if lang in SDG_NAMES else DEFAULT_LANG
    return SDG_NAMES[lang]


def _respond(clf, preds, lang):
    lang = lang if lang in SDG_NAMES else DEFAULT_LANG
    return {
        "predictions": preds,
        "labels": {"sdg": SDG_NAMES[lang]},
        "model": clf.model_dir or clf.model.config._name_or_path,
    }


@app.post("/classify")
async def classify(
    mode: str = Form("text"),
    lang: str = Form(DEFAULT_LANG),
    text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    """Classify a pasted text (mode=text) or an uploaded document (mode=file).

    Returns all 17 goal scores ranked best-first, each with a confidence tier.
    """
    clf = get_clf()

    if mode == "file":
        if file is None:
            raise HTTPException(status_code=422, detail="Aucun fichier fourni.")
        raw = await file.read()
        content = raw[: 8 * 1024 * 1024]  # cap at 8 MB
        tmp_path = os.path.join(os.path.dirname(__file__), "_upload.tmp")
        with open(tmp_path, "wb") as f:
            f.write(content)
        try:
            body = extract_text_or_raise(tmp_path, file.filename or "")
        finally:
            os.path.exists(tmp_path) and os.remove(tmp_path)
        if not body.strip():
            raise HTTPException(status_code=422, detail="Aucun texte extrait du fichier.")
        if len(body) > 10000:
            body = body[:10000]
        preds = clf.predict_all(body)
        return _respond(clf, preds, lang)

    if mode == "text":
        if not text or not text.strip():
            raise HTTPException(status_code=422, detail="Texte vide.")
        preds = clf.predict_all(text)
        return _respond(clf, preds, lang)

    raise HTTPException(status_code=422, detail=f"mode inconnu: {mode!r}")


# --- Corpus-level analysis (batch upload, evidence, dashboard, CSV export) ---

MAX_FILES = 10
MAX_BYTES = 8 * 1024 * 1024


def _read_upload(file: UploadFile) -> str:
    raw = file.file.read(MAX_BYTES)
    if not raw:
        raise HTTPException(status_code=422, detail=f"Fichier vide: {file.filename}")
    tmp_path = os.path.join(os.path.dirname(__file__), "_upload.tmp")
    with open(tmp_path, "wb") as f:
        f.write(raw)
    try:
        body = extract_text_or_raise(tmp_path, file.filename or "")
    finally:
        os.path.exists(tmp_path) and os.remove(tmp_path)
    return body[:10000]


def _filename(uf: UploadFile) -> str:
    return uf.filename or "document.txt"


@app.post("/analyze")
async def analyze(
    files: List[UploadFile] = File(...),
    lang: str = Form(DEFAULT_LANG),
    name: Optional[str] = Form(None),
):
    """Classify a batch of documents, locate per-goal evidence, aggregate coverage,
    and persist the batch for the analytics dashboard."""
    clf = get_clf()
    if not files:
        raise HTTPException(status_code=422, detail="Aucun fichier fourni.")
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=422, detail=f"Maximum {MAX_FILES} fichiers par lot.")

    docs = []
    for uf in files:
        body = _read_upload(uf)
        docs.append({"name": _filename(uf), "analysis": analysis.analyze_document(clf, body)})

    # Aggregate coverage across the whole batch
    total = len(docs)
    coverage = {g: 0 for g in range(1, 18)}
    intensity = {g: 0.0 for g in range(1, 18)}
    for d in docs:
        for g, cnt in d["analysis"]["counts"].items():
            if cnt > 0:
                coverage[g] += 1
        for goal in d["analysis"]["goals"]:
            intensity[goal["goal"]] = max(intensity[goal["goal"]], goal["probability"])

    lang = lang if lang in SDG_NAMES else DEFAULT_LANG
    payload = {
        "documents": docs,
        "coverage": [
            {
                "goal": g,
                "doc_count": coverage[g],
                "max_probability": round(intensity[g], 4),
                "tier": analysis._tier(intensity[g]) if intensity[g] else "low",
            }
            for g in range(1, 18)
        ],
        "total_documents": total,
        "labels": {"sdg": SDG_NAMES[lang]},
        "model": clf.model_dir or clf.model.config._name_or_path,
    }

    # Interactive analyses are not persisted (adhoc /classify keeps no state),
    # but /analyze always stores the batch for the dashboard history.
    batch_name = name or "Lot analysé "
    batch_id = batches.save_batch(batch_name, lang, payload)
    payload["batch_id"] = batch_id
    return payload


@app.post("/analyze/export")
async def analyze_export(
    files: List[UploadFile] = File(...),
):
    """Build a CSV: one row per document, one column per SDG (probability)."""
    clf = get_clf()
    if not files or len(files) > MAX_FILES:
        raise HTTPException(status_code=422, detail="Lot invalide.")

    rows = []
    for uf in files:
        body = _read_upload(uf)
        res = analysis.analyze_document(clf, body)
        probs = {g: 0.0 for g in range(1, 18)}
        for goal in res["goals"]:
            probs[goal["goal"]] = goal["probability"]
        rows.append((_filename(uf), probs))

    header = ["document"] + [f"SDG{g}" for g in range(1, 18)]
    lines = [",".join(header)]
    for name, probs in rows:
        clean = name.replace(",", " ").replace('"', "")
        lines.append(",".join([f'"{clean}"'] + [f"{probs[g]:.4f}" for g in range(1, 18)]))
    csv_text = "\n".join(lines) + "\n"

    from fastapi.responses import Response
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="sdg_coverage.csv"'},
    )


# --- Analytics dashboard (stored batches) ------------------------------------


def _require_batch(batch_id: int) -> dict:
    payload = batches.get_batch(batch_id)
    if payload is None:
        raise HTTPException(status_code=404, detail=f"Lot {batch_id} introuvable.")
    return payload


@app.get("/batches")
def list_batches():
    """List saved analysis batches (history for the dashboard)."""
    return {"batches": batches.list_batches()}


@app.get("/batches/{batch_id}")
def get_batch(batch_id: int):
    """Full stored payload of one analysis batch."""
    return _require_batch(batch_id)


@app.delete("/batches/{batch_id}")
def delete_batch(batch_id: int):
    if not batches.delete_batch(batch_id):
        raise HTTPException(status_code=404, detail=f"Lot {batch_id} introuvable.")
    return {"deleted": True, "batch_id": batch_id}


@app.get("/batches/{batch_id}/by-goal")
def batch_by_goal(batch_id: int):
    """Documents grouped by their primary (top) objective."""
    payload = _require_batch(batch_id)
    grouped = insights.group_by_goal(payload["documents"])
    return {
        "batch_id": batch_id,
        "goals": grouped["goals"],
        "unclassified": grouped["unclassified"],
        "labels": payload.get("labels", {}),
    }


@app.get("/batches/{batch_id}/cooccurrence")
def batch_cooccurrence(batch_id: int):
    """Pairwise SDG co-occurrence over the batch documents."""
    payload = _require_batch(batch_id)
    co = insights.cooccurrence(payload["documents"])
    return {"batch_id": batch_id, "matrix": co["matrix"], "pairs": co["pairs"]}


@app.get("/batches/{batch_id}/insights")
def batch_insights(batch_id: int):
    """Extractive AI report over the batch (distribution, summaries, key figures)."""
    payload = _require_batch(batch_id)
    report = insights.report(payload["documents"])
    report["batch_id"] = batch_id
    report["labels"] = payload.get("labels", {})
    report["coverage"] = payload.get("coverage", [])
    return report


@app.get("/batches/{batch_id}/export")
def batch_export(batch_id: int):
    """CSV probability matrix for a stored batch (one row per document)."""
    payload = _require_batch(batch_id)
    rows = []
    for doc in payload["documents"]:
        probs = {g: 0.0 for g in range(1, 18)}
        for goal in doc["analysis"]["goals"]:
            probs[goal["goal"]] = goal["probability"]
        rows.append((doc.get("name", "document"), probs))

    header = ["document"] + [f"SDG{g}" for g in range(1, 18)]
    lines = [",".join(header)]
    for name, probs in rows:
        clean = name.replace(",", " ").replace('"', "")
        lines.append(",".join([f'"{clean}"'] + [f"{probs[g]:.4f}" for g in range(1, 18)]))
    csv_text = "\n".join(lines) + "\n"

    from fastapi.responses import Response
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="batch_{batch_id}_coverage.csv"'},
    )
