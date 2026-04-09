import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getStorage, type Storage } from 'firebase-admin/storage';

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env.local'
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

let _db: Firestore | null = null;
let _auth: Auth | null = null;
let _storage: Storage | null = null;

export function getAdminDb(): Firestore {
  if (!_db) {
    _db = getFirestore(getAdminApp());
  }
  return _db;
}

export function getAdminAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getAdminApp());
  }
  return _auth;
}

export function getAdminStorage(): Storage {
  if (!_storage) {
    _storage = getStorage(getAdminApp());
  }
  return _storage;
}

// Collection path helpers
export function householdRef(householdId: string) {
  return getAdminDb().collection('households').doc(householdId);
}

export function membersCollection(householdId: string) {
  return householdRef(householdId).collection('members');
}

export function transactionsCollection(householdId: string) {
  return householdRef(householdId).collection('transactions');
}

export function categoriesCollection(householdId: string) {
  return householdRef(householdId).collection('categories');
}

export function rulesCollection(householdId: string) {
  return householdRef(householdId).collection('rules');
}

export function exclusionRulesCollection(householdId: string) {
  return householdRef(householdId).collection('exclusion_rules');
}

export function exchangeRatesCollection(householdId: string) {
  return householdRef(householdId).collection('exchange_rates');
}

export function importLogCollection(householdId: string) {
  return householdRef(householdId).collection('import_log');
}

export function cardMappingsCollection(householdId: string) {
  return householdRef(householdId).collection('card_mappings');
}

export function accrualRulesCollection(householdId: string) {
  return householdRef(householdId).collection('accrual_rules');
}

export function allocationsCollection(householdId: string) {
  return householdRef(householdId).collection('transfer_allocations');
}

export function installmentGroupsCollection(householdId: string) {
  return householdRef(householdId).collection('installment_groups');
}

export function importSourcesCollection(householdId: string) {
  return householdRef(householdId).collection('import_sources');
}

export function usersCollection() {
  return getAdminDb().collection('users');
}
