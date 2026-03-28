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

    const { uid, phone, adminToken } = req.body;

    if (!uid && !phone) {
      return res.status(400).json({ error: "UID or Phone is required." });
    }

    try {
      // Verify the requester is an admin
      const decodedToken = await admin.auth().verifyIdToken(adminToken);
      
      // Check if the requester is the super admin
      const isSuperAdmin = decodedToken.email === 'begolbahaa98@gmail.com' || decodedToken.email === '01555165366@scouts.local' || decodedToken.phone_number === '+201555165366';
      
      if (!isSuperAdmin) {
        return res.status(403).json({ error: "Unauthorized. Only Super Admin can delete users from Auth." });
      }

      if (uid) {
        await admin.auth().deleteUser(uid);
        return res.json({ message: `Successfully deleted user ${uid} from Firebase Authentication.` });
      } else if (phone) {
        const fakeEmail = `${phone}@scouts.local`;
        try {
          const userRecord = await admin.auth().getUserByEmail(fakeEmail);
          await admin.auth().deleteUser(userRecord.uid);
          return res.json({ message: `Successfully deleted user with phone ${phone} from Firebase Authentication.` });
        } catch (error: any) {
          if (error.code === 'auth/user-not-found') {
            return res.status(404).json({ error: "User not found in Authentication." });
          }
          throw error;
        }
      }
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
