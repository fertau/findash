"""Parser for Itaú Visa PDF statements — TWO-COLUMN CURRENCY LAYOUT.

The Itaú Visa statement has a critical layout challenge:
- Two amount columns: UYU (left) and USD (right)
- pdfplumber's text extraction loses column position
- We must use positional extraction to correctly assign currency

Layout:
  DATE  DESCRIPTION           UYU          USD
  15/03 FARMACIA SAURA     5,200.00         —
  16/03 BOOKING.COM             —       123.45

Strategy:
1. First try extract_tables() for structured data
2. Fallback to positional extraction using word x-coordinates
"""

import re
from typing import List, Optional
import pdfplumber
from .base import BaseParser, ParseResult, ParsedTransaction


class ItauVisaParser(BaseParser):
    # X-coordinate threshold to separate UYU (left) from USD (right) column.
    # This value may need calibration with actual statement PDFs.
    COLUMN_THRESHOLD_X = 400

    def parse(self) -> ParseResult:
        result = ParseResult()

        with pdfplumber.open(self.file_path) as pdf:
            for page in pdf.pages:
                # Strategy 1: Try table extraction
                tables = page.extract_tables()
                if tables:
                    for table in tables:
                        txs = self._parse_table(table)
                        result.transactions.extend(txs)
                        if txs:
                            continue

                # Strategy 2: Positional word extraction
                txs = self._parse_positional(page)
                result.transactions.extend(txs)

            # Detect period from first page text
            first_page_text = pdf.pages[0].extract_text() or ""
            result.period = self._extract_period(first_page_text)

        return result

    def _parse_table(self, table: list) -> List[ParsedTransaction]:
        """Parse a table extracted by pdfplumber.

        Expected columns: [date, description, uyu_amount, usd_amount, ...]
        """
        transactions = []
        if not table or len(table) < 2:
            return transactions

        # Find column indices by checking header row
        header = [str(cell or "").upper().strip() for cell in table[0]]
        uyu_col = None
        usd_col = None
        date_col = 0
        desc_col = 1

        for i, h in enumerate(header):
            if "UYU" in h or "PESOS" in h:
                uyu_col = i
            elif "USD" in h or "DOLAR" in h or "DÓLAR" in h:
                usd_col = i
            elif "FECHA" in h:
                date_col = i
            elif "CONCEPTO" in h or "DESCRIPCION" in h or "DESCRIPCIÓN" in h:
                desc_col = i

        for row in table[1:]:
            if not row or len(row) < 3:
                continue

            date_str = str(row[date_col] or "").strip()
            if not re.match(r"\d{2}[/-]\d{2}", date_str):
                continue

            description = str(row[desc_col] or "").strip()
            if not description:
                continue

            # Try to get amounts from identified columns
            uyu_amount = self._try_parse_amount(row, uyu_col)
            usd_amount = self._try_parse_amount(row, usd_col)

            # Determine currency and amount
            if uyu_amount and uyu_amount != 0:
                transactions.append(ParsedTransaction(
                    date=self._normalize_date(date_str),
                    description=description,
                    amount=abs(uyu_amount),
                    currency="UYU",
                ))
            elif usd_amount and usd_amount != 0:
                transactions.append(ParsedTransaction(
                    date=self._normalize_date(date_str),
                    description=description,
                    amount=abs(usd_amount),
                    currency="USD",
                ))

        return transactions

    def _parse_positional(self, page) -> List[ParsedTransaction]:
        """Fallback: use word x-coordinates to determine column assignment.

        Groups words by y-coordinate (same line), then checks x-position
        of numeric values to assign currency.
        """
        transactions = []
        words = page.extract_words(keep_blank_chars=True, x_tolerance=3, y_tolerance=3)

        if not words:
            return transactions

        # Detect column boundaries by finding header positions
        threshold_x = self._detect_column_threshold(words)

        # Group words by y-coordinate (same row)
        rows = self._group_by_row(words)

        for row_words in rows:
            # Try to identify a transaction row
            tx = self._parse_positional_row(row_words, threshold_x)
            if tx:
                transactions.append(tx)

        return transactions

    def _detect_column_threshold(self, words: list) -> float:
        """Detect the x-coordinate boundary between UYU and USD columns.

        Looks for header words "UYU" and "USD" to find the midpoint.
        Falls back to the default threshold if headers aren't found.
        """
        uyu_x = None
        usd_x = None

        for w in words:
            text = w["text"].upper().strip()
            if text in ("UYU", "U$S", "PESOS"):
                uyu_x = w["x0"]
            elif text in ("USD", "US$", "DOLARES", "DÓLARES"):
                usd_x = w["x0"]

        if uyu_x is not None and usd_x is not None:
            return (uyu_x + usd_x) / 2

        return self.COLUMN_THRESHOLD_X

    def _group_by_row(self, words: list, y_tolerance: float = 5) -> List[List[dict]]:
        """Group words into rows based on y-coordinate proximity."""
        if not words:
            return []

        sorted_words = sorted(words, key=lambda w: (w["top"], w["x0"]))
        rows = []
        current_row = [sorted_words[0]]
        current_y = sorted_words[0]["top"]

        for w in sorted_words[1:]:
            if abs(w["top"] - current_y) <= y_tolerance:
                current_row.append(w)
            else:
                rows.append(current_row)
                current_row = [w]
                current_y = w["top"]

        if current_row:
            rows.append(current_row)

        return rows

    def _parse_positional_row(
        self, row_words: list, threshold_x: float
    ) -> Optional[ParsedTransaction]:
        """Parse a single row using positional data."""
        if len(row_words) < 2:
            return None

        # Find date-like word (DD/MM or DD-MM)
        date_word = None
        desc_words = []
        amount_words_left = []  # UYU column
        amount_words_right = []  # USD column

        for w in row_words:
            text = w["text"].strip()
            x_center = (w["x0"] + w["x1"]) / 2

            if not date_word and re.match(r"\d{2}[/-]\d{2}", text):
                date_word = text
                continue

            # Check if this looks like a number
            cleaned = text.replace(".", "").replace(",", "").replace("-", "").replace(" ", "")
            if cleaned.isdigit() and len(cleaned) >= 2:
                if x_center < threshold_x:
                    amount_words_left.append(text)
                else:
                    amount_words_right.append(text)
            elif text not in ("—", "-", "", "0", "0,00", "0.00"):
                desc_words.append(text)

        if not date_word or not desc_words:
            return None

        description = " ".join(desc_words).strip()

        # Determine currency based on which column has the amount
        uyu_str = " ".join(amount_words_left) if amount_words_left else ""
        usd_str = " ".join(amount_words_right) if amount_words_right else ""

        uyu_val = self.normalize_amount(uyu_str) if uyu_str else 0
        usd_val = self.normalize_amount(usd_str) if usd_str else 0

        if uyu_val and uyu_val != 0:
            return ParsedTransaction(
                date=self._normalize_date(date_word),
                description=description,
                amount=abs(uyu_val),
                currency="UYU",
            )
        elif usd_val and usd_val != 0:
            return ParsedTransaction(
                date=self._normalize_date(date_word),
                description=description,
                amount=abs(usd_val),
                currency="USD",
            )

        return None

    def _try_parse_amount(self, row: list, col_idx: Optional[int]) -> Optional[float]:
        if col_idx is None or col_idx >= len(row):
            return None
        val = str(row[col_idx] or "").strip()
        if not val or val in ("—", "-", ""):
            return None
        return self.normalize_amount(val)

    def _normalize_date(self, date_str: str) -> str:
        """Normalize short dates (DD/MM) by adding current year."""
        # If only DD/MM, append current year
        if re.match(r"^\d{2}[/-]\d{2}$", date_str):
            from datetime import date
            sep = "/" if "/" in date_str else "-"
            return self.parse_date_latam(f"{date_str}{sep}{date.today().year}")
        return self.parse_date_latam(date_str)

    def _extract_period(self, text: str) -> str:
        match = re.search(
            r"(?:Período|Periodo|Estado de Cuenta)\s*:?\s*.*?(\w+)\s+(\d{4})",
            text, re.IGNORECASE
        )
        if match:
            month_name = match.group(1).lower()
            year = match.group(2)
            months_es = {
                "enero": "01", "febrero": "02", "marzo": "03", "abril": "04",
                "mayo": "05", "junio": "06", "julio": "07", "agosto": "08",
                "septiembre": "09", "octubre": "10", "noviembre": "11", "diciembre": "12",
            }
            month_num = months_es.get(month_name, "01")
            return f"{year}-{month_num}"
        return ""
