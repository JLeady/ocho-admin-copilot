import session from "express-session";
import FileStoreFactory from "session-file-store";
import path from "path";
import { fileURLToPath } from "url";
import { readDb } from "./db.js";

const FileStore = FileStoreFactory(session);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Mirrors the same OCHO_DATA_DIR override as db.js, so sessions live next to
// db.json whichever folder that ends up being (see electron/main.js).
const DATA_DIR = process.env.OCHO_DATA_DIR || path.join(__dirname, "..", "data");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");

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

// Strips secrets before a user object ever leaves the server — the
// password hash, and the reset token (which is only ever meant to be used
// via the emailed link, never displayed or handed back in-app).
export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, resetToken, resetTokenExpiresAt, ...safe } = user;
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
    // Sessions created before "log out of all other sessions" existed have
    // no sessionVersion of their own — treat that as version 0, matching a
    // fresh user's default, so shipping this feature doesn't log everyone
    // out. Only sessions issued before a deliberate "log out everywhere"
    // fall out of sync and get rejected here.
    if ((req.session.sessionVersion ?? 0) !== user.sessionVersion) {
      return req.session.destroy(() => res.status(401).json({ error: "Not authenticated" }));
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
