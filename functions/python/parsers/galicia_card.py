"""Parser for Galicia Visa/Mastercard PDF statements.

Expected format per transaction line:
  DD-MM-YY *FLAG DESCRIPTION AMOUNT

Flags: K=Installment, F=Fixed, E=International
Example: "15-03-26 *K SAURA 3/12 5,234.50"
"""

import re
import pdfplumber
from .base import BaseParser, ParseResult, ParsedTransaction


# Match: date, optional flag, description, amount
TX_PATTERN = re.compile(
    r"(\d{2}-\d{2}-\d{2})\s+"   # Date DD-MM-YY
    r"(?:\*([A-Z])\s+)?"         # Optional flag (*K, *F, *E)
    r"(.+?)\s+"                  # Description (non-greedy)
    r"(-?[\d.,]+(?:\.\d{2})?)$"  # Amount
)

# Period detection: "PERÍODO: 15/02/2026 al 15/03/2026" or "Cierre: Marzo 2026"
PERIOD_PATTERN = re.compile(
    r"(?:PER[IÍ]ODO|CIERRE|RESUMEN)\s*:?\s*.*?(\d{2}/\d{2}/\d{4})\s+al\s+(\d{2}/\d{2}/\d{4})",
    re.IGNORECASE,
)
PERIOD_MONTH_PATTERN = re.compile(
    r"(?:Cierre|Período)\s*:?\s*(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)\s+(\d{4})",
    re.IGNORECASE,
)

MONTHS_ES = {
    "enero": "01", "febrero": "02", "marzo": "03", "abril": "04",
    "mayo": "05", "junio": "06", "julio": "07", "agosto": "08",
    "septiembre": "09", "octubre": "10", "noviembre": "11", "diciembre": "12",
}


class GaliciaCardParser(BaseParser):
    def parse(self) -> ParseResult:
        result = ParseResult()

        with pdfplumber.open(self.file_path) as pdf:
            full_text = ""
            for page in pdf.pages:
                text = page.extract_text() or ""
                full_text += text + "\n"

                for line in text.split("\n"):
                    line = line.strip()
                    match = TX_PATTERN.match(line)
                    if match:
                        date_str = match.group(1)
                        description = match.group(3).strip()
                        amount_str = match.group(4)

                        try:
                            date = self.parse_date_latam(date_str)
                            amount = self.normalize_amount(amount_str)
                            result.transactions.append(
                                ParsedTransaction(
                                    date=date,
                                    description=description,
                                    amount=abs(amount),
                                    currency="ARS",
                                )
                            )
                        except Exception as e:
                            result.errors.append(f"Failed to parse line: {line} — {e}")

            # Extract period
            result.period = self._extract_period(full_text)

        return result

    def _extract_period(self, text: str) -> str:
        match = PERIOD_PATTERN.search(text)
        if match:
            # Use the end date of the period
            end_date = match.group(2)
            parts = end_date.split("/")
            return f"{parts[2]}-{parts[1]}"

        match = PERIOD_MONTH_PATTERN.search(text)
        if match:
            month_name = match.group(1).lower()
            year = match.group(2)
            month_num = MONTHS_ES.get(month_name, "01")
            return f"{year}-{month_num}"

        return ""
