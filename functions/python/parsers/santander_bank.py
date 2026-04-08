"""Parser for Santander bank account PDF statements."""

import re
import pdfplumber
from .base import BaseParser, ParseResult, ParsedTransaction


TX_PATTERN = re.compile(
    r"(\d{2}/\d{2}/\d{4})\s+"
    r"(.+?)\s+"
    r"(-?[\d.,]+)\s+"
    r"(-?[\d.,]+)?$"
)


class SantanderBankParser(BaseParser):
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
                        amount_str = match.group(3)

                        try:
                            date = self.parse_date_latam(date_str)
                            amount = self.normalize_amount(amount_str)
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
                            result.errors.append(f"Failed to parse: {line} — {e}")

        return result
