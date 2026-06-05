import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";

// Use environment variables (Vercel will provide these in production)
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

  // Enhance security with Helmet
  // Note: we customize the CSP to be compatible with Vite in dev, and AI Studio
  const isProd = process.env.NODE_ENV === "production";

  app.set("trust proxy", 1);

  // Rate limiting to prevent abuse
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: { error: "Too many requests, please try again later." }
  });

  // Apply rate limiter specifically to /api routes
  app.use("/api", apiLimiter);

  // Apply CORS to admin API routes to only allow same-origin or specified domain
  const allowedOrigins = process.env.ALLOWED_ADMIN_ORIGIN 
    ? [process.env.ALLOWED_ADMIN_ORIGIN] 
    : (process.env.APP_URL ? [process.env.APP_URL] : ['http://localhost:3000']);
  
  app.use("/api/admin", cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ['GET', 'POST'],
    credentials: true
  }));

  app.use(express.json());

  // Request logger for API
  app.use("/api", (req, res, next) => {
    // Prevent caching for API routes
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
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
      const superAdminEmail = process.env.VITE_SUPER_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL;
      const superAdminPhone = process.env.VITE_SUPER_ADMIN_PHONE || process.env.SUPER_ADMIN_PHONE;
      
      const isSuperAdmin = 
        (superAdminEmail && decodedToken.email === superAdminEmail) || 
        (superAdminPhone && decodedToken.email === `${superAdminPhone}@scouts.local`) || 
        (superAdminPhone && (decodedToken.phone_number === `+20${superAdminPhone.replace(/^0+/, '')}` || decodedToken.phone_number === `+${superAdminPhone}`));
      
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
      const superAdminEmail = process.env.VITE_SUPER_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL;
      const superAdminPhone = process.env.VITE_SUPER_ADMIN_PHONE || process.env.SUPER_ADMIN_PHONE;
      
      const isSuperAdmin = 
        (superAdminEmail && decodedToken.email === superAdminEmail) || 
        (superAdminPhone && decodedToken.email === `${superAdminPhone}@scouts.local`) || 
        (superAdminPhone && (decodedToken.phone_number === `+20${superAdminPhone.replace(/^0+/, '')}` || decodedToken.phone_number === `+${superAdminPhone}`));
      
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
      const superAdminEmail = process.env.VITE_SUPER_ADMIN_EMAIL || process.env.SUPER_ADMIN_EMAIL;
      const superAdminPhone = process.env.VITE_SUPER_ADMIN_PHONE || process.env.SUPER_ADMIN_PHONE;
      
      const isSuperAdmin = 
        (superAdminEmail && decodedToken.email === superAdminEmail) || 
        (superAdminPhone && decodedToken.email === `${superAdminPhone}@scouts.local`) || 
        (superAdminPhone && (decodedToken.phone_number === `+20${superAdminPhone.replace(/^0+/, '')}` || decodedToken.phone_number === `+${superAdminPhone}`));
      
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
