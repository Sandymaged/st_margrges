import admin from 'firebase-admin';

admin.initializeApp();

const db = admin.firestore();

async function read() {
  const docSnap = await db.collection('settings').doc('badges').get();
  const data = docSnap.data();
  if (data) {
    console.log("groupLinks:", JSON.stringify(data.groupLinks, null, 2));
  }
}
read();
