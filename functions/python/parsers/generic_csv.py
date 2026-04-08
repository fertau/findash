"""Generic CSV parser with configurable column mapping.

Used for user-exported CSVs from banking apps where the format
is known but doesn't match any specific bank parser.
"""

import csv
import io
from .base import BaseParser, ParseResult, ParsedTransaction


# Default column mapping (can be overridden via config)
DEFAULT_CONFIG = {
    "date_column": 0,
    "description_column": 1,
    "amount_column": 2,
    "currency_column": None,
    "default_currency": "ARS",
    "delimiter": ",",
    "skip_header": True,
    "encoding": "utf-8",
}


class GenericCSVParser(BaseParser):
    def __init__(self, file_path, file_bytes=None, config=None):
        super().__init__(file_path, file_bytes)
        self.config = {**DEFAULT_CONFIG, **(config or {})}

    def parse(self) -> ParseResult:
        result = ParseResult()

        try:
            if self.file_bytes:
                content = self.file_bytes.decode(self.config["encoding"])
            else:
                with open(self.file_path, "r", encoding=self.config["encoding"]) as f:
                    content = f.read()

            reader = csv.reader(
                io.StringIO(content),
                delimiter=self.config["delimiter"],
            )

            rows = list(reader)
            start_idx = 1 if self.config["skip_header"] else 0

            for i, row in enumerate(rows[start_idx:], start=start_idx):
                try:
                    if len(row) <= max(
                        self.config["date_column"],
                        self.config["description_column"],
                        self.config["amount_column"],
                    ):
                        continue

                    date_str = row[self.config["date_column"]].strip()
                    description = row[self.config["description_column"]].strip()
                    amount_str = row[self.config["amount_column"]].strip()

                    if not date_str or not description or not amount_str:
                        continue

                    date = self.parse_date_latam(date_str)
                    amount = self.normalize_amount(amount_str)

                    if amount == 0:
                        continue

                    currency = self.config["default_currency"]
                    if self.config["currency_column"] is not None:
                        idx = self.config["currency_column"]
                        if idx < len(row):
                            currency = row[idx].strip().upper()
                            if currency not in ("ARS", "USD", "UYU"):
                                currency = self.config["default_currency"]

                    result.transactions.append(
                        ParsedTransaction(
                            date=date,
                            description=description,
                            amount=abs(amount),
                            currency=currency,
                        )
                    )
                except Exception as e:
                    result.errors.append(f"Row {i}: {e}")

        except Exception as e:
            result.errors.append(f"File error: {e}")

        return result
