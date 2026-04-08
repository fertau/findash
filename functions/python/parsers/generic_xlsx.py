"""Generic XLSX/XLS parser with configurable column mapping."""

import pandas as pd
from .base import BaseParser, ParseResult, ParsedTransaction


DEFAULT_CONFIG = {
    "date_column": 0,
    "description_column": 1,
    "amount_column": 2,
    "currency_column": None,
    "default_currency": "ARS",
    "skip_header": True,
    "sheet_name": 0,
}


class GenericXLSXParser(BaseParser):
    def __init__(self, file_path, file_bytes=None, config=None):
        super().__init__(file_path, file_bytes)
        self.config = {**DEFAULT_CONFIG, **(config or {})}

    def parse(self) -> ParseResult:
        result = ParseResult()

        try:
            try:
                df = pd.read_excel(
                    self.file_path,
                    sheet_name=self.config["sheet_name"],
                    engine="openpyxl",
                )
            except Exception:
                df = pd.read_excel(
                    self.file_path,
                    sheet_name=self.config["sheet_name"],
                    engine="xlrd",
                )

            cols = list(df.columns)
            date_col = cols[self.config["date_column"]] if isinstance(self.config["date_column"], int) else self.config["date_column"]
            desc_col = cols[self.config["description_column"]] if isinstance(self.config["description_column"], int) else self.config["description_column"]
            amount_col = cols[self.config["amount_column"]] if isinstance(self.config["amount_column"], int) else self.config["amount_column"]
            currency_col = None
            if self.config["currency_column"] is not None:
                currency_col = cols[self.config["currency_column"]] if isinstance(self.config["currency_column"], int) else self.config["currency_column"]

            for idx, row in df.iterrows():
                try:
                    date_val = row[date_col]
                    desc_val = str(row[desc_col]).strip()
                    amount_val = row[amount_col]

                    if pd.isna(date_val) or pd.isna(amount_val) or not desc_val:
                        continue

                    # Parse date
                    if hasattr(date_val, "strftime"):
                        date_str = date_val.strftime("%Y-%m-%d")
                    else:
                        date_str = self.parse_date_latam(str(date_val))

                    # Parse amount
                    if isinstance(amount_val, (int, float)):
                        amount = float(amount_val)
                    else:
                        amount = self.normalize_amount(str(amount_val))

                    if amount == 0:
                        continue

                    currency = self.config["default_currency"]
                    if currency_col and not pd.isna(row.get(currency_col)):
                        c = str(row[currency_col]).upper().strip()
                        if c in ("ARS", "USD", "UYU"):
                            currency = c

                    result.transactions.append(
                        ParsedTransaction(
                            date=date_str,
                            description=desc_val,
                            amount=abs(amount),
                            currency=currency,
                        )
                    )
                except Exception as e:
                    result.errors.append(f"Row {idx}: {e}")

        except Exception as e:
            result.errors.append(f"File error: {e}")

        return result
