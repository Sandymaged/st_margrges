import admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

async function readSettings() {
  const doc = await db.collection('settings').doc('badges').get();
  console.log(JSON.stringify(doc.data(), null, 2));
}

readSettings().catch(console.error);
