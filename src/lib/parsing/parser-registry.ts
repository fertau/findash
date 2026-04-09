/**
 * Parser Plugin Registry
 *
 * Central registry for bank statement PDF parsers.
 * Each plugin provides:
 *   - Metadata (institution, document type)
 *   - Fingerprints for auto-detection
 *   - A parse function that converts extracted PDF text → transactions
 *
 * To add a new parser:
 *   1. Create a file in src/lib/parsing/plugins/
 *   2. Export a ParserPlugin object using toolkit utilities
 *   3. Import and call registerParser() in plugins/index.ts
 */

import type { RawParsedTransaction } from '@/lib/db/types';

// ─── Plugin Interface ───────────────────────────────────────────────────────────

export interface ParserPlugin {
  /** Unique key, used in import sources and API calls. */
  key: string;
  /** Human-readable label, e.g. "Galicia – Cuenta Bancaria" */
  label: string;
  /** Institution name, e.g. "Galicia", "Santander", "Itaú" */
  institution: string;
  /** Document type, e.g. "Cuenta Bancaria", "Tarjeta Visa", "Tarjeta Amex" */
  documentType: string;
  /**
   * Regex patterns that, if found in the raw PDF text, identify this document.
   * Used by detectParser() for auto-detection.
   * The more specific and numerous, the better the detection.
   */
  fingerprints: RegExp[];
  /**
   * Parse extracted PDF text into raw transactions.
   * The text comes from pdf-parse and may have quirks (merged lines, repeated headers).
   */
  parse: (text: string) => RawParsedTransaction[];
}

// ─── Registry ───────────────────────────────────────────────────────────────────

const registry = new Map<string, ParserPlugin>();

/** Register a parser plugin. Overwrites if key already exists. */
export function registerParser(plugin: ParserPlugin): void {
  registry.set(plugin.key, plugin);
}

/** Get a parser by key. Returns undefined if not found. */
export function getParser(key: string): ParserPlugin | undefined {
  return registry.get(key);
}

/** Get all registered parsers. */
export function getAllParsers(): ParserPlugin[] {
  return Array.from(registry.values());
}

/** Get all registered parser keys. */
export function getParserKeys(): string[] {
  return Array.from(registry.keys());
}

// ─── Auto-Detection ─────────────────────────────────────────────────────────────

interface DetectionResult {
  plugin: ParserPlugin;
  score: number;
}

/**
 * Detect which parser best matches the given PDF text.
 * Scores each plugin by how many of its fingerprints match.
 * Returns the best match, or null if no fingerprints match.
 */
export function detectParser(text: string): ParserPlugin | null {
  const results: DetectionResult[] = [];

  for (const plugin of registry.values()) {
    let score = 0;
    for (const fp of plugin.fingerprints) {
      if (fp.test(text)) score++;
    }
    if (score > 0) {
      results.push({ plugin, score });
    }
  }

  if (results.length === 0) return null;

  // Sort by score descending, then by fingerprint specificity (more fingerprints = more specific)
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.plugin.fingerprints.length - a.plugin.fingerprints.length;
  });

  return results[0].plugin;
}

/**
 * Try all registered parsers and return whichever yields the most transactions.
 * Used as a fallback when detection is inconclusive.
 */
export function parseWithBestParser(text: string): RawParsedTransaction[] {
  // First try auto-detection
  const detected = detectParser(text);
  if (detected) {
    const result = detected.parse(text);
    if (result.length > 0) return result;
  }

  // Fallback: try all parsers, pick the one with most results
  let best: RawParsedTransaction[] = [];
  for (const plugin of registry.values()) {
    try {
      const result = plugin.parse(text);
      if (result.length > best.length) {
        best = result;
      }
    } catch {
      // parser threw, skip
    }
  }
  return best;
}

// ─── Parse by Key ───────────────────────────────────────────────────────────────

/**
 * Parse PDF text using a specific parser key.
 * Throws if the key is not registered.
 */
export function parseByKey(text: string, key: string): RawParsedTransaction[] {
  const plugin = registry.get(key);
  if (!plugin) {
    throw new Error(`Unknown parser key: "${key}". Registered: ${getParserKeys().join(', ')}`);
  }
  return plugin.parse(text);
}
