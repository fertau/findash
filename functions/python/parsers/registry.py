"""Parser registry — maps parser keys to parser classes."""

from typing import Optional
from .base import BaseParser


def get_parser(parser_key: str, file_path: str, file_bytes: Optional[bytes] = None) -> BaseParser:
    """Get the appropriate parser instance for a given parser key."""
    from .galicia_card import GaliciaCardParser
    from .galicia_bank import GaliciaBankParser
    from .santander_card import SantanderCardParser
    from .santander_bank import SantanderBankParser
    from .itau_visa import ItauVisaParser
    from .itau_bank import ItauBankParser
    from .generic_csv import GenericCSVParser
    from .generic_xlsx import GenericXLSXParser

    PARSERS = {
        "galicia_card": GaliciaCardParser,
        "galicia_bank": GaliciaBankParser,
        "santander_card": SantanderCardParser,
        "santander_bank": SantanderBankParser,
        "itau_visa": ItauVisaParser,
        "itau_bank": ItauBankParser,
        "generic_csv": GenericCSVParser,
        "generic_xlsx": GenericXLSXParser,
    }

    parser_cls = PARSERS.get(parser_key)
    if not parser_cls:
        raise ValueError(f"Unknown parser key: {parser_key}. Available: {list(PARSERS.keys())}")

    return parser_cls(file_path, file_bytes)
