/**
 * Firestore CRUD for user-defined parser templates.
 * Templates are household-scoped — each household can define their own parsers.
 */

import { parserTemplatesCollection } from '@/lib/firebase/admin';
import type { ParserTemplate } from '@/lib/db/types';

export async function getParserTemplates(householdId: string): Promise<ParserTemplate[]> {
  const snap = await parserTemplatesCollection(householdId).orderBy('label').get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as ParserTemplate));
}

export async function getParserTemplate(
  householdId: string,
  templateId: string
): Promise<ParserTemplate | null> {
  const doc = await parserTemplatesCollection(householdId).doc(templateId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as ParserTemplate;
}

export async function createParserTemplate(
  householdId: string,
  data: Omit<ParserTemplate, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ParserTemplate> {
  const now = new Date().toISOString();
  const ref = parserTemplatesCollection(householdId).doc();
  const template: ParserTemplate = {
    ...data,
    id: ref.id,
    householdId,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(template);
  return template;
}

export async function updateParserTemplate(
  householdId: string,
  templateId: string,
  data: Partial<Omit<ParserTemplate, 'id' | 'householdId' | 'createdAt'>>
): Promise<void> {
  await parserTemplatesCollection(householdId).doc(templateId).update({
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteParserTemplate(
  householdId: string,
  templateId: string
): Promise<void> {
  await parserTemplatesCollection(householdId).doc(templateId).delete();
}
