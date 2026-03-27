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
try {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount) {
    const parsedAccount = JSON.parse(serviceAccount);
    adminApp = admin.initializeApp({
      credential: admin.credential.cert(parsedAccount),
    });
    console.log("Firebase Admin initialized successfully.");
  } else {
    console.warn("FIREBASE_SERVICE_ACCOUNT not found. Admin features will be disabled.");
  }
} catch (error) {
  console.error("Error initializing Firebase Admin:", error);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/admin/delete-user", async (req, res) => {
    if (!adminApp) {
      return res.status(500).json({ error: "Firebase Admin not initialized." });
    }

    const { uid, adminToken } = req.body;

    if (!uid) {
      return res.status(400).json({ error: "UID is required." });
    }

    try {
      // Verify the requester is an admin
      const decodedToken = await admin.auth().verifyIdToken(adminToken);
      const userRecord = await admin.auth().getUser(decodedToken.uid);
      
      // Check if the requester is the super admin or has admin role in Firestore
      // For simplicity and security, we check if they are the super admin by email or phone
      const isSuperAdmin = decodedToken.email === 'begolbahaa98@gmail.com' || decodedToken.email === '01555165366@scouts.local' || decodedToken.phone_number === '+201555165366';
      
      if (!isSuperAdmin) {
        // You could also check Firestore here, but for now we'll stick to super admin or custom claims if you had them
        // Let's assume for now only super admin can call this via API for safety
        return res.status(403).json({ error: "Unauthorized. Only Super Admin can delete users from Auth." });
      }

      await admin.auth().deleteUser(uid);
      res.json({ message: `Successfully deleted user ${uid} from Firebase Authentication.` });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: error.message || "Failed to delete user." });
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
