# -*- coding: utf-8 -*-
"""Extract raw text from uploaded documents (TXT/MD/PDF/DOCX)."""
import os


def _read_txt(path: str) -> str:
    for enc in ("utf-8", "latin-1"):
        try:
            with open(path, "r", encoding=enc) as f:
                return f.read()
        except UnicodeDecodeError:
            continue
    return ""


def _read_pdf(path: str) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        return ""
    reader = PdfReader(path)
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def _read_docx(path: str) -> str:
    try:
        import docx  # python-docx
    except ImportError:
        return ""
    doc = docx.Document(path)
    return "\n".join(p.text for p in doc.paragraphs)


def extract_text(path: str, filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext in (".txt", ".md", ".rtf"):
        return _read_txt(path)
    if ext == ".pdf":
        return _read_pdf(path)
    if ext == ".docx":
        return _read_docx(path)
    return ""


def extract_text_or_raise(path: str, filename: str) -> str:
    text = extract_text(path, filename).strip()
    if not text:
        raise ValueError(
            "Impossible d'extraire du texte de ce fichier (format non supporté, "
            "PDF scanné ou document vide). Formats supportés : TXT, MD, PDF, DOCX."
        )
    return text