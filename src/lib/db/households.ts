import { FieldValue } from 'firebase-admin/firestore';
import {
  householdRef,
  membersCollection,
  categoriesCollection,
  exclusionRulesCollection,
  cardMappingsCollection,
  usersCollection,
  getAdminDb,
} from '@/lib/firebase/admin';
import { DEFAULT_CATEGORIES } from '@/config/categories';
import { DEFAULT_EXCLUSION_PATTERNS } from '@/config/defaults';
import { nowISO } from '@/lib/utils';
import type {
  Household,
  HouseholdMember,
  HouseholdSettings,
  CardMapping,
  Category,
  ExclusionRule,
} from './types';

// ─── Household CRUD ──────────────────────────────────────────────────────────

export async function createHousehold(
  ownerId: string,
  ownerEmail: string,
  ownerName: string,
  name: string,
  baseCurrency: 'ARS' | 'USD' | 'UYU' = 'ARS'
): Promise<Household> {
  const db = getAdminDb();
  const ref = db.collection('households').doc();
  const now = nowISO();

  const household: Omit<Household, 'id'> = {
    name,
    ownerId,
    settings: { baseCurrency, fiscalYearStart: 1 },
    createdAt: now,
    updatedAt: now,
  };

  const batch = db.batch();

  // Create household document
  batch.set(ref, household);

  // Add owner as member
  const memberRef = membersCollection(ref.id).doc(ownerId);
  const member: HouseholdMember = {
    userId: ownerId,
    email: ownerEmail,
    displayName: ownerName,
    role: 'owner',
    isExcluded: false,
    canUpload: true,
    canViewAll: true,
    joinedAt: now,
  };
  batch.set(memberRef, member);

  // Add household to user profile
  const userRef = usersCollection().doc(ownerId);
  batch.set(
    userRef,
    { householdIds: FieldValue.arrayUnion(ref.id) },
    { merge: true }
  );

  await batch.commit();

  // Seed default data (categories, exclusion rules)
  await seedDefaultData(ref.id, ownerId);

  return { id: ref.id, ...household };
}

export async function getHousehold(householdId: string): Promise<Household | null> {
  const snap = await householdRef(householdId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as Household;
}

export async function updateHouseholdSettings(
  householdId: string,
  settings: Partial<HouseholdSettings>
): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: nowISO() };
  for (const [key, value] of Object.entries(settings)) {
    updates[`settings.${key}`] = value;
  }
  await householdRef(householdId).update(updates);
}

// ─── Members ─────────────────────────────────────────────────────────────────

export async function getMembers(householdId: string): Promise<HouseholdMember[]> {
  const snap = await membersCollection(householdId).get();
  return snap.docs.map((doc) => doc.data() as HouseholdMember);
}

export async function getMember(
  householdId: string,
  userId: string
): Promise<HouseholdMember | null> {
  const snap = await membersCollection(householdId).doc(userId).get();
  if (!snap.exists) return null;
  return snap.data() as HouseholdMember;
}

export async function addMember(
  householdId: string,
  member: HouseholdMember
): Promise<void> {
  const db = getAdminDb();
  const batch = db.batch();

  batch.set(membersCollection(householdId).doc(member.userId), member);

  // Add household to user profile
  const userRef = usersCollection().doc(member.userId);
  batch.set(userRef, { householdIds: [householdId] }, { merge: true });

  await batch.commit();
}

export async function updateMember(
  householdId: string,
  userId: string,
  updates: Partial<HouseholdMember>
): Promise<void> {
  await membersCollection(householdId).doc(userId).update(updates);
}

// ─── Card Registry ───────────────────────────────────────────────────────────

export async function getCardMappings(householdId: string): Promise<CardMapping[]> {
  const snap = await cardMappingsCollection(householdId).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as CardMapping);
}

export async function createCardMapping(
  householdId: string,
  data: Omit<CardMapping, 'id'>
): Promise<CardMapping> {
  const ref = await cardMappingsCollection(householdId).add(data);
  return { id: ref.id, ...data };
}

export async function updateCardMapping(
  householdId: string,
  cardId: string,
  updates: Partial<CardMapping>
): Promise<void> {
  await cardMappingsCollection(householdId).doc(cardId).update(updates);
}

export async function deleteCardMapping(
  householdId: string,
  cardId: string
): Promise<void> {
  await cardMappingsCollection(householdId).doc(cardId).delete();
}

// ─── Seed Default Data ───────────────────────────────────────────────────────

async function seedDefaultData(householdId: string, createdBy: string): Promise<void> {
  const db = getAdminDb();
  const now = nowISO();

  // Seed categories (batched writes, max 500 per batch)
  let batch = db.batch();
  let count = 0;

  function flattenCategories(cats: typeof DEFAULT_CATEGORIES, parentId?: string) {
    const result: Array<Omit<Category, 'id'> & { id: string }> = [];
    let sortOrder = 0;

    for (const cat of cats) {
      sortOrder += 10;
      result.push({
        id: cat.id,
        name: cat.name,
        type: cat.type,
        parentId,
        icon: cat.icon,
        color: cat.color,
        sortOrder,
        isSystem: cat.id === 'cat_sin_categorizar',
      });

      if (cat.children) {
        let childOrder = 0;
        for (const child of cat.children) {
          childOrder += 1;
          result.push({
            id: child.id,
            name: child.name,
            type: cat.type,
            parentId: cat.id,
            icon: cat.icon,
            color: cat.color,
            sortOrder: sortOrder + childOrder,
            isSystem: false,
          });
        }
      }
    }
    return result;
  }

  const allCategories = flattenCategories(DEFAULT_CATEGORIES);
  for (const cat of allCategories) {
    const ref = categoriesCollection(householdId).doc(cat.id);
    batch.set(ref, cat);
    count++;
    if (count >= 400) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }

  // Seed exclusion rules
  for (const rule of DEFAULT_EXCLUSION_PATTERNS) {
    const ref = exclusionRulesCollection(householdId).doc();
    const exclusionRule: Omit<ExclusionRule, 'id'> = {
      ...rule,
      isActive: true,
      createdBy,
      createdAt: now,
    };
    batch.set(ref, exclusionRule);
    count++;
  }

  if (count > 0) {
    await batch.commit();
  }
}

// ─── User Households ─────────────────────────────────────────────────────────

export async function getUserHouseholds(userId: string): Promise<string[]> {
  const userSnap = await usersCollection().doc(userId).get();
  if (!userSnap.exists) return [];
  return (userSnap.data()?.householdIds as string[]) || [];
}
