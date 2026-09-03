# -*- coding: utf-8 -*-
"""Model loading + inference for the SDG multi-label classifier."""
import os

import numpy as np
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

_MODEL_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "models",
    "undp-sdg-xlmr",
)

# Fallback: a light multilingual SDG classifier on the Hub, used when the
# locally fine-tuned model is not present yet (quick local demo).
_FALLBACK_ID = "albertmartinez/distilbert-multilingual-sdg-classification"

NUM_LABELS = 17


class SDGClassifier:
    def __init__(self, model_dir: str | None = None, threshold: float = 0.5):
        self.threshold = threshold
        self.model_dir = model_dir or (_MODEL_PATH if os.path.isdir(_MODEL_PATH) else None)
        self.loaded_from_fallback = False
        self.model, self.tokenizer = self._load()

    def _load(self):
        if self.model_dir:
            tokenizer = AutoTokenizer.from_pretrained(self.model_dir)
            model = AutoModelForSequenceClassification.from_pretrained(self.model_dir)
        else:
            # fall back to a hub model
            tokenizer = AutoTokenizer.from_pretrained(_FALLBACK_ID)
            model = AutoModelForSequenceClassification.from_pretrained(_FALLBACK_ID)
            self.loaded_from_fallback = True
        model.eval()
        if torch.cuda.is_available():
            model = model.cuda()
        return model, tokenizer

    def predict(self, text: str, top_k: int = 5):
        inputs = self.tokenizer(
            text, return_tensors="pt", truncation=True, max_length=256, padding=True
        )
        inputs = {k: v.to(self.model.device) for k, v in inputs.items()}
        with torch.no_grad():
            logits = self.model(**inputs).logits[0]
        probs = torch.sigmoid(logits).cpu().numpy()

        idx = np.argsort(-probs)
        result = []
        for i in idx[:top_k]:
            p = float(probs[i])
            if p >= self.threshold or len(result) == 0:
                result.append({"goal": int(i) + 1, "probability": round(p, 4)})
        return result

    def predict_full(self, text: str, threshold: float | None = None):
        thr = threshold if threshold is not None else self.threshold
        inputs = self.tokenizer(
            text, return_tensors="pt", truncation=True, max_length=256, padding=True
        )
        inputs = {k: v.to(self.model.device) for k, v in inputs.items()}
        with torch.no_grad():
            logits = self.model(**inputs).logits[0]
        probs = torch.sigmoid(logits).cpu().numpy()
        return [
            {"goal": int(i) + 1, "probability": round(float(p), 4)}
            for i, p in enumerate(probs)
            if p >= thr
        ]
