import * as admin from 'firebase-admin';

export function initAdmin() {
  let initError: string | null = null;
  
  if (!admin.apps.length) {
    try {
      let serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT;
      
      if (!serviceAccountRaw) {
        initError = 'FIREBASE_SERVICE_ACCOUNT_KEY not found in environment variables';
        console.error(initError);
      } else {
        let serviceAccount;
        try {
          serviceAccount = JSON.parse(serviceAccountRaw);
        } catch (e) {
          try {
            const fixed = serviceAccountRaw.replace(/\n/g, '\\n');
            serviceAccount = JSON.parse(fixed);
          } catch (e2) {
            initError = 'Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY. Ensure it is a valid JSON string.';
            throw new Error(initError);
          }
        }

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log('Firebase Admin initialized successfully');
      }
    } catch (error: any) {
      initError = error.message || String(error);
      console.error('Firebase Admin initialization error:', error);
    }
  }

  return {
    initialized: admin.apps.length > 0,
    envSet: !!(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY),
    envKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? 'FIREBASE_SERVICE_ACCOUNT_KEY' : (process.env.FIREBASE_SERVICE_ACCOUNT ? 'FIREBASE_SERVICE_ACCOUNT' : null),
    error: initError
  };
}

export { admin };
