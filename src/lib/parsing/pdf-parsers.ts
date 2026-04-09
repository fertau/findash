/**
 * PDF Text Parsers — backward-compatible entry point.
 *
 * Delegates to the plugin registry. Import this module for the same
 * API as before (parsePDFText, parsePDFTextAutoDetect).
 *
 * For new code, prefer importing from parser-registry directly.
 */

import { registerBuiltinParsers } from './plugins';
import { parseByKey, parseWithBestParser, getAllParsers, detectParser } from './parser-registry';
import type { RawParsedTransaction } from '@/lib/db/types';

// Ensure built-in parsers are registered on first import
registerBuiltinParsers();

/** Parse PDF text using a specific parser key. */
export function parsePDFText(text: string, parserKey: string): RawParsedTransaction[] {
  return parseByKey(text, parserKey);
}

/** Auto-detect the parser and parse. Falls back to trying all parsers. */
export function parsePDFTextAutoDetect(text: string): RawParsedTransaction[] {
  return parseWithBestParser(text);
}

// Re-export registry functions for convenience
export { getAllParsers, detectParser, registerBuiltinParsers };
export type { ParserPlugin } from './parser-registry';
