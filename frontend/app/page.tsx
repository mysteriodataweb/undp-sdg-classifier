"use client";

import { useCallback, useRef, useState } from "react";

interface Prediction {
  goal: number;
  probability: number;
}

interface PredictResponse {
  predictions: Prediction[];
  labels: { sdg: string[] };
  model: string;
}

const EXAMPLES: Record<string, string> = {
  en: "A national program to install solar panels in rural schools, train local teachers, and provide clean drinking water to remote communities.",
  fr: "Un programme national d'installation de panneaux solaires dans les écoles rurales, la formation d'enseignants locaux et l'accès à l'eau potable pour les communautés isolées.",
  es: "Un programa nacional para instalar paneles solares en escuelas rurales, capacitar a docentes locales y garantizar agua potable para comunidades aisladas.",
};

export default function Classifier() {
  const [text, setText] = useState("");
  const [lang, setLang] = useState("en");
  const [labels, setLabels] = useState<string[]>([]);
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState("");

  const run = useCallback(
    async (body: string) => {
      setError("");
      setLoading(true);
      try {
        const res = await fetch("/api/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: body, top_k: 5, lang }),
        });
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data: PredictResponse = await res.json();
        setLabels(data.labels.sdg);
        setPreds(data.predictions);
        setModel(data.model);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Erreur de connexion au backend."
        );
      } finally {
        setLoading(false);
      }
    },
    [lang]
  );

  return (
    <div className="wrap">
      <header>
        <h1>UNDP · SDG Text Classifier</h1>
        <p>
          Analyse automatique de textes / de rapports pour identifier les
          Objectifs de Développement Durable correspondants (NLP multilingue).
        </p>
      </header>

      <div className="card">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Collez ici un extrait de rapport, une description de projet, un appel à projet…"
        />
        <div className="row">
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="es">Español</option>
          </select>
          <button
            disabled={loading || !text.trim()}
            onClick={() => run(text)}
          >
            {loading ? "Analyse…" : "Classer"}
          </button>
          <button disabled={loading} onClick={() => run(EXAMPLES[lang])}>
            Exemple
          </button>
        </div>
        <p className="hint">
          Modèle entraîné sur le corpus officiel du PNUD (EN / FR / ES).
        </p>
        {error && <div className="error">{error}</div>}
      </div>

      {preds.length > 0 && (
        <div className="results">
          <h2>Objectifs détectés</h2>
          {preds.map((p) => {
            const name = labels[p.goal - 1] ?? `SDG ${p.goal}`;
            const pct = Math.round(p.probability * 100);
            return (
              <div className="bar-row" key={p.goal}>
                <div className={`badge goal-${p.goal}`}>{p.goal}</div>
                <div className="bar-label">{name}</div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${pct}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
                <div className="bar-pct">{pct}%</div>
              </div>
            );
          })}
          <p className="hint">{model}</p>
        </div>
      )}
    </div>
  );
}
