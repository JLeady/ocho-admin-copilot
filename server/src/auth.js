import session from "express-session";
import FileStoreFactory from "session-file-store";
import path from "path";
import { fileURLToPath } from "url";
import { readDb } from "./db.js";

const FileStore = FileStoreFactory(session);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = path.join(__dirname, "..", "data", "sessions");

export function sessionMiddleware() {
  return session({
    // Sessions used to live only in server memory, which express-session's
    // own docs say isn't meant for real use — every login was wiped the
    // instant the server process restarted (e.g. `node --watch` picking up
    // a code change, or the machine rebooting). Persisting them to disk
    // means a restart no longer force-logs everyone out.
    store: new FileStore({
      path: SESSIONS_DIR,
      ttl: 60 * 60 * 24 * 7, // 7 days, matches the cookie below
      retries: 1,
      logFn: () => {}, // quiet — errors still surface via the callback/throw paths
      secret: process.env.SESSION_SECRET, // encrypts session files at rest
    }),
    secret: process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me",
    name: "ocho.sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  });
}

// Strips the password hash before a user object ever leaves the server.
export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

// Loads the logged-in user onto req.user. A missing/deactivated user (e.g.
// an admin deactivated them mid-session) is treated the same as "not
// logged in" rather than crashing routes that assume req.user exists.
export async function requireAuth(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  try {
    const db = await readDb();
    const user = db.users.find((u) => u.id === userId);
    if (!user || !user.active) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// Mount after requireAuth. Employee-vs-owner is the only role split in this
// app — owners manage the team, everyone (owner or employee) shares the
// same client data.
export function requireOwner(req, res, next) {
  if (req.user?.role !== "owner") {
    return res.status(403).json({ error: "Only an owner account can do this" });
  }
  next();
}
