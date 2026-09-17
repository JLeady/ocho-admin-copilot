import { Router } from "express";
import crypto from "crypto";
import { readDb, writeDb } from "../db.js";
import { hashPassword, verifyPassword } from "../password.js";
import { requireAuth, publicUser } from "../auth.js";
import { isEmailConfigured, sendPasswordResetEmail } from "../email.js";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const router = Router();

const MIN_PASSWORD_LENGTH = 8;

// In-memory login throttling, keyed by email (account-based, not IP — an
// office sharing one IP shouldn't be able to lock each other out). Fine for
// a single-process local app; move to a shared store if this ever runs
// behind multiple instances.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map(); // email -> { count, windowStart, lockedUntil }

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getRecord(key) {
  return attempts.get(key) || { count: 0, windowStart: Date.now(), lockedUntil: 0 };
}

function checkThrottle(key) {
  const now = Date.now();
  const rec = getRecord(key);
  if (rec.lockedUntil > now) {
    const minsLeft = Math.ceil((rec.lockedUntil - now) / 60000);
    return `Too many failed attempts. Try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`;
  }
  if (now - rec.windowStart > WINDOW_MS) {
    rec.count = 0;
    rec.windowStart = now;
  }
  attempts.set(key, rec);
  return null;
}

function recordFailure(key) {
  const rec = getRecord(key);
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCK_MS;
    rec.count = 0;
  }
  attempts.set(key, rec);
}

// ---- first-run setup ----
// "Admin creates accounts" only works once an admin exists. If there are no
// users at all yet, the frontend shows a one-time "create your account"
// screen instead of the login form. Once a user exists, this always 409s.

router.get("/bootstrap-status", async (req, res, next) => {
  try {
    const db = await readDb();
    res.json({ needsSetup: db.users.length === 0 });
  } catch (err) {
    next(err);
  }
});

router.post("/bootstrap", async (req, res, next) => {
  try {
    const db = await readDb();
    if (db.users.length > 0) {
      return res.status(409).json({ error: "Setup has already been completed" });
    }
    const { name, email, password } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: "Name is required" });
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail.includes("@")) return res.status(400).json({ error: "A valid email is required" });
    if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const user = {
      id: crypto.randomUUID(),
      name: String(name).trim(),
      email: normalizedEmail,
      role: "owner",
      passwordHash: hashPassword(password),
      mustChangePassword: false,
      active: true,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    await writeDb(db);

    req.session.userId = user.id;
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ---- login/logout ----

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const throttleError = checkThrottle(normalizedEmail);
    if (throttleError) return res.status(429).json({ error: throttleError });

    const db = await readDb();
    const user = db.users.find((u) => u.email === normalizedEmail);
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      recordFailure(normalizedEmail);
      return res.status(401).json({ error: "Incorrect email or password" });
    }

    attempts.delete(normalizedEmail);
    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("ocho.sid");
    res.json({ ok: true });
  });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ---- forgot password ----
// Lets the frontend know up front whether a reset email would actually go
// anywhere, so it can show "check your inbox" or "ask your owner instead"
// rather than promising an email that was never configured to send.
router.get("/email-status", (req, res) => {
  res.json({ configured: isEmailConfigured() });
});

router.post("/forgot-password", async (req, res, next) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);
    if (!normalizedEmail) return res.status(400).json({ error: "Email is required" });

    const throttleError = checkThrottle(`forgot:${normalizedEmail}`);
    if (throttleError) return res.status(429).json({ error: throttleError });

    const db = await readDb();
    const user = db.users.find((u) => u.email === normalizedEmail && u.active);

    // Same response whether or not the email matched a real account — never
    // let this endpoint reveal which emails have accounts.
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      user.resetToken = token;
      user.resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
      await writeDb(db);

      const appUrl = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
      const resetUrl = `${appUrl}/?token=${token}`;
      try {
        await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
      } catch (sendErr) {
        console.error("Failed to send password reset email:", sendErr);
      }
    } else {
      recordFailure(`forgot:${normalizedEmail}`); // keeps timing similar whether or not the account exists
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Missing or invalid reset token" });
    }
    if (!newPassword || String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const db = await readDb();
    const user = db.users.find((u) => u.resetToken === token);
    if (!user || !user.resetTokenExpiresAt || new Date(user.resetTokenExpiresAt) < new Date()) {
      return res.status(400).json({ error: "This reset link is invalid or has expired — request a new one." });
    }

    user.passwordHash = hashPassword(newPassword);
    user.mustChangePassword = false;
    user.resetToken = null;
    user.resetTokenExpiresAt = null;
    await writeDb(db);

    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ---- password change ----
// Same endpoint covers a voluntary change and the mandatory first-login
// change after an admin issues a temp password — both require knowing the
// current password.

router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!verifyPassword(currentPassword || "", req.user.passwordHash)) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    if (!newPassword || String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const db = await readDb();
    const user = db.users.find((u) => u.id === req.user.id);
    user.passwordHash = hashPassword(newPassword);
    user.mustChangePassword = false;
    await writeDb(db);

    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

export default router;
