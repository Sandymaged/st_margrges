const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
admin.auth().updateUser('FAKE_UID', { password: '123456' })
  .then(() => console.log('success'))
  .catch(e => console.log('ERROR MESSAGE:', e.message, 'CODE:', e.code));
