import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
let adminApp: admin.app.App | null = null;
let initError: string | null = null;
try {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountRaw) {
    let parsedAccount;
    try {
      parsedAccount = JSON.parse(serviceAccountRaw);
    } catch (e) {
      // Try to fix common JSON issues like unescaped newlines in private_key
      try {
        const fixed = serviceAccountRaw.replace(/\n/g, '\\n');
        parsedAccount = JSON.parse(fixed);
      } catch (e2) {
        initError = 'Failed to parse FIREBASE_SERVICE_ACCOUNT. Ensure it is a valid JSON string.';
        throw new Error(initError);
      }
    }

    adminApp = admin.initializeApp({
      credential: admin.credential.cert(parsedAccount),
    });
    console.log("Firebase Admin initialized successfully. Ready for advanced features.");
  } else {
    initError = "FIREBASE_SERVICE_ACCOUNT not found. Admin features will be disabled.";
    console.warn(initError);
  }
} catch (error: any) {
  initError = error.message || String(error);
  console.error("Error initializing Firebase Admin:", error);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Request logger for API
  app.use("/api", (req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // Health check
  app.get("/api/ping", (req, res) => {
    res.json({ status: "pong", timestamp: new Date().toISOString() });
  });

  app.get("/api/admin/status", (req, res) => {
    res.json({ 
      initialized: !!adminApp,
      envSet: !!(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_KEY),
      envKey: process.env.FIREBASE_SERVICE_ACCOUNT ? 'FIREBASE_SERVICE_ACCOUNT' : (process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? 'FIREBASE_SERVICE_ACCOUNT_KEY' : null),
      error: initError
    });
  });

  // API Routes
  app.post(["/api/admin/delete-user", "/api/admin/delete-user/"], async (req, res) => {
    console.log("Received delete-user request:", req.body.phone || req.body.uid);
    if (!adminApp) {
      console.error("Admin SDK not initialized");
      return res.status(500).json({ error: "Firebase Admin not initialized. Check server logs for details." });
    }

    const { uid, phone, adminToken } = req.body;

    if (!uid && !phone) {
      return res.status(400).json({ error: "UID or Phone is required." });
    }

    try {
      // Verify the requester is an admin
      const decodedToken = await admin.auth().verifyIdToken(adminToken);
      
      // Check if the requester is the super admin
      const isSuperAdmin = decodedToken.email === 'begolbahaa98@gmail.com' || decodedToken.email === '01555165366@scouts.local' || decodedToken.phone_number === '+201555165366';
      
      let canDelete = isSuperAdmin;
      
      if (!canDelete) {
        // Check Firestore permissions
        const requesterDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
        if (requesterDoc.exists) {
          const data = requesterDoc.data();
          if (data?.role === 'admin' && data?.permissions?.canDeleteAccounts) {
            canDelete = true;
          }
        }
      }
      
      if (!canDelete) {
        return res.status(403).json({ error: "Unauthorized. Only authorized admins can delete users." });
      }

      let deletedFromAuth = false;
      let deletedFromFirestore = false;

      if (uid) {
        try {
          await admin.auth().deleteUser(uid);
          deletedFromAuth = true;
        } catch (error: any) {
          if (error.code !== 'auth/user-not-found') throw error;
        }
        
        try {
          await admin.firestore().collection('users').doc(uid).delete();
          deletedFromFirestore = true;
        } catch (error) {
          console.error("Error deleting from Firestore by UID:", error);
        }
      } else if (phone) {
        const fakeEmail = `${phone}@scouts.local`;
        try {
          const userRecord = await admin.auth().getUserByEmail(fakeEmail);
          await admin.auth().deleteUser(userRecord.uid);
          deletedFromAuth = true;
          
          await admin.firestore().collection('users').doc(userRecord.uid).delete();
          deletedFromFirestore = true;
        } catch (error: any) {
          if (error.code !== 'auth/user-not-found') throw error;
        }

        // Try to find and delete by phone number in Firestore if auth user not found or just to be sure
        const usersRef = admin.firestore().collection('users');
        const snapshot = await usersRef.where('number', '==', phone).get();
        if (!snapshot.empty) {
          const batch = admin.firestore().batch();
          snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          deletedFromFirestore = true;
        }
      }

      if (deletedFromAuth || deletedFromFirestore) {
        return res.json({ message: `Successfully deleted user. Auth: ${deletedFromAuth}, Firestore: ${deletedFromFirestore}` });
      } else {
        return res.status(404).json({ error: "User not found in Authentication or Firestore." });
      }

    } catch (error: any) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: error.message || "Failed to delete user." });
    }
  });

  app.post(["/api/admin/update-password", "/api/admin/update-password/"], async (req, res) => {
    console.log("Received update-password request:", req.body.uid);
    if (!adminApp) {
      console.error("Admin SDK not initialized");
      return res.status(500).json({ error: "Firebase Admin not initialized. Check server logs for details." });
    }

    const { uid, newPassword, adminToken } = req.body;

    if (!uid || !newPassword) {
      return res.status(400).json({ error: "UID and newPassword are required." });
    }

    try {
      // Verify the requester is an admin
      const decodedToken = await admin.auth().verifyIdToken(adminToken);
      
      // Check if the requester is the super admin
      const isSuperAdmin = decodedToken.email === 'begolbahaa98@gmail.com' || decodedToken.email === '01555165366@scouts.local' || decodedToken.phone_number === '+201555165366';
      
      if (!isSuperAdmin) {
        return res.status(403).json({ error: "Unauthorized. Only super admins can change passwords." });
      }

      await admin.auth().updateUser(uid, {
        password: newPassword
      });

      return res.json({ message: "Successfully updated user password." });

    } catch (error: any) {
      console.error("Error updating password:", error);
      res.status(500).json({ error: error.message || "Failed to update password." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
