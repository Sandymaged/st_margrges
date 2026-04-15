import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { initAdmin, admin } from "./api/admin/lib/admin.js";

// Initialize Firebase Admin
const status = initAdmin();
const adminApp = (status.initialized && admin && typeof admin.app === 'function') ? admin.app() : null;
const initError = status.error;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Security Headers
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com; frame-src 'self' https://*.firebaseapp.com;"
    );
    // Note: X-Frame-Options is omitted here to allow AI Studio preview iframes. 
    // It is enforced in vercel.json for the Vercel deployment.
    next();
  });

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
    res.json(status);
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

  app.post(["/api/admin/update-phone", "/api/admin/update-phone/"], async (req, res) => {
    console.log("Received update-phone request:", req.body.uid);
    if (!adminApp) {
      console.error("Admin SDK not initialized");
      return res.status(500).json({ error: "Firebase Admin not initialized. Check server logs for details." });
    }

    const { uid, newPhone, adminToken } = req.body;

    if (!uid || !newPhone) {
      return res.status(400).json({ error: "UID and newPhone are required." });
    }

    try {
      // Verify the requester is an admin
      const decodedToken = await admin.auth().verifyIdToken(adminToken);
      
      // Check if the requester is the super admin
      const isSuperAdmin = decodedToken.email === 'begolbahaa98@gmail.com' || decodedToken.email === '01555165366@scouts.local' || decodedToken.phone_number === '+201555165366';
      
      if (!isSuperAdmin) {
        return res.status(403).json({ error: "Unauthorized. Only super admins can change phone numbers." });
      }

      const fakeEmail = `${newPhone}@scouts.local`;
      await admin.auth().updateUser(uid, {
        email: fakeEmail
      });

      return res.json({ message: "Successfully updated user phone (email)." });

    } catch (error: any) {
      console.error("Error updating phone:", error);
      res.status(500).json({ error: error.message || "Failed to update phone." });
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
