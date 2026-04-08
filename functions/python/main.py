"""Cloud Function entry point for the FinDash parser service.

Receives file uploads via HTTP POST, routes to the appropriate
bank-specific parser, and returns structured transaction data as JSON.

Can be deployed as:
- Firebase Cloud Functions Gen2 (Python)
- Standalone FastAPI service
- Google Cloud Run
"""

import json
import os
import tempfile
from typing import Optional

import functions_framework
from flask import Request, jsonify

from parsers import get_parser
from parsers.utils import detect_parser_key_from_filename


@functions_framework.http
def parse(request: Request):
    """HTTP entry point for parsing bank statements.

    Expects multipart form data:
    - file: The statement file (PDF, CSV, XLS, XLSX)
    - parser_key: Which parser to use (e.g., "galicia_card", "itau_visa")
    - source_id: (optional) The source ID for context

    Returns JSON:
    {
        "period": "2026-03",
        "transactions": [
            {"date": "2026-03-15", "description": "...", "amount": 1234.56, "currency": "ARS"},
            ...
        ],
        "errors": [],
        "transaction_count": 42
    }
    """
    if request.method == "OPTIONS":
        # CORS preflight
        headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST",
            "Access-Control-Allow-Headers": "Content-Type",
        }
        return ("", 204, headers)

    if request.method != "POST":
        return jsonify({"error": "Method not allowed"}), 405

    try:
        # Get uploaded file
        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400

        uploaded_file = request.files["file"]
        filename = uploaded_file.filename or "unknown"

        # Determine parser
        parser_key = request.form.get("parser_key")
        if not parser_key:
            parser_key = detect_parser_key_from_filename(filename)
            if not parser_key:
                return jsonify({
                    "error": f"Cannot detect parser for file: {filename}. "
                             "Please provide parser_key parameter."
                }), 400

        # Save to temp file (parsers expect file paths)
        suffix = os.path.splitext(filename)[1] or ".tmp"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            uploaded_file.save(tmp)
            tmp_path = tmp.name

        try:
            # Parse
            parser = get_parser(parser_key, tmp_path)
            result = parser.parse()

            # Build response
            response = {
                "period": result.period,
                "transactions": [
                    {
                        "date": tx.date,
                        "description": tx.description,
                        "amount": tx.amount,
                        "currency": tx.currency,
                    }
                    for tx in result.transactions
                ],
                "errors": result.errors,
                "transaction_count": len(result.transactions),
            }

            return jsonify(response), 200

        finally:
            # Clean up temp file
            os.unlink(tmp_path)

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Parser error: {str(e)}"}), 500


# For local development with Flask
if __name__ == "__main__":
    from flask import Flask
    app = Flask(__name__)

    @app.route("/parse", methods=["POST", "OPTIONS"])
    def local_parse():
        from flask import request
        return parse(request)

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"})

    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=True)
