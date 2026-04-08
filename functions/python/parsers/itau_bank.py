"""Parser for Itaú bank account XLS/XLSX statements."""

import pandas as pd
from .base import BaseParser, ParseResult, ParsedTransaction


class ItauBankParser(BaseParser):
    def parse(self) -> ParseResult:
        result = ParseResult()

        try:
            # Try XLSX first, then XLS
            try:
                df = pd.read_excel(self.file_path, engine="openpyxl")
            except Exception:
                df = pd.read_excel(self.file_path, engine="xlrd")

            # Detect column names (flexible matching)
            col_map = self._detect_columns(df)
            if not col_map:
                result.errors.append("Could not detect column structure")
                return result

            for _, row in df.iterrows():
                try:
                    date_val = row[col_map["date"]]
                    desc_val = str(row[col_map["description"]]).strip()
                    amount_val = row[col_map["amount"]]

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

                    # Detect currency from source or column
                    currency = self._detect_currency(col_map, row)

                    result.transactions.append(
                        ParsedTransaction(
                            date=date_str,
                            description=desc_val,
                            amount=abs(amount),
                            currency=currency,
                        )
                    )
                except Exception as e:
                    result.errors.append(f"Row parse error: {e}")

        except Exception as e:
            result.errors.append(f"File read error: {e}")

        return result

    def _detect_columns(self, df: pd.DataFrame) -> dict:
        """Detect which columns contain date, description, and amount."""
        columns = {c: c.upper().strip() for c in df.columns}
        col_map = {}

        for orig, upper in columns.items():
            if any(k in upper for k in ("FECHA", "DATE")):
                col_map["date"] = orig
            elif any(k in upper for k in ("CONCEPTO", "DESCRIPCION", "DESCRIPCIÓN", "DETALLE")):
                col_map["description"] = orig
            elif any(k in upper for k in ("IMPORTE", "MONTO", "AMOUNT", "DEBITO", "DÉBITO")):
                col_map["amount"] = orig
            elif any(k in upper for k in ("MONEDA", "CURRENCY")):
                col_map["currency"] = orig

        # Validate required columns exist
        if all(k in col_map for k in ("date", "description", "amount")):
            return col_map
        return {}

    def _detect_currency(self, col_map: dict, row) -> str:
        """Detect currency from a column or default based on filename."""
        if "currency" in col_map:
            val = str(row[col_map["currency"]]).upper().strip()
            if "USD" in val or "DOLAR" in val:
                return "USD"
            if "UYU" in val or "PESO" in val:
                return "UYU"

        # Default based on file path hint
        if self.file_path and "usd" in self.file_path.lower():
            return "USD"

        return "UYU"
