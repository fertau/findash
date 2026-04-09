/**
 * Built-in parser plugins.
 *
 * To add a new bank parser:
 *   1. Create a new file in this directory (e.g. hsbc-bank.ts)
 *   2. Export a ParserPlugin using toolkit utilities
 *   3. Import and register it here
 *
 * The parser will automatically be available for:
 *   - Direct use via parsePDFText(text, 'your_key')
 *   - Auto-detection via parsePDFTextAutoDetect(text)
 *   - The import API and UI
 */

import { registerParser } from '../parser-registry';
import { galiciaBank } from './galicia-bank';
import { galiciaCard } from './galicia-card';
import { santanderCard } from './santander-card';
import { santanderBank } from './santander-bank';
import { itauVisa } from './itau-visa';
import { itauBank } from './itau-bank';

const BUILTIN_PLUGINS = [
  galiciaBank,
  galiciaCard,
  santanderCard,
  santanderBank,
  itauVisa,
  itauBank,
];

let registered = false;

/** Register all built-in parsers. Safe to call multiple times. */
export function registerBuiltinParsers(): void {
  if (registered) return;
  for (const plugin of BUILTIN_PLUGINS) {
    registerParser(plugin);
  }
  registered = true;
}

export { galiciaBank, galiciaCard, santanderCard, santanderBank, itauVisa, itauBank };
