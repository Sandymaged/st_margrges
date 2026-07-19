import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";

dotenv.config();

import statusHandler from "./api/admin/status.js";
import deleteUserHandler from "./api/admin/delete-user.js";
import updatePhoneHandler from "./api/admin/update-phone.js";
import updatePasswordHandler from "./api/admin/update-password.js";
import createAccountHandler from "./api/admin/create-account.js";
import loginHandler from "./api/auth/login.js";
import registerHandler from "./api/auth/register.js";
import logoutHandler from "./api/auth/logout.js";
import meHandler from "./api/auth/me.js";
import rpcHandler from "./api/rpc.js";
import queryHandler from "./api/query.js";
import appSettingsHandler from "./api/app-settings.js";
import sseSubscribeHandler from "./api/sse/subscribe.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  const isProd = process.env.NODE_ENV === "production";

  app.set("trust proxy", 1);

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
  });

  app.use("/api", apiLimiter);

  const allowedOrigins = process.env.ALLOWED_ADMIN_ORIGIN 
    ? [process.env.ALLOWED_ADMIN_ORIGIN] 
    : (process.env.APP_URL ? [process.env.APP_URL] : ['http://localhost:3000']);
  
  app.use("/api/admin", cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ['GET', 'POST'],
    credentials: true
  }));

  app.use(express.json());

  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  app.get("/api/ping", (req, res) => {
    res.json({ status: "pong", timestamp: new Date().toISOString() });
  });

  // Auth routes
  app.all(["/api/auth/login", "/api/auth/login/"], (req, res) => loginHandler(req as any, res as any));
  app.all(["/api/auth/register", "/api/auth/register/"], (req, res) => registerHandler(req as any, res as any));
  app.all(["/api/auth/logout", "/api/auth/logout/"], (req, res) => logoutHandler(req as any, res as any));
  app.all(["/api/auth/me", "/api/auth/me/"], (req, res) => meHandler(req as any, res as any));

  // RPC and Query proxy routes
  app.all(["/api/rpc", "/api/rpc/"], (req, res) => rpcHandler(req as any, res as any));
  app.all(["/api/query", "/api/query/"], (req, res) => queryHandler(req as any, res as any));

  // App settings (public read-only configuration)
  app.all(["/api/app-settings", "/api/app-settings/"], (req, res) => appSettingsHandler(req as any, res as any));

  // SSE endpoint for real-time profile updates
  app.get(["/api/sse/subscribe", "/api/sse/subscribe/"], (req, res) => sseSubscribeHandler(req as any, res as any));

  // Admin routes
  app.all(["/api/admin/status", "/api/admin/status/"], (req, res) => statusHandler(req as any, res as any));
  app.all(["/api/admin/delete-user", "/api/admin/delete-user/"], (req, res) => deleteUserHandler(req as any, res as any));
  app.all(["/api/admin/update-phone", "/api/admin/update-phone/"], (req, res) => updatePhoneHandler(req as any, res as any));
  app.all(["/api/admin/update-password", "/api/admin/update-password/"], (req, res) => updatePasswordHandler(req as any, res as any));
  app.all(["/api/admin/create-account", "/api/admin/create-account/"], (req, res) => createAccountHandler(req as any, res as any));

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
