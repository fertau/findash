import {
  categoriesCollection,
  rulesCollection,
  exclusionRulesCollection,
} from '@/lib/firebase/admin';
import { nowISO } from '@/lib/utils';
import type { Category, CategorizationRule, ExclusionRule } from './types';

// ─── Categories ──────────────────────────────────────────────────────────────

export async function getCategories(householdId: string): Promise<Category[]> {
  const snap = await categoriesCollection(householdId)
    .orderBy('sortOrder')
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Category);
}

export async function getCategory(
  householdId: string,
  categoryId: string
): Promise<Category | null> {
  const snap = await categoriesCollection(householdId).doc(categoryId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as Category;
}

export async function createCategory(
  householdId: string,
  data: Omit<Category, 'id'>
): Promise<Category> {
  const ref = await categoriesCollection(householdId).add(data);
  return { id: ref.id, ...data };
}

export async function updateCategory(
  householdId: string,
  categoryId: string,
  updates: Partial<Category>
): Promise<void> {
  await categoriesCollection(householdId).doc(categoryId).update(updates);
}

export async function deleteCategory(
  householdId: string,
  categoryId: string
): Promise<void> {
  // Check it's not a system category
  const cat = await getCategory(householdId, categoryId);
  if (cat?.isSystem) {
    throw new Error('Cannot delete system category');
  }
  await categoriesCollection(householdId).doc(categoryId).delete();
}

/**
 * Get the category tree with children nested under parents.
 */
export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
}

export async function getCategoryTree(householdId: string): Promise<CategoryTreeNode[]> {
  const all = await getCategories(householdId);
  const parentMap = new Map<string, CategoryTreeNode>();
  const orphans: CategoryTreeNode[] = [];

  // First pass: identify parents
  for (const cat of all) {
    if (!cat.parentId) {
      parentMap.set(cat.id, { ...cat, children: [] });
    }
  }

  // Second pass: assign children
  for (const cat of all) {
    if (cat.parentId) {
      const parent = parentMap.get(cat.parentId);
      if (parent) {
        parent.children.push({ ...cat, children: [] });
      } else {
        orphans.push({ ...cat, children: [] });
      }
    }
  }

  return [...parentMap.values(), ...orphans];
}

// ─── Categorization Rules ────────────────────────────────────────────────────

export async function getRules(householdId: string): Promise<CategorizationRule[]> {
  const snap = await rulesCollection(householdId)
    .orderBy('priority')
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as CategorizationRule);
}

export async function createRule(
  householdId: string,
  data: Omit<CategorizationRule, 'id' | 'createdAt'>
): Promise<CategorizationRule> {
  const now = nowISO();
  const ref = await rulesCollection(householdId).add({ ...data, createdAt: now });
  return { id: ref.id, ...data, createdAt: now };
}

export async function updateRule(
  householdId: string,
  ruleId: string,
  updates: Partial<CategorizationRule>
): Promise<void> {
  await rulesCollection(householdId).doc(ruleId).update(updates);
}

export async function deleteRule(householdId: string, ruleId: string): Promise<void> {
  await rulesCollection(householdId).doc(ruleId).delete();
}

// ─── Exclusion Rules ─────────────────────────────────────────────────────────

export async function getExclusionRules(householdId: string): Promise<ExclusionRule[]> {
  const snap = await exclusionRulesCollection(householdId)
    .where('isActive', '==', true)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ExclusionRule);
}

export async function getAllExclusionRules(householdId: string): Promise<ExclusionRule[]> {
  const snap = await exclusionRulesCollection(householdId).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ExclusionRule);
}

export async function createExclusionRule(
  householdId: string,
  data: Omit<ExclusionRule, 'id' | 'createdAt'>
): Promise<ExclusionRule> {
  const now = nowISO();
  const ref = await exclusionRulesCollection(householdId).add({ ...data, createdAt: now });
  return { id: ref.id, ...data, createdAt: now };
}

export async function updateExclusionRule(
  householdId: string,
  ruleId: string,
  updates: Partial<ExclusionRule>
): Promise<void> {
  await exclusionRulesCollection(householdId).doc(ruleId).update(updates);
}

export async function deleteExclusionRule(
  householdId: string,
  ruleId: string
): Promise<void> {
  await exclusionRulesCollection(householdId).doc(ruleId).delete();
}
