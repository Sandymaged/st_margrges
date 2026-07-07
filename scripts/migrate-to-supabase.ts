/**
 * One-time migration: Firestore -> Supabase Postgres.
 *
 * Prereqs:
 *  - supabase/migrations/0001_init.sql already applied to the target project
 *  - service-account.json (Firebase) present in the project root, or one of
 *    the FIREBASE_SERVICE_ACCOUNT[_KEY] env vars set
 *  - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in the environment
 *
 * Run with: npm run migrate:supabase
 *
 * Firebase Auth password hashes cannot be exported/imported, so every
 * migrated user gets a random temporary password. Phone -> temp password
 * pairs are written to migration-temp-passwords.json (gitignored) for you
 * to distribute; users must reset their password on first login.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

function findServiceAccountKey(): string {
  const keys = ['FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_SERVICE_ACCOUNT_KEY'];
  for (const key of keys) {
    if (process.env[key]) return process.env[key]!;
  }
  const localFile = path.join(process.cwd(), 'service-account.json');
  if (fs.existsSync(localFile)) return fs.readFileSync(localFile, 'utf8');
  throw new Error('No Firebase service account found (env var or service-account.json).');
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// The app used a non-default named Firestore database (see git history of the
// now-removed firebase-applet-config.json). Override via env if yours differs.
const firestoreDatabaseId =
  process.env.FIRESTORE_DATABASE_ID || 'ai-studio-a3d5d0b4-314f-478c-a9b4-cb05e7fa0221';

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(findServiceAccountKey())) });
const firestore = admin.firestore();
if (firestoreDatabaseId) {
  firestore.settings({ databaseId: firestoreDatabaseId });
}

const supabaseAdmin = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const prisma = new PrismaClient();

function randomTempPassword(): string {
  return crypto.randomBytes(9).toString('base64url'); // 12 chars, url-safe
}

async function migrateUsers(): Promise<Map<string, string>> {
  const tempPasswords: Record<string, string> = {};
  const firestoreUidToSupabaseId = new Map<string, string>();

  const usersSnap = await firestore.collection('users').get();
  console.log(`Found ${usersSnap.size} Firestore users to migrate.`);

  for (const doc of usersSnap.docs) {
    const data = doc.data();

    // Idempotent: safe to re-run after a partial failure.
    const existingProfile = await prisma.profile.findUnique({ where: { number: data.number } });
    if (existingProfile) {
      console.log(`Skipping ${data.name} (${data.number}) — already migrated.`);
      firestoreUidToSupabaseId.set(doc.id, existingProfile.id);
      continue;
    }

    try {
      let authUserId: string;
      const tempPassword = randomTempPassword();

      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { must_reset_password: true, migrated_from_uid: doc.id },
      });

      if (created?.user) {
        authUserId = created.user.id;
        tempPasswords[data.number || data.email] = tempPassword;
      } else if (error?.message?.toLowerCase().includes('already been registered')) {
        // Leftover auth user from a prior partial run whose profile insert failed. Reuse it.
        const listResult = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        if (listResult.error) throw listResult.error;
        const users: { id: string; email?: string }[] = listResult.data.users;
        const match = users.find((u) => u.email === data.email);
        if (!match) throw new Error(`Auth user for ${data.email} reported as existing but not found.`);
        authUserId = match.id;
      } else {
        throw error || new Error('Unknown error creating auth user.');
      }

      firestoreUidToSupabaseId.set(doc.id, authUserId);

      await prisma.profile.create({
        data: {
          id: authUserId,
          name: data.name,
          email: data.email,
          number: data.number,
          stage: data.stage,
          team: data.team ?? null,
          role: data.role || 'scout',
          isVerified: data.isVerified ?? true,
          showWelcomeGroups: data.showWelcomeGroups ?? false,
          amountPaid: data.amountPaid ?? 0,
          attendance: data.attendance ?? {},
          badges: data.badges ?? {},
          pastWaves: data.pastWaves ?? {},
          passedBadges: data.passedBadges ?? [],
          permissions: data.permissions ?? null,
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
          joinDate: data.joinDate?.toDate?.() ?? new Date(),
        },
      });

      console.log(`Migrated ${data.name} (${data.number})`);
    } catch (err) {
      console.error(`Failed to migrate ${data.name} (${data.number}):`, err instanceof Error ? err.message : err);
    }
  }

  if (Object.keys(tempPasswords).length > 0) {
    const outPath = path.join(process.cwd(), 'migration-temp-passwords.json');
    let existing: Record<string, string> = {};
    if (fs.existsSync(outPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      } catch {
        // ignore unreadable/corrupt existing file, don't block writing new passwords
      }
    }
    fs.writeFileSync(outPath, JSON.stringify({ ...existing, ...tempPasswords }, null, 2));
    console.log(`Temp passwords written to ${outPath} — distribute and delete this file.`);
  } else {
    console.log('No new accounts created — migration-temp-passwords.json left untouched.');
  }

  return firestoreUidToSupabaseId;
}

async function migrateSettings() {
  for (const key of ['badges', 'general']) {
    const doc = await firestore.collection('settings').doc(key).get();
    if (!doc.exists) continue;
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: doc.data() as any },
      update: { value: doc.data() as any },
    });
    console.log(`Migrated settings/${key}`);
  }
}

async function migrateActivityLogs(uidMap: Map<string, string>) {
  const snap = await firestore.collection('activity_logs').get();
  let migrated = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const adminId = uidMap.get(data.adminId);
    if (!adminId) continue; // skip logs whose admin user wasn't migrated
    await prisma.activityLog.create({
      data: {
        action: data.action,
        details: data.details,
        adminId,
        adminName: data.adminName,
        targetUserId: data.targetUserId ? uidMap.get(data.targetUserId) ?? null : null,
        targetUserName: data.targetUserName ?? null,
        createdAt: data.timestamp?.toDate?.() ?? new Date(),
      },
    });
    migrated++;
  }
  console.log(`Migrated ${migrated}/${snap.size} activity_logs`);
}

async function migrateDeletedAccountLogs(uidMap: Map<string, string>) {
  const snap = await firestore.collection('deleted_accounts_logs').get();
  let migrated = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    await prisma.deletedAccountLog.create({
      data: {
        deletedScoutNumber: data.deletedScoutNumber ?? null,
        deletedBy: data.deletedByUid ? uidMap.get(data.deletedByUid) ?? null : null,
        deletedByName: data.deletedByName ?? null,
        createdAt: data.timestamp?.toDate?.() ?? new Date(),
      },
    });
    migrated++;
  }
  console.log(`Migrated ${migrated}/${snap.size} deleted_accounts_logs`);
}

async function main() {
  const uidMap = await migrateUsers();
  await migrateSettings();
  await migrateActivityLogs(uidMap);
  await migrateDeletedAccountLogs(uidMap);
  await prisma.$disconnect();
  console.log('Migration complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
