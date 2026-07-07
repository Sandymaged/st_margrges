import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";

// Use environment variables (Vercel will provide these in production)
dotenv.config();

import statusHandler from "./api/admin/status.js";
import deleteUserHandler from "./api/admin/delete-user.js";
import updatePhoneHandler from "./api/admin/update-phone.js";
import updatePasswordHandler from "./api/admin/update-password.js";
import createAccountHandler from "./api/admin/create-account.js";

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

  // Admin routes delegate to the same handlers Vercel uses in production
  // (api/admin/*.ts) so there is a single source of truth for this logic.
  app.all(["/api/admin/status", "/api/admin/status/"], (req, res) => statusHandler(req as any, res as any));
  app.all(["/api/admin/delete-user", "/api/admin/delete-user/"], (req, res) => deleteUserHandler(req as any, res as any));
  app.all(["/api/admin/update-phone", "/api/admin/update-phone/"], (req, res) => updatePhoneHandler(req as any, res as any));
  app.all(["/api/admin/update-password", "/api/admin/update-password/"], (req, res) => updatePasswordHandler(req as any, res as any));
  app.all(["/api/admin/create-account", "/api/admin/create-account/"], (req, res) => createAccountHandler(req as any, res as any));

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
