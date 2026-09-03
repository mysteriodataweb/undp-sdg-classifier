# -*- coding: utf-8 -*-
"""FastAPI backend for the UNDP SDG text classifier."""
from typing import List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .model import SDGClassifier
from .sdg import SDG_NAMES, DEFAULT_LANG

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
