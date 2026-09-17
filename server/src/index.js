import "dotenv/config";
import express from "express";
import path from "path";
import fssync from "fs";
import { fileURLToPath } from "url";
import { sessionMiddleware, requireAuth, requireOwner } from "./auth.js";
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import clientsRoutes from "./routes/clients.js";
import aiRoutes from "./routes/ai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: "1mb" }));
app.use(sessionMiddleware());

app.use("/api/auth", authRoutes);
// Team management (add/deactivate accounts, reset passwords) is owner-only;
// everything else is shared across every logged-in user.
app.use("/api/users", requireAuth, requireOwner, usersRoutes);
app.use("/api/clients", requireAuth, clientsRoutes);
app.use("/api/ai", requireAuth, aiRoutes);

// If the client has been built (npm run build), serve it — lets the whole
// app run from `npm start` as a single process. In dev, Vite serves the
// frontend separately and proxies /api here (see client/vite.config.js).
const clientDist = path.join(__dirname, "..", "..", "client", "dist");
if (fssync.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Central error handler — Express 5 forwards rejected promises from async
// route handlers here automatically. Every error thrown in our own route
// handlers and db.js carries a message that's safe to show the user (no
// stack traces, no secrets), so pass it through instead of a generic string.
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  res.status(500).json({ error: err.message || "Unexpected server error." });
});

app.listen(PORT, () => {
  console.log(`Ocho AI server listening on http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("Warning: ANTHROPIC_API_KEY is not set — AI drafting will fail until you add it to server/.env");
  }
});
