"""Shared utilities for parsers."""

import re
from typing import Optional


def detect_parser_key_from_filename(filename: str) -> Optional[str]:
    """Attempt to detect the correct parser key from a filename.

    Examples:
    - "Galicia_Visa_Mar2026.pdf" → "galicia_card"
    - "itau_estado_cuenta.pdf" → "itau_visa"
    - "santander_amex_03_2026.pdf" → "santander_card"
    - "movimientos.csv" → "generic_csv"
    - "extracto.xlsx" → "generic_xlsx"
    """
    lower = filename.lower()

    # Bank-specific detection
    if "galicia" in lower:
        if any(k in lower for k in ("visa", "mc", "master", "card", "tarjeta", "resumen")):
            return "galicia_card"
        return "galicia_bank"

    if "santander" in lower:
        if any(k in lower for k in ("visa", "amex", "card", "tarjeta", "resumen")):
            return "santander_card"
        return "santander_bank"

    if "itau" in lower or "itaú" in lower:
        if any(k in lower for k in ("visa", "card", "tarjeta")):
            return "itau_visa"
        return "itau_bank"

    # Generic by extension
    if lower.endswith(".csv") or lower.endswith(".tsv"):
        return "generic_csv"
    if lower.endswith(".xlsx") or lower.endswith(".xls"):
        return "generic_xlsx"

    return None


def extract_period_from_text(text: str) -> str:
    """Try to extract a period (YYYY-MM) from free-form text."""
    months_es = {
        "enero": "01", "febrero": "02", "marzo": "03", "abril": "04",
        "mayo": "05", "junio": "06", "julio": "07", "agosto": "08",
        "septiembre": "09", "octubre": "10", "noviembre": "11", "diciembre": "12",
    }

    # Try "Month YYYY" format
    for name, num in months_es.items():
        pattern = rf"{name}\s+(\d{{4}})"
        match = re.search(pattern, text.lower())
        if match:
            return f"{match.group(1)}-{num}"

    # Try "MM/YYYY" or "MM-YYYY" format
    match = re.search(r"(\d{2})[/-](\d{4})", text)
    if match:
        return f"{match.group(2)}-{match.group(1)}"

    return ""
