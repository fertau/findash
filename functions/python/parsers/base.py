"""Base parser interface for bank statement parsing."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Tuple, Optional


@dataclass
class ParsedTransaction:
    """A single parsed transaction from a bank statement."""
    date: str          # YYYY-MM-DD
    description: str   # Original description from statement
    amount: float      # Positive for debits/expenses, negative for credits
    currency: str = "ARS"  # ARS, USD, UYU


@dataclass
class ParseResult:
    """Result of parsing a bank statement file."""
    period: str = ""   # e.g. "2026-03" or "Marzo 2026"
    transactions: List[ParsedTransaction] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


class BaseParser(ABC):
    """Abstract base class for bank statement parsers."""

    def __init__(self, file_path: str, file_bytes: Optional[bytes] = None):
        self.file_path = file_path
        self.file_bytes = file_bytes

    @abstractmethod
    def parse(self) -> ParseResult:
        """Parse the file and return structured transactions."""
        pass

    @staticmethod
    def normalize_amount(amount_str: str) -> float:
        """Parse an amount string handling LATAM number formats.

        Handles:
        - "1.234,50" (dot thousands, comma decimal)
        - "1,234.50" (comma thousands, dot decimal)
        - "5234.50" (no thousands separator)
        - "-1.234,50" (negative amounts)
        """
        cleaned = amount_str.strip().replace("$", "").replace(" ", "")
        if not cleaned:
            return 0.0

        negative = cleaned.startswith("-") or cleaned.startswith("(")
        cleaned = cleaned.replace("-", "").replace("(", "").replace(")", "")

        if "," in cleaned and "." in cleaned:
            last_comma = cleaned.rfind(",")
            last_dot = cleaned.rfind(".")
            if last_comma > last_dot:
                # "1.234,50" format
                cleaned = cleaned.replace(".", "").replace(",", ".")
            else:
                # "1,234.50" format
                cleaned = cleaned.replace(",", "")
        elif "," in cleaned:
            parts = cleaned.split(",")
            if len(parts[-1]) <= 2:
                # "5234,50" — comma is decimal
                cleaned = cleaned.replace(",", ".")
            else:
                # "1,234" — comma is thousands
                cleaned = cleaned.replace(",", "")

        try:
            value = float(cleaned)
            return -value if negative else value
        except ValueError:
            return 0.0

    @staticmethod
    def parse_date_latam(date_str: str) -> str:
        """Parse common LATAM date formats to YYYY-MM-DD.

        Handles: DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY, DD-MM-YY
        """
        from dateutil import parser as dateutil_parser
        cleaned = date_str.strip()

        # DD/MM/YYYY or DD-MM-YYYY
        for sep in ["/", "-"]:
            parts = cleaned.split(sep)
            if len(parts) == 3:
                dd, mm, yy = parts
                if len(yy) == 2:
                    yy = f"20{yy}"
                if len(dd) <= 2 and len(mm) <= 2:
                    return f"{yy}-{mm.zfill(2)}-{dd.zfill(2)}"

        # Fallback to dateutil
        dt = dateutil_parser.parse(cleaned, dayfirst=True)
        return dt.strftime("%Y-%m-%d")
