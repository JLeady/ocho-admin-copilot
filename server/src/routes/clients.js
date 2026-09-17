import { Router } from "express";
import crypto from "crypto";
import { readDb, writeDb, CLIENT_STATUSES, BILLING_STATUSES, CONTENT_PLATFORMS, CONTENT_STATUSES } from "../db.js";

const router = Router();

function uid() {
  return crypto.randomUUID();
}

function findClient(db, id) {
  return db.clients.find((c) => c.id === id);
}

// Accepts whatever contact rows the client sends, keeps existing ids where
// given (so edits don't create duplicate people), assigns fresh ids to new
// ones, and drops any row without a name. Returns undefined (meaning "don't
// touch this field") when the input isn't an array at all.
function normalizeContactsInput(input) {
  if (!Array.isArray(input)) return undefined;
  return input
    .map((c) => ({
      id: c?.id || uid(),
      name: String(c?.name || "").trim(),
      role: String(c?.role || "").trim(),
    }))
    .filter((c) => c.name);
}

// Validates a partial billing patch. Returns { error } or { value }, so the
// caller can 400 with a clear message instead of silently accepting junk.
function parseBillingInput(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Billing must be an object" };
  }
  const out = {};
  if (input.monthlyRetainer !== undefined) {
    if (input.monthlyRetainer !== null && typeof input.monthlyRetainer !== "number") {
      return { error: "monthlyRetainer must be a number or null" };
    }
    out.monthlyRetainer = input.monthlyRetainer;
  }
  if (input.status !== undefined) {
    if (!BILLING_STATUSES.includes(input.status)) {
      return { error: `Billing status must be one of: ${BILLING_STATUSES.join(", ")}` };
    }
    out.status = input.status;
  }
  if (input.renewalDate !== undefined) {
    out.renewalDate = input.renewalDate || null;
  }
  return { value: out };
}

// ---- clients ----

router.get("/", async (req, res, next) => {
  try {
    const db = await readDb();
    res.json(db.clients.filter((c) => !c.deletedAt));
  } catch (err) {
    next(err);
  }
});

// Soft-deleted clients — powers the "Trash" view so deletes are recoverable.
router.get("/deleted", async (req, res, next) => {
  try {
    const db = await readDb();
    const deleted = db.clients
      .filter((c) => c.deletedAt)
      .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
    res.json(deleted);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { name, businessType, contacts, status, goals, billing } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Client name is required" });
    }
    if (status !== undefined && !CLIENT_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${CLIENT_STATUSES.join(", ")}` });
    }
    let billingValue = { monthlyRetainer: null, status: "current", renewalDate: null };
    if (billing !== undefined) {
      const parsed = parseBillingInput(billing);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      billingValue = { ...billingValue, ...parsed.value };
    }
    const db = await readDb();
    const client = {
      id: uid(),
      name: String(name).trim(),
      businessType: businessType || "Other",
      contacts: normalizeContactsInput(contacts) || [],
      status: status || "active",
      goals: (goals || "").trim(),
      createdBy: { id: req.user.id, name: req.user.name },
      createdAt: new Date().toISOString(),
      deletedAt: null,
      notes: [],
      drafts: [],
      billing: billingValue,
      calendar: [],
    };
    db.clients.push(client);
    await writeDb(db);
    res.status(201).json(client);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const db = await readDb();
    const client = findClient(db, req.params.id);
    if (!client || client.deletedAt) return res.status(404).json({ error: "Client not found" });

    const { name, businessType, contacts, status, goals, billing } = req.body || {};
    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({ error: "Client name cannot be empty" });
      }
      client.name = String(name).trim();
    }
    if (businessType !== undefined) client.businessType = businessType;
    if (contacts !== undefined) {
      const normalized = normalizeContactsInput(contacts);
      if (normalized === undefined) return res.status(400).json({ error: "Contacts must be an array" });
      client.contacts = normalized;
    }
    if (status !== undefined) {
      if (!CLIENT_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Status must be one of: ${CLIENT_STATUSES.join(", ")}` });
      }
      client.status = status;
    }
    if (goals !== undefined) client.goals = String(goals).trim();
    if (billing !== undefined) {
      const parsed = parseBillingInput(billing);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      client.billing = { ...client.billing, ...parsed.value };
    }
    client.updatedAt = new Date().toISOString();

    await writeDb(db);
    res.json(client);
  } catch (err) {
    next(err);
  }
});

// Soft delete — moves the client to Trash. Recoverable via POST /:id/restore.
router.delete("/:id", async (req, res, next) => {
  try {
    const db = await readDb();
    const client = findClient(db, req.params.id);
    if (!client || client.deletedAt) return res.status(404).json({ error: "Client not found" });
    client.deletedAt = new Date().toISOString();
    await writeDb(db);
    res.json(client);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/restore", async (req, res, next) => {
  try {
    const db = await readDb();
    const client = findClient(db, req.params.id);
    if (!client || !client.deletedAt) return res.status(404).json({ error: "Deleted client not found" });
    client.deletedAt = null;
    await writeDb(db);
    res.json(client);
  } catch (err) {
    next(err);
  }
});

// Permanent delete — only reachable from the Trash view. Can't be undone
// (aside from restoring one of the automatic file backups by hand).
router.delete("/:id/permanent", async (req, res, next) => {
  try {
    const db = await readDb();
    const idx = db.clients.findIndex((c) => c.id === req.params.id && c.deletedAt);
    if (idx === -1) return res.status(404).json({ error: "Deleted client not found" });
    db.clients.splice(idx, 1);
    await writeDb(db);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---- notes (touchpoints) ----

router.post("/:id/notes", async (req, res, next) => {
  try {
    const { text } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: "Note text is required" });
    }
    const db = await readDb();
    const client = findClient(db, req.params.id);
    if (!client || client.deletedAt) return res.status(404).json({ error: "Client not found" });

    const note = {
      id: uid(),
      date: new Date().toISOString(),
      text: String(text).trim(),
      author: { id: req.user.id, name: req.user.name },
    };
    client.notes.push(note);
    await writeDb(db);
    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/notes/:noteId", async (req, res, next) => {
  try {
    const { text } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: "Note text is required" });
    }
    const db = await readDb();
    const client = findClient(db, req.params.id);
    if (!client || client.deletedAt) return res.status(404).json({ error: "Client not found" });

    const note = client.notes.find((n) => n.id === req.params.noteId);
    if (!note) return res.status(404).json({ error: "Note not found" });

    note.text = String(text).trim();
    note.updatedAt = new Date().toISOString();
    await writeDb(db);
    res.json(note);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id/notes/:noteId", async (req, res, next) => {
  try {
    const db = await readDb();
    const client = findClient(db, req.params.id);
    if (!client || client.deletedAt) return res.status(404).json({ error: "Client not found" });

    const idx = client.notes.findIndex((n) => n.id === req.params.noteId);
    if (idx === -1) return res.status(404).json({ error: "Note not found" });

    client.notes.splice(idx, 1);
    await writeDb(db);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---- drafts (AI-generated email/report history) ----
// Drafts are created by POST /api/ai/email and /api/ai/report (see
// server/src/routes/ai.js — they call db.appendDraft after a successful
// generation) and returned embedded on the client object, same as notes.
// This route only handles removing one from history.

router.delete("/:id/drafts/:draftId", async (req, res, next) => {
  try {
    const db = await readDb();
    const client = findClient(db, req.params.id);
    if (!client || client.deletedAt) return res.status(404).json({ error: "Client not found" });

    const idx = client.drafts.findIndex((d) => d.id === req.params.draftId);
    if (idx === -1) return res.status(404).json({ error: "Draft not found" });

    client.drafts.splice(idx, 1);
    await writeDb(db);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---- content calendar ----

router.post("/:id/calendar", async (req, res, next) => {
  try {
    const { title, platform, date, notes } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "Title is required" });
    }
    if (platform !== undefined && !CONTENT_PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: `Platform must be one of: ${CONTENT_PLATFORMS.join(", ")}` });
    }
    const db = await readDb();
    const client = findClient(db, req.params.id);
    if (!client || client.deletedAt) return res.status(404).json({ error: "Client not found" });

    const item = {
      id: uid(),
      title: String(title).trim(),
      platform: platform || "Other",
      date: date || null,
      status: "planned",
      notes: (notes || "").trim(),
    };
    client.calendar.push(item);
    await writeDb(db);
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/calendar/:itemId", async (req, res, next) => {
  try {
    const db = await readDb();
    const client = findClient(db, req.params.id);
    if (!client || client.deletedAt) return res.status(404).json({ error: "Client not found" });

    const item = client.calendar.find((i) => i.id === req.params.itemId);
    if (!item) return res.status(404).json({ error: "Calendar item not found" });

    const { title, platform, date, status, notes } = req.body || {};
    if (title !== undefined) {
      if (!String(title).trim()) return res.status(400).json({ error: "Title cannot be empty" });
      item.title = String(title).trim();
    }
    if (platform !== undefined) {
      if (!CONTENT_PLATFORMS.includes(platform)) {
        return res.status(400).json({ error: `Platform must be one of: ${CONTENT_PLATFORMS.join(", ")}` });
      }
      item.platform = platform;
    }
    if (date !== undefined) item.date = date || null;
    if (status !== undefined) {
      if (!CONTENT_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Status must be one of: ${CONTENT_STATUSES.join(", ")}` });
      }
      item.status = status;
    }
    if (notes !== undefined) item.notes = String(notes).trim();

    await writeDb(db);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id/calendar/:itemId", async (req, res, next) => {
  try {
    const db = await readDb();
    const client = findClient(db, req.params.id);
    if (!client || client.deletedAt) return res.status(404).json({ error: "Client not found" });

    const idx = client.calendar.findIndex((i) => i.id === req.params.itemId);
    if (idx === -1) return res.status(404).json({ error: "Calendar item not found" });

    client.calendar.splice(idx, 1);
    await writeDb(db);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
