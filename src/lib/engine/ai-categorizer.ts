import Anthropic from '@anthropic-ai/sdk';
import type { Category, CategoryMatchType } from '@/lib/db/types';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface AICategorizeInput {
  description: string;
  normalizedDescription: string;
  amount: number;
  currency: string;
}

export interface AICategorizeResult {
  categoryId: string;
  matchType: CategoryMatchType;
  confidence: number;
  reason: string;
}

interface AIResponseItem {
  index: number;
  categoryId: string;
  confidence: number;
  reason: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_BATCH_SIZE = 50;
const MODEL = 'claude-haiku-4-20250414';
const MAX_TOKENS = 2048;
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;

const UNCATEGORIZED: AICategorizeResult = {
  categoryId: 'cat_sin_categorizar',
  matchType: 'uncategorized',
  confidence: 0,
  reason: '',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Check whether the Anthropic API key is configured.
 */
export function isAICategorizationAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function buildPrompt(items: AICategorizeInput[], categories: Category[]): string {
  const categoryList = categories
    .map((c) => `- ${c.id}: ${c.name} (${c.type})`)
    .join('\n');

  const transactionList = items
    .map((item, i) => `${i}. "${item.description}" — ${item.currency} ${item.amount}`)
    .join('\n');

  return `Eres un sistema de categorización de gastos personales para una familia argentina.

Categorías disponibles:
${categoryList}

Transacciones a categorizar:
${transactionList}

Para cada transacción, responde SOLO con un JSON array donde cada elemento tiene:
- "index": número de la transacción
- "categoryId": el ID de la categoría más apropiada
- "confidence": un número entre 0 y 1 indicando tu confianza
- "reason": una explicación breve en español de por qué elegiste esa categoría (máximo 60 caracteres, ej: "Supermercado mayorista", "Plataforma de streaming", "Peaje autopista")

Si no estás seguro, usa "cat_sin_categorizar" con confidence baja.
Responde SOLO con el JSON array, sin texto adicional.`;
}

function buildCategoryIdSet(categories: Category[]): Set<string> {
  const set = new Set<string>();
  for (const c of categories) {
    set.add(c.id);
  }
  set.add('cat_sin_categorizar');
  return set;
}

function parseAIResponse(
  text: string,
  itemCount: number,
  validCategoryIds: Set<string>,
): AICategorizeResult[] {
  const results: AICategorizeResult[] = new Array(itemCount);

  // Fill with uncategorized defaults
  for (let i = 0; i < itemCount; i++) {
    results[i] = { ...UNCATEGORIZED };
  }

  let parsed: unknown;
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return results;
  }

  if (!Array.isArray(parsed)) {
    return results;
  }

  for (const item of parsed as AIResponseItem[]) {
    const index = item?.index;
    const categoryId = item?.categoryId;
    const confidence = item?.confidence;

    if (
      typeof index !== 'number' ||
      index < 0 ||
      index >= itemCount ||
      typeof categoryId !== 'string' ||
      typeof confidence !== 'number'
    ) {
      continue;
    }

    if (!validCategoryIds.has(categoryId)) {
      // Invalid category ID — leave as uncategorized
      continue;
    }

    results[index] = {
      categoryId,
      matchType: 'ai' as CategoryMatchType,
      confidence: Math.max(0, Math.min(1, confidence)),
      reason: typeof item.reason === 'string' ? item.reason.slice(0, 100) : '',
    };
  }

  return results;
}

// ─── Core batch call ────────────────────────────────────────────────────────

async function callAIBatch(
  items: AICategorizeInput[],
  categories: Category[],
  validCategoryIds: Set<string>,
): Promise<AICategorizeResult[]> {
  const client = new Anthropic();

  const prompt = buildPrompt(items, categories);

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await client.messages.create(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: controller.signal },
      );

      clearTimeout(timer);

      // Extract text from the response
      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        return items.map(() => ({ ...UNCATEGORIZED }));
      }

      return parseAIResponse(textBlock.text, items.length, validCategoryIds);
    } catch (error) {
      lastError = error;
      // Only retry if we haven't exhausted retries
      if (attempt < MAX_RETRIES) {
        continue;
      }
    }
  }

  console.error('[ai-categorizer] All retries failed:', lastError);
  return items.map(() => ({ ...UNCATEGORIZED }));
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Categorize a batch of transactions using Claude AI.
 *
 * - If ANTHROPIC_API_KEY is not set, returns all items as uncategorized.
 * - Batches larger than 50 are split into sequential chunks.
 * - Each chunk is retried once on failure with a 30-second timeout.
 */
export async function aiCategorizeBatch(
  items: AICategorizeInput[],
  categories: Category[],
): Promise<AICategorizeResult[]> {
  // Graceful fallback when API key is not configured
  if (!isAICategorizationAvailable()) {
    return items.map(() => ({ ...UNCATEGORIZED }));
  }

  if (items.length === 0) {
    return [];
  }

  const validCategoryIds = buildCategoryIdSet(categories);

  // If within batch limit, process in a single call
  if (items.length <= MAX_BATCH_SIZE) {
    return callAIBatch(items, categories, validCategoryIds);
  }

  // Split into chunks and process sequentially
  const results: AICategorizeResult[] = [];

  for (let offset = 0; offset < items.length; offset += MAX_BATCH_SIZE) {
    const chunk = items.slice(offset, offset + MAX_BATCH_SIZE);
    const chunkResults = await callAIBatch(chunk, categories, validCategoryIds);
    results.push(...chunkResults);
  }

  return results;
}
