import admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

/**
 * Aggressively searches for a service account key in environment variables or local files.
 */
function findServiceAccountKey(): { key: string; value: string } | null {
  // 1. Check standard keys first
  const standardKeys = [
    'FIREBASE_SERVICE_ACCOUNT',
    'FIREBASE_SERVICE_ACCOUNT_KEY',
    'GOOGLE_SERVICE_ACCOUNT',
    'SERVICE_ACCOUNT_KEY',
    'SERVICE_ACCOUNT'
  ];

  for (const key of standardKeys) {
    if (process.env[key]) {
      return { key, value: process.env[key]! };
    }
  }

  // 2. Aggressive search: look for any key containing "SERVICE_ACCOUNT" or "FIREBASE" and "KEY"
  for (const key in process.env) {
    const upperKey = key.toUpperCase();
    if (
      (upperKey.includes('SERVICE_ACCOUNT')) || 
      (upperKey.includes('FIREBASE') && upperKey.includes('KEY')) ||
      (upperKey.includes('GOOGLE') && upperKey.includes('CREDENTIALS'))
    ) {
      const val = process.env[key];
      if (val && (val.includes('{') || val.includes('private_key'))) {
        return { key, value: val };
      }
    }
  }

  // 3. Check for a local file as a last resort
  const localFilePath = path.join(process.cwd(), 'service-account.json');
  if (fs.existsSync(localFilePath)) {
    try {
      const content = fs.readFileSync(localFilePath, 'utf8');
      return { key: 'FILE:service-account.json', value: content };
    } catch (e) {
      console.error('Error reading local service-account.json:', e);
    }
  }

  return null;
}

export function initAdmin() {
  let initError: string | null = null;
  let foundKeyName: string | null = null;
  
  if (!admin || !admin.apps || !admin.apps.length) {
    try {
      const result = findServiceAccountKey();
      
      if (!result) {
        initError = 'لم يتم العثور على أي متغير بيئة يحتوي على مفتاح الخدمة. تأكد من إضافة المفتاح في إعدادات Secrets باسم FIREBASE_SERVICE_ACCOUNT';
        console.error(initError);
      } else {
        foundKeyName = result.key;
        let serviceAccount;
        try {
          serviceAccount = JSON.parse(result.value);
        } catch (e) {
          try {
            // Fix common JSON issues like unescaped newlines
            const fixed = result.value.replace(/\n/g, '\\n');
            serviceAccount = JSON.parse(fixed);
          } catch (e2) {
            initError = `فشل في تحليل محتوى المتغير ${result.key}. تأكد من أنه نص JSON صحيح (يبدأ بـ { وينتهي بـ }).`;
            throw new Error(initError);
          }
        }

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log(`Firebase Admin initialized successfully using key: ${result.key}`);
      }
    } catch (error: any) {
      initError = error.message || String(error);
      console.error('Firebase Admin initialization error:', error);
    }
  }

  return {
    initialized: !!(admin && admin.apps && admin.apps.length > 0),
    envSet: !!findServiceAccountKey(),
    error: initError
  };
}

const DEFAULT_FIRESTORE_DATABASE_ID = 'ai-studio-a3d5d0b4-314f-478c-a9b4-cb05e7fa0221';

function resolveFirestoreDatabaseId(): string {
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (parsed && parsed.firestoreDatabaseId) return parsed.firestoreDatabaseId;
    }
  } catch (e) {
    console.error('Could not read firebase-applet-config.json, falling back:', e);
  }
  return DEFAULT_FIRESTORE_DATABASE_ID;
}

let dbInstance: Firestore | null = null;
export function getDb(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(admin.app(), resolveFirestoreDatabaseId());
  }
  return dbInstance;
}

export { admin };
