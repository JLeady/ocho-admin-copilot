import { Router } from "express";
import crypto from "crypto";
import { readDb, writeDb, USER_ROLES } from "../db.js";
import { hashPassword, generateTempPassword } from "../password.js";
import { publicUser } from "../auth.js";

const router = Router();

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function activeOwnerCount(users, excludingId) {
  return users.filter((u) => u.role === "owner" && u.active && u.id !== excludingId).length;
}

router.get("/", async (req, res, next) => {
  try {
    const db = await readDb();
    res.json(db.users.map(publicUser));
  } catch (err) {
    next(err);
  }
});

// Creates an employee (or another owner) account with a random temp
// password. There's no email sending here — the temp password is returned
// once in this response for the admin to hand over directly (Slack, in
// person, however). The employee is forced to change it on first login.
router.post("/", async (req, res, next) => {
  try {
    const { name, email, role } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: "Name is required" });
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail.includes("@")) return res.status(400).json({ error: "A valid email is required" });
    if (role !== undefined && !USER_ROLES.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${USER_ROLES.join(", ")}` });
    }

    const db = await readDb();
    if (db.users.some((u) => u.email === normalizedEmail)) {
      return res.status(409).json({ error: "An account with that email already exists" });
    }

    const tempPassword = generateTempPassword();
    const user = {
      id: crypto.randomUUID(),
      name: String(name).trim(),
      email: normalizedEmail,
      role: role || "employee",
      passwordHash: hashPassword(tempPassword),
      mustChangePassword: true,
      active: true,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    await writeDb(db);

    res.status(201).json({ user: publicUser(user), tempPassword });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const db = await readDb();
    const user = db.users.find((u) => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const { name, role, active } = req.body || {};
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: "Name cannot be empty" });
      user.name = String(name).trim();
    }
    if (role !== undefined) {
      if (!USER_ROLES.includes(role)) return res.status(400).json({ error: `Role must be one of: ${USER_ROLES.join(", ")}` });
      if (role !== "owner" && user.role === "owner" && activeOwnerCount(db.users, user.id) === 0) {
        return res.status(400).json({ error: "There must be at least one owner account" });
      }
      user.role = role;
    }
    if (active !== undefined) {
      if (!active && user.role === "owner" && activeOwnerCount(db.users, user.id) === 0) {
        return res.status(400).json({ error: "There must be at least one active owner account" });
      }
      user.active = !!active;
    }

    await writeDb(db);
    res.json(publicUser(user));
  } catch (err) {
    next(err);
  }
});

// Issues a fresh temp password (e.g. someone's locked out) — returned once,
// same as account creation.
router.post("/:id/reset-password", async (req, res, next) => {
  try {
    const db = await readDb();
    const user = db.users.find((u) => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const tempPassword = generateTempPassword();
    user.passwordHash = hashPassword(tempPassword);
    user.mustChangePassword = true;
    await writeDb(db);

    res.json({ user: publicUser(user), tempPassword });
  } catch (err) {
    next(err);
  }
});

export default router;
