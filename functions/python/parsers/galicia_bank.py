"""Parser for Galicia bank account PDF statements (Caja Ahorro, Cuenta Sueldo).

Expected format per transaction line:
  DD/MM/YYYY DESCRIPTION DEBIT CREDIT BALANCE
"""

import re
import pdfplumber
from .base import BaseParser, ParseResult, ParsedTransaction


TX_PATTERN = re.compile(
    r"(\d{2}/\d{2}/\d{4})\s+"   # Date DD/MM/YYYY
    r"(.+?)\s+"                  # Description
    r"(-?[\d.,]+)\s+"            # Debit or first amount
    r"(-?[\d.,]+)?\s*"           # Credit (optional)
    r"(-?[\d.,]+)?$"             # Balance (optional)
)


class GaliciaBankParser(BaseParser):
    def parse(self) -> ParseResult:
        result = ParseResult()

        with pdfplumber.open(self.file_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                for line in text.split("\n"):
                    line = line.strip()
                    match = TX_PATTERN.match(line)
                    if match:
                        date_str = match.group(1)
                        description = match.group(2).strip()
                        debit_str = match.group(3)

                        try:
                            date = self.parse_date_latam(date_str)
                            amount = self.normalize_amount(debit_str)
                            if amount == 0:
                                continue

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

        return result
