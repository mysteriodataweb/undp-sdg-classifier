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
    top_k: int = Form(5),
    text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    """Classify a pasted text (mode=text) or an uploaded document (mode=file)."""
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
        top_k = max(1, min(top_k, 17))
        preds = clf.predict(body, top_k=top_k)
        return _respond(clf, preds, lang)

    if mode == "text":
        if not text or not text.strip():
            raise HTTPException(status_code=422, detail="Texte vide.")
        top_k = max(1, min(top_k, 17))
        preds = clf.predict(text, top_k=top_k)
        return _respond(clf, preds, lang)

    raise HTTPException(status_code=422, detail=f"mode inconnu: {mode!r}")
