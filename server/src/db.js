// ---------- JSON file persistence ----------
// A single JSON file (server/data/db.json) holds all app data. Good enough
// for a small team and a few hundred clients; see README for the SQLite
// tradeoff if this ever needs to grow (many concurrent users, much larger
// note history, etc).

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

export const CLIENT_STATUSES = ["active", "paused", "churned"];
export const USER_ROLES = ["owner", "employee"];
export const BILLING_STATUSES = ["current", "overdue"];
export const CONTENT_PLATFORMS = ["Instagram", "Facebook", "TikTok", "LinkedIn", "Other"];
export const CONTENT_STATUSES = ["planned", "posted"];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const MAX_BACKUPS = 50;

// Serializes writes so two near-simultaneous requests can't clobber each
// other (Node is single-threaded, but await points let requests interleave).
let writeQueue = Promise.resolve();

// Snapshots the current db.json before it gets overwritten, so a bad write
// (or a mistake in the app itself) is always recoverable by hand — see
// README.md "Recovering from a backup". Keeps the most recent MAX_BACKUPS
// snapshots and prunes older ones.
async function snapshotBeforeWrite() {
  try {
    await fs.access(DB_FILE);
  } catch {
    return; // nothing written yet — nothing to snapshot
  }
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.copyFile(DB_FILE, path.join(BACKUP_DIR, `db-${stamp}.json`));
  await pruneBackups();
}

async function pruneBackups() {
  const files = (await fs.readdir(BACKUP_DIR))
    .filter((f) => f.startsWith("db-") && f.endsWith(".json"))
    .sort(); // ISO timestamps in the filename sort chronologically
  const excess = files.length - MAX_BACKUPS;
  if (excess > 0) {
    await Promise.all(files.slice(0, excess).map((f) => fs.unlink(path.join(BACKUP_DIR, f))));
  }
}

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify({ clients: [], users: [] }, null, 2));
  }
}

function normalizeUser(user) {
  return {
    ...user,
    role: USER_ROLES.includes(user.role) ? user.role : "employee",
    active: user.active ?? true,
    mustChangePassword: !!user.mustChangePassword,
    resetToken: user.resetToken ?? null,
    resetTokenExpiresAt: user.resetTokenExpiresAt ?? null,
    // Bumped by "log out of all other sessions" — a logged-in session's own
    // copy (req.session.sessionVersion) has to match this or it's rejected.
    sessionVersion: typeof user.sessionVersion === "number" ? user.sessionVersion : 0,
  };
}

function normalizeBilling(billing) {
  const b = billing || {};
  return {
    monthlyRetainer: typeof b.monthlyRetainer === "number" ? b.monthlyRetainer : null,
    status: BILLING_STATUSES.includes(b.status) ? b.status : "current",
    renewalDate: b.renewalDate || null,
  };
}

function normalizeContentItem(item) {
  return {
    id: item.id || crypto.randomUUID(),
    title: item.title || "",
    platform: CONTENT_PLATFORMS.includes(item.platform) ? item.platform : "Other",
    date: item.date || null,
    status: CONTENT_STATUSES.includes(item.status) ? item.status : "planned",
    notes: item.notes || "",
  };
}

// Fills in fields added after a client may have been created, so older
// records in db.json keep working without a manual migration step. Notably
// backfills the old single `contactName` string into the new `contacts`
// array the first time an old client is read — the next write then persists
// the migrated shape.
function normalizeClient(client) {
  const { contactName, ...rest } = client;
  const contacts = Array.isArray(client.contacts)
    ? client.contacts
    : contactName
      ? [{ id: crypto.randomUUID(), name: contactName, role: "" }]
      : [];
  return {
    ...rest,
    contacts,
    status: CLIENT_STATUSES.includes(client.status) ? client.status : "active",
    notes: client.notes || [],
    drafts: client.drafts || [],
    deletedAt: client.deletedAt ?? null,
    billing: normalizeBilling(client.billing),
    calendar: (client.calendar || []).map(normalizeContentItem),
  };
}

export async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(DB_FILE, "utf-8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Database file is corrupted — check server/data/db.json");
  }
  data.clients = (data.clients || []).map(normalizeClient);
  data.users = (data.users || []).map(normalizeUser);
  return data;
}

// Appends a generated email/report to a client's history and persists it.
// Used by the /api/ai routes right after a successful Claude call.
// `createdBy` (optional) attributes the draft to the user who generated it —
// { id, name } — so the shared client view shows who drafted what. `stats`
// (report drafts only) keeps the raw numbers the report was built from, so a
// PDF exported later can still show the stat breakdown, not just the prose.
export async function appendDraft(clientId, { kind, purpose, content, createdBy, stats }) {
  const db = await readDb();
  const client = db.clients.find((c) => c.id === clientId && !c.deletedAt);
  if (!client) {
    const err = new Error("Client not found");
    err.status = 404;
    throw err;
  }
  const draft = {
    id: crypto.randomUUID(),
    kind,
    purpose: purpose || null,
    content,
    stats: stats || null,
    createdBy: createdBy || null,
    createdAt: new Date().toISOString(),
  };
  client.drafts.push(draft);
  await writeDb(db);
  return draft;
}

export async function writeDb(data) {
  writeQueue = writeQueue.then(async () => {
    await snapshotBeforeWrite();
    // Write to a temp file then rename, so a crash mid-write can't leave a
    // half-written db.json behind.
    const tmpFile = `${DB_FILE}.tmp`;
    await fs.writeFile(tmpFile, JSON.stringify(data, null, 2));
    await fs.rename(tmpFile, DB_FILE);
  });
  await writeQueue;
}
