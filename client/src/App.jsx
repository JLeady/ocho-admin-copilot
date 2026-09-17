import { useState, useEffect } from "react";
import {
  Plus, X, Copy, Check, Clock, Mail, FileText, Sparkles, Loader2,
  Building2, ChevronLeft, AlertCircle, CheckCircle2, StickyNote, Send, Pencil, Trash2, LogOut, RotateCcw,
  AlertTriangle, Users, CalendarDays, CalendarPlus, Download,
} from "lucide-react";
import { api } from "./api";
import Login, { Setup, ForcePasswordChange } from "./Login.jsx";
import { downloadReportPdf } from "./ReportPdf.jsx";

// ---------- design tokens ----------
const INK = "#1A1A2E";
const BG = "#F5F6FA";
const CARD = "#FFFFFF";
const BORDER = "#E4E6EF";
const ACCENT = "#2E5BFF";
const MUTED = "#6B6B76";
const GREEN = "#1FAA6D";
const AMBER = "#F0A93C";
const RED = "#E5484D";
const GRAY_DOT = "#B7B9C6";

const BUSINESS_TYPES = [
  "Real estate agent",
  "Property developer",
  "Personal brand / entrepreneur",
  "Other",
];

const EMAIL_PURPOSES = [
  { id: "checkin", label: "Friendly check-in" },
  { id: "status", label: "Status update" },
  { id: "followup", label: "Follow-up after a meeting" },
  { id: "approval", label: "Chase content approval" },
  { id: "custom", label: "Custom (describe below)" },
];

function emailPurposeLabel(id) {
  return EMAIL_PURPOSES.find((p) => p.id === id)?.label || null;
}

const CLIENT_STATUSES = [
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "churned", label: "Churned" },
];
// Lower = shows first in the sidebar; keeps paused/churned clients from
// crowding out the clients actively being worked.
const STATUS_SORT_WEIGHT = { active: 0, paused: 1, churned: 2 };

const BILLING_STATUSES = [
  { id: "current", label: "Current" },
  { id: "overdue", label: "Overdue" },
];

const CONTENT_PLATFORMS = ["Instagram", "Facebook", "TikTok", "LinkedIn", "Other"];

function formatMoney(amount) {
  if (amount === null || amount === undefined || amount === "") return null;
  return `£${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// Whole days between today and a "YYYY-MM-DD" date string — negative means
// it's already passed.
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function renewalDueSoon(client, withinDays = 30) {
  const days = daysUntil(client.billing?.renewalDate);
  return days !== null && days <= withinDays;
}

function daysAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function lastContactInfo(client) {
  if (!client.notes || client.notes.length === 0) {
    return { days: null, color: GRAY_DOT, label: "No contact logged" };
  }
  const latest = client.notes.reduce((a, b) =>
    new Date(a.date) > new Date(b.date) ? a : b
  );
  const days = daysAgo(latest.date);
  let color = GREEN;
  if (days > 14) color = RED;
  else if (days > 7) color = AMBER;
  const label =
    days === 0 ? "Contacted today" : `${days} day${days === 1 ? "" : "s"} ago`;
  return { days, color, label };
}

// A client "needs attention" if they're active and not recently contacted.
// Paused/churned clients are excluded — you're not actively working them,
// so a contact gap there isn't something to chase.
function needsAttention(client) {
  if (client.status && client.status !== "active") return false;
  return lastContactInfo(client).color !== GREEN;
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------- small UI atoms ----------
function Dot({ color, size = 10 }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "999px",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

// Initials avatar with the relationship-health dot as a corner badge — keeps
// the signature dot indicator, but gives each client a distinct, scannable
// mark instead of a bare colored circle.
function Avatar({ name, healthColor, size = 34 }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div
        className="w-full h-full rounded-full flex items-center justify-center font-bold"
        style={{ background: "#EEF2FF", color: ACCENT, fontSize: size * 0.36 }}
      >
        {initials(name)}
      </div>
      {healthColor && (
        <span
          className="absolute rounded-full"
          style={{
            width: Math.max(9, size * 0.3),
            height: Math.max(9, size * 0.3),
            right: -1,
            bottom: -1,
            background: healthColor,
            border: `2px solid ${CARD}`,
          }}
        />
      )}
    </div>
  );
}

function Label({ children }) {
  return (
    <div className="font-mono uppercase text-[10px] tracking-widest mb-1" style={{ color: MUTED }}>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg px-3 py-2 text-sm outline-none border transition-colors focus:border-[#2E5BFF]";

// In-app confirmation dialog — replaces window.confirm(), which is easy to
// miss (looks nothing like the app), inconsistent across browsers, and can
// be silently suppressed by some browser/extension setups.
function ConfirmDialog({ title, message, confirmLabel = "Delete", danger = true, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(20,20,40,0.45)" }}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: CARD }}>
        <h2 className="font-extrabold text-lg tracking-tight mb-2">{title}</h2>
        <p className="text-sm mb-5" style={{ color: MUTED }}>{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
            style={{ color: MUTED }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="text-sm font-semibold rounded-lg px-4 py-2 text-white"
            style={{ background: danger ? RED : ACCENT }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Bottom-right toast for real error/success messages (replaces a single
// fixed "couldn't save" banner — shows what actually happened).
function Toast({ message, type = "error", onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4500);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  const bg = type === "success" ? GREEN : RED;
  const Icon = type === "success" ? CheckCircle2 : AlertCircle;

  return (
    <div
      className="fixed bottom-4 right-4 flex items-start gap-2 text-xs px-3 py-2.5 rounded-lg shadow-lg max-w-xs z-40"
      style={{ background: bg, color: "#fff" }}
    >
      <Icon size={14} className="flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

// ---------- app root: auth gate ----------
// phase: 'loading' | 'setup' (no accounts exist yet) | 'login' |
// 'force-password' (admin issued a temp password) | 'app'
export default function App() {
  const [phase, setPhase] = useState("loading");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { user } = await api.me();
        enterAsUser(user);
      } catch {
        try {
          const { needsSetup } = await api.bootstrapStatus();
          setPhase(needsSetup ? "setup" : "login");
        } catch {
          setPhase("login");
        }
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function enterAsUser(user) {
    setCurrentUser(user);
    setPhase(user.mustChangePassword ? "force-password" : "app");
  }

  function handleLogout() {
    setCurrentUser(null);
    setPhase("login");
  }

  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: BG }}>
        <Loader2 className="animate-spin" color={ACCENT} size={28} />
      </div>
    );
  }
  if (phase === "setup") return <Setup onSuccess={enterAsUser} />;
  if (phase === "login") return <Login onSuccess={enterAsUser} />;
  if (phase === "force-password") return <ForcePasswordChange onSuccess={enterAsUser} />;

  return <OchoAdminCopilot currentUser={currentUser} onLogout={handleLogout} />;
}

// ---------- main authenticated app ----------
function OchoAdminCopilot({ currentUser, onLogout }) {
  const [clients, setClients] = useState(null); // null = loading
  const [selectedId, setSelectedId] = useState(null);
  const [clientModal, setClientModal] = useState(null); // { mode: 'add' | 'edit', client? }
  const [tab, setTab] = useState("notes");
  const [toast, setToast] = useState(null); // { message, type: 'error' | 'success' }
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [deletedClients, setDeletedClients] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null); // { title, message, confirmLabel, danger, onConfirm }
  const [listFilter, setListFilter] = useState("all"); // 'all' | 'attention'
  const [teamOpen, setTeamOpen] = useState(false);

  function askConfirm({ title, message, confirmLabel, danger = true, onConfirm }) {
    setConfirmDialog({
      title,
      message,
      confirmLabel,
      danger,
      onConfirm: () => {
        setConfirmDialog(null);
        onConfirm();
      },
    });
  }

  function handleApiError(e) {
    if (e?.status === 401) {
      onLogout();
      return;
    }
    setToast({ message: e?.message || "Something went wrong — check connection and try again.", type: "error" });
  }

  function showSuccess(message) {
    setToast({ message, type: "success" });
  }

  useEffect(() => {
    (async () => {
      try {
        const data = await api.listClients();
        setClients(data);
        // Land on the dashboard, not an arbitrary "first" client — the
        // dashboard is the actual home screen now.
      } catch (e) {
        if (e?.status === 401) return onLogout();
        setClients([]);
        handleApiError(e);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = clients ? clients.find((c) => c.id === selectedId) : null;

  async function addClient(data) {
    try {
      const created = await api.createClient(data);
      setClients((prev) => [...prev, created]);
      setSelectedId(created.id);
      setClientModal(null);
      setMobileShowDetail(true);
    } catch (e) {
      handleApiError(e);
    }
  }

  async function editClient(id, data) {
    try {
      const updated = await api.updateClient(id, data);
      setClients((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setClientModal(null);
    } catch (e) {
      handleApiError(e);
    }
  }

  async function deleteClient(id) {
    try {
      await api.deleteClient(id);
      setClients((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (selectedId === id) setSelectedId(next.length ? next[0].id : null);
        return next;
      });
      showSuccess("Client moved to Trash — restore it anytime from Trash in the sidebar.");
    } catch (e) {
      handleApiError(e);
    }
  }

  async function openTrash() {
    setTrashOpen(true);
    try {
      const data = await api.listDeletedClients();
      setDeletedClients(data);
    } catch (e) {
      handleApiError(e);
    }
  }

  async function restoreClient(id) {
    try {
      const restored = await api.restoreClient(id);
      setDeletedClients((prev) => prev.filter((c) => c.id !== id));
      setClients((prev) => [...prev, restored]);
      showSuccess(`${restored.name} restored.`);
    } catch (e) {
      handleApiError(e);
    }
  }

  async function permanentlyDeleteClient(id, name) {
    try {
      await api.permanentlyDeleteClient(id);
      setDeletedClients((prev) => prev.filter((c) => c.id !== id));
      showSuccess(`${name} permanently deleted.`);
    } catch (e) {
      handleApiError(e);
    }
  }

  async function addNote(clientId, text) {
    try {
      const note = await api.addNote(clientId, text);
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, notes: [...c.notes, note] } : c))
      );
    } catch (e) {
      handleApiError(e);
    }
  }

  async function editNote(clientId, noteId, text) {
    try {
      const updated = await api.updateNote(clientId, noteId, text);
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? { ...c, notes: c.notes.map((n) => (n.id === noteId ? updated : n)) }
            : c
        )
      );
    } catch (e) {
      handleApiError(e);
    }
  }

  async function deleteNote(clientId, noteId) {
    try {
      await api.deleteNote(clientId, noteId);
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId ? { ...c, notes: c.notes.filter((n) => n.id !== noteId) } : c
        )
      );
    } catch (e) {
      handleApiError(e);
    }
  }

  // Called by EmailTab/ReportTab after a successful generation — the API
  // already persisted the draft server-side, this just reflects it locally.
  function addDraftToState(clientId, draft) {
    setClients((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, drafts: [...(c.drafts || []), draft] } : c))
    );
  }

  async function deleteDraft(clientId, draftId) {
    try {
      await api.deleteDraft(clientId, draftId);
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId ? { ...c, drafts: (c.drafts || []).filter((d) => d.id !== draftId) } : c
        )
      );
    } catch (e) {
      handleApiError(e);
    }
  }

  async function addCalendarItem(clientId, data) {
    try {
      const item = await api.addCalendarItem(clientId, data);
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, calendar: [...(c.calendar || []), item] } : c))
      );
    } catch (e) {
      handleApiError(e);
    }
  }

  async function editCalendarItem(clientId, itemId, data) {
    try {
      const updated = await api.updateCalendarItem(clientId, itemId, data);
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? { ...c, calendar: (c.calendar || []).map((i) => (i.id === itemId ? updated : i)) }
            : c
        )
      );
    } catch (e) {
      handleApiError(e);
    }
  }

  async function deleteCalendarItem(clientId, itemId) {
    try {
      await api.deleteCalendarItem(clientId, itemId);
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId ? { ...c, calendar: (c.calendar || []).filter((i) => i.id !== itemId) } : c
        )
      );
    } catch (e) {
      handleApiError(e);
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // logging out client-side regardless of network hiccups is fine
    }
    onLogout();
  }

  const sortedClients = clients
    ? [...clients].sort((a, b) => {
        const statusDiff = (STATUS_SORT_WEIGHT[a.status] ?? 0) - (STATUS_SORT_WEIGHT[b.status] ?? 0);
        if (statusDiff !== 0) return statusDiff;
        const da = lastContactInfo(a).days;
        const db = lastContactInfo(b).days;
        if (da === null) return -1;
        if (db === null) return 1;
        return db - da;
      })
    : [];

  const attentionCount = clients ? clients.filter(needsAttention).length : 0;
  const visibleClients = listFilter === "attention" ? sortedClients.filter(needsAttention) : sortedClients;

  if (clients === null) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: BG }}>
        <Loader2 className="animate-spin" color={ACCENT} size={28} />
      </div>
    );
  }

  return (
    <div
      className="h-screen w-full flex flex-col md:flex-row overflow-hidden font-sans"
      style={{ background: BG, color: INK }}
    >
      {/* Sidebar */}
      <div
        className={`w-full md:w-80 flex-shrink-0 border-b md:border-b-0 md:border-r flex flex-col ${
          mobileShowDetail ? "hidden md:flex" : "flex"
        }`}
        style={{ borderColor: BORDER, background: CARD }}
      >
        <button
          onClick={() => {
            setSelectedId(null);
            setMobileShowDetail(false);
          }}
          className="px-5 pt-5 pb-4 text-left transition-opacity hover:opacity-80"
          style={{ borderBottom: `1px solid ${BORDER}` }}
          title="Back to home"
        >
          <div className="flex items-baseline gap-0.5">
            <span className="font-sans font-extrabold text-xl tracking-tight">Ocho</span>
            <span className="font-sans font-extrabold text-xl tracking-tight" style={{ color: ACCENT }}>
              .AI
            </span>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-1" style={{ color: MUTED }}>
            Admin Copilot
          </div>
        </button>

        <div className="px-5 py-3 flex items-center justify-between">
          <Label>Clients ({clients.length})</Label>
          <button
            onClick={() => setClientModal({ mode: "add" })}
            className="flex items-center gap-1 text-xs font-semibold rounded-md px-2 py-1 transition-colors"
            style={{ color: ACCENT }}
          >
            <Plus size={14} /> Add
          </button>
        </div>

        <div className="px-5 pb-3 flex gap-1">
          {[
            { id: "all", label: `All (${clients.length})` },
            { id: "attention", label: `Needs attention (${attentionCount})` },
          ].map((f) => {
            const active = listFilter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setListFilter(f.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors"
                style={{ background: active ? INK : "#EEF0F7", color: active ? "#fff" : MUTED }}
              >
                {f.id === "attention" && <AlertTriangle size={11} />}
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {visibleClients.length === 0 && (
            <div className="px-3 py-8 text-center">
              <p className="text-sm" style={{ color: MUTED }}>
                {listFilter === "attention"
                  ? "Nobody needs attention right now — nice work."
                  : "No clients yet. Add the first one to get started."}
              </p>
            </div>
          )}
          {visibleClients.map((c) => {
            const info = lastContactInfo(c);
            const active = c.id === selectedId;
            const statusMeta = CLIENT_STATUSES.find((s) => s.id === c.status);
            return (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedId(c.id);
                  setTab("notes");
                  setMobileShowDetail(true);
                }}
                className="w-full text-left px-3 py-2.5 rounded-xl mb-1 transition-colors"
                style={{ background: active ? "#EEF2FF" : "transparent" }}
              >
                <div className="flex items-center gap-2.5">
                  <Avatar name={c.name} healthColor={info.color} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{c.name}</div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs truncate" style={{ color: MUTED }}>
                        {c.businessType}
                        {statusMeta && statusMeta.id !== "active" ? ` · ${statusMeta.label}` : ""}
                      </span>
                      <span className="text-[10px] font-mono flex-shrink-0" style={{ color: MUTED }}>
                        {info.label}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-5 py-3 flex items-center gap-2 flex-wrap" style={{ borderTop: `1px solid ${BORDER}` }}>
          <Dot color={GREEN} size={7} />
          <span className="text-[11px]" style={{ color: MUTED }}>&lt;7 days</span>
          <Dot color={AMBER} size={7} />
          <span className="text-[11px]" style={{ color: MUTED }}>7–14 days</span>
          <Dot color={RED} size={7} />
          <span className="text-[11px]" style={{ color: MUTED }}>14+ days</span>
        </div>
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: `1px solid ${BORDER}` }}>
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate">{currentUser.name}</div>
            <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: MUTED }}>
              {currentUser.role}
            </div>
          </div>
          {currentUser.role === "owner" && (
            <button
              onClick={() => setTeamOpen(true)}
              className="flex items-center gap-1 text-[11px] font-semibold flex-shrink-0"
              style={{ color: ACCENT }}
            >
              <Users size={12} /> Team
            </button>
          )}
        </div>
        <div className="px-5 pb-4 flex items-center justify-between">
          <button
            onClick={openTrash}
            className="flex items-center gap-1 text-[11px] font-semibold transition-colors"
            style={{ color: MUTED }}
          >
            <Trash2 size={12} /> Trash
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 text-[11px] font-semibold transition-colors"
            style={{ color: MUTED }}
          >
            <LogOut size={12} /> Log out
          </button>
        </div>
      </div>

      {/* Main panel */}
      <div className={`flex-1 flex flex-col overflow-hidden ${mobileShowDetail ? "flex" : "hidden md:flex"}`}>
        {selected ? (
          <ClientPanel
            client={selected}
            tab={tab}
            setTab={setTab}
            onAddNote={(text) => addNote(selected.id, text)}
            onEditNote={(noteId, text) => editNote(selected.id, noteId, text)}
            onDeleteNote={(noteId) => deleteNote(selected.id, noteId)}
            onDraftSaved={(draft) => addDraftToState(selected.id, draft)}
            onDeleteDraft={(draftId) => deleteDraft(selected.id, draftId)}
            onAddCalendarItem={(data) => addCalendarItem(selected.id, data)}
            onEditCalendarItem={(itemId, data) => editCalendarItem(selected.id, itemId, data)}
            onDeleteCalendarItem={(itemId) => deleteCalendarItem(selected.id, itemId)}
            onEdit={() => setClientModal({ mode: "edit", client: selected })}
            onDelete={() =>
              askConfirm({
                title: "Delete client?",
                message: `${selected.name} will be moved to Trash. You can restore them anytime before permanently deleting.`,
                confirmLabel: "Delete",
                onConfirm: () => deleteClient(selected.id),
              })
            }
            onBack={() => setMobileShowDetail(false)}
            askConfirm={askConfirm}
            currentUserId={currentUser.id}
          />
        ) : (
          <HomeDashboard
            clients={clients}
            currentUser={currentUser}
            onSelectClient={(id) => {
              setSelectedId(id);
              setTab("notes");
              setMobileShowDetail(true);
            }}
            onAddClient={() => setClientModal({ mode: "add" })}
          />
        )}
      </div>

      {clientModal && (
        <ClientModal
          mode={clientModal.mode}
          initial={clientModal.client}
          onClose={() => setClientModal(null)}
          onSave={(data) => {
            if (clientModal.mode === "edit") editClient(clientModal.client.id, data);
            else addClient(data);
          }}
        />
      )}

      {trashOpen && (
        <TrashModal
          clients={deletedClients}
          onClose={() => setTrashOpen(false)}
          onRestore={restoreClient}
          onPermanentDelete={permanentlyDeleteClient}
          askConfirm={askConfirm}
        />
      )}

      {teamOpen && (
        <TeamModal
          currentUser={currentUser}
          onClose={() => setTeamOpen(false)}
          askConfirm={askConfirm}
          handleApiError={handleApiError}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          danger={confirmDialog.danger}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}

// ---------- home dashboard (shown when no client is selected) ----------
function StatTile({ label, value, accent }) {
  return (
    <div className="rounded-xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      <div className="text-2xl font-extrabold tracking-tight" style={{ color: accent || INK }}>{value}</div>
      <div className="text-xs mt-0.5" style={{ color: MUTED }}>{label}</div>
    </div>
  );
}

function HomeDashboard({ clients, currentUser, onSelectClient, onAddClient }) {
  const total = clients.length;

  if (total === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div
            className="mx-auto mb-4 flex items-center justify-center rounded-full"
            style={{ width: 56, height: 56, background: "#EEF2FF" }}
          >
            <Building2 size={24} color={ACCENT} />
          </div>
          <h2 className="font-extrabold text-lg tracking-tight mb-1.5">Add your first client</h2>
          <p className="text-sm mb-5" style={{ color: MUTED }}>
            Once a client's set up, you can log touchpoints and draft emails and reports for them.
          </p>
          <button
            onClick={onAddClient}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
            style={{ background: ACCENT }}
          >
            <Plus size={15} /> Add a client
          </button>
        </div>
      </div>
    );
  }

  const attention = clients.filter(needsAttention);
  const attentionPreview = [...attention]
    .sort((a, b) => (lastContactInfo(b).days ?? Infinity) - (lastContactInfo(a).days ?? Infinity))
    .slice(0, 5);

  const overdueBilling = clients.filter((c) => c.billing?.status === "overdue");
  const renewalsSoon = clients.filter(renewalDueSoon);
  const renewalsPreview = [...renewalsSoon]
    .sort((a, b) => daysUntil(a.billing.renewalDate) - daysUntil(b.billing.renewalDate))
    .slice(0, 5);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = currentUser.name?.split(" ")[0] || currentUser.name;

  return (
    <div className="flex-1 overflow-y-auto px-6 md:px-10 py-8 md:py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-extrabold text-2xl tracking-tight mb-1" style={{ color: INK }}>
          {greeting}, {firstName}
        </h1>
        <p className="text-sm mb-7" style={{ color: MUTED }}>Here's where things stand across your clients.</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatTile label="Clients" value={total} />
          <StatTile label="Needs attention" value={attention.length} accent={attention.length > 0 ? RED : GREEN} />
          <StatTile label="Renewals due soon" value={renewalsSoon.length} accent={renewalsSoon.length > 0 ? AMBER : GREEN} />
          <StatTile label="Billing overdue" value={overdueBilling.length} accent={overdueBilling.length > 0 ? RED : GREEN} />
        </div>

        <Label>Needs attention</Label>
        {attentionPreview.length === 0 ? (
          <div className="mt-2 mb-7 p-4 rounded-xl flex items-center gap-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <Dot color={GREEN} size={9} />
            <p className="text-sm" style={{ color: MUTED }}>Nobody needs attention right now — nice work.</p>
          </div>
        ) : (
          <div className="mt-2 mb-7 space-y-2">
            {attentionPreview.map((c) => {
              const info = lastContactInfo(c);
              return (
                <button
                  key={c.id}
                  onClick={() => onSelectClient(c.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors hover:bg-black/[0.02]"
                  style={{ background: CARD, border: `1px solid ${BORDER}` }}
                >
                  <Avatar name={c.name} healthColor={info.color} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{c.name}</div>
                    <div className="text-xs truncate" style={{ color: MUTED }}>{c.businessType}</div>
                  </div>
                  <div className="text-xs font-mono flex-shrink-0" style={{ color: MUTED }}>{info.label}</div>
                </button>
              );
            })}
          </div>
        )}

        {renewalsPreview.length > 0 && (
          <>
            <Label>Renewals due soon</Label>
            <div className="mt-2 space-y-2">
              {renewalsPreview.map((c) => {
                const days = daysUntil(c.billing.renewalDate);
                return (
                  <button
                    key={c.id}
                    onClick={() => onSelectClient(c.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors hover:bg-black/[0.02]"
                    style={{ background: CARD, border: `1px solid ${BORDER}` }}
                  >
                    <Avatar name={c.name} healthColor={lastContactInfo(c).color} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{c.name}</div>
                      <div className="text-xs truncate" style={{ color: MUTED }}>
                        {formatMoney(c.billing.monthlyRetainer) ? `${formatMoney(c.billing.monthlyRetainer)}/mo` : c.businessType}
                      </div>
                    </div>
                    <div className="text-xs font-mono flex-shrink-0" style={{ color: days < 0 ? RED : AMBER }}>
                      {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d`}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- trash (soft-deleted clients) ----------
function TrashModal({ clients, onClose, onRestore, onPermanentDelete, askConfirm }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center px-4" style={{ background: "rgba(20,20,40,0.45)" }}>
      <div className="w-full max-w-md rounded-2xl p-6 max-h-[80vh] flex flex-col" style={{ background: CARD }}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-extrabold text-lg tracking-tight">Trash</h2>
          <button onClick={onClose}><X size={18} color={MUTED} /></button>
        </div>
        <p className="text-xs mb-4" style={{ color: MUTED }}>
          Deleted clients stay here until you restore or permanently remove them.
        </p>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {clients.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: MUTED }}>Trash is empty.</p>
          ) : (
            <div className="space-y-2">
              {clients.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 p-3 rounded-lg" style={{ border: `1px solid ${BORDER}` }}>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{c.name}</div>
                    <div className="text-xs truncate" style={{ color: MUTED }}>
                      {c.businessType} · deleted {new Date(c.deletedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => onRestore(c.id)}
                      className="flex items-center gap-1 text-xs font-semibold rounded-md px-2 py-1.5"
                      style={{ background: "#EEF2FF", color: ACCENT }}
                      title="Restore"
                    >
                      <RotateCcw size={12} /> Restore
                    </button>
                    <button
                      onClick={() =>
                        askConfirm({
                          title: "Delete permanently?",
                          message: `${c.name} and all of their notes will be permanently removed. This can't be undone.`,
                          confirmLabel: "Delete forever",
                          onConfirm: () => onPermanentDelete(c.id, c.name),
                        })
                      }
                      className="p-1.5 rounded-md"
                      style={{ color: MUTED }}
                      title="Delete forever"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- team (owner-only account management) ----------
function TeamModal({ currentUser, onClose, askConfirm, handleApiError }) {
  const [users, setUsers] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [tempPasswordInfo, setTempPasswordInfo] = useState(null); // { name, tempPassword }

  useEffect(() => {
    (async () => {
      try {
        setUsers(await api.listUsers());
      } catch (e) {
        handleApiError(e);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function addUser(data) {
    try {
      const { user, tempPassword } = await api.createUser(data);
      setUsers((prev) => [...prev, user]);
      setShowAdd(false);
      setTempPasswordInfo({ name: user.name, tempPassword });
    } catch (e) {
      handleApiError(e);
    }
  }

  async function toggleActive(user) {
    try {
      const updated = await api.updateUser(user.id, { active: !user.active });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
    } catch (e) {
      handleApiError(e);
    }
  }

  async function resetPassword(user) {
    try {
      const { tempPassword } = await api.resetUserPassword(user.id);
      setTempPasswordInfo({ name: user.name, tempPassword });
    } catch (e) {
      handleApiError(e);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center px-4" style={{ background: "rgba(20,20,40,0.45)" }}>
      <div className="w-full max-w-lg rounded-2xl p-6 max-h-[85vh] flex flex-col" style={{ background: CARD }}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-extrabold text-lg tracking-tight">Team</h2>
          <button onClick={onClose}><X size={18} color={MUTED} /></button>
        </div>
        <p className="text-xs mb-4" style={{ color: MUTED }}>
          Everyone shares the same client list — notes and drafts show who made them.
        </p>

        {tempPasswordInfo && (
          <div className="mb-4 p-3 rounded-lg" style={{ background: "#EEF2FF", border: `1px solid ${BORDER}` }}>
            <div className="text-xs font-semibold mb-1">Temporary password for {tempPasswordInfo.name}</div>
            <p className="text-xs mb-2" style={{ color: MUTED }}>
              Share this with them directly (Slack, in person) — it won't be shown again. They'll set their own
              password on first login.
            </p>
            <div className="flex items-center gap-2">
              <code
                className="text-sm font-mono px-2 py-1 rounded flex-1 truncate"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}
              >
                {tempPasswordInfo.tempPassword}
              </code>
              <CopyButton text={tempPasswordInfo.tempPassword} />
              <button onClick={() => setTempPasswordInfo(null)} className="text-xs flex-shrink-0" style={{ color: MUTED }}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {users === null ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin" color={ACCENT} size={20} /></div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-2 p-3 rounded-lg"
                  style={{ border: `1px solid ${BORDER}`, opacity: u.active ? 1 : 0.55 }}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                      {u.name}
                      {u.id === currentUser.id && (
                        <span className="text-[10px] font-mono flex-shrink-0" style={{ color: MUTED }}>(you)</span>
                      )}
                    </div>
                    <div className="text-xs truncate" style={{ color: MUTED }}>
                      {u.email} · {u.role}
                      {!u.active ? " · deactivated" : ""}
                      {u.mustChangePassword ? " · hasn't logged in yet" : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => resetPassword(u)}
                      className="text-xs font-semibold rounded-md px-2 py-1.5"
                      style={{ background: "#EEF2FF", color: ACCENT }}
                    >
                      Reset password
                    </button>
                    {u.id !== currentUser.id && (
                      <button
                        onClick={() =>
                          askConfirm({
                            title: u.active ? "Deactivate this account?" : "Reactivate this account?",
                            message: u.active
                              ? `${u.name} won't be able to log in until reactivated. Their notes and drafts stay exactly as they are.`
                              : `${u.name} will be able to log in again.`,
                            confirmLabel: u.active ? "Deactivate" : "Reactivate",
                            danger: u.active,
                            onConfirm: () => toggleActive(u),
                          })
                        }
                        className="text-xs font-semibold rounded-md px-2 py-1.5"
                        style={{ color: MUTED }}
                      >
                        {u.active ? "Deactivate" : "Reactivate"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showAdd ? (
          <AddUserForm onCancel={() => setShowAdd(false)} onSave={addUser} />
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="mt-4 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold text-white flex-shrink-0"
            style={{ background: ACCENT }}
          >
            <Plus size={14} /> Add team member
          </button>
        )}
      </div>
    </div>
  );
}

function AddUserForm({ onCancel, onSave }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");

  return (
    <div className="mt-4 pt-4 flex-shrink-0" style={{ borderTop: `1px solid ${BORDER}` }}>
      <Field label="Name">
        <input className={inputClass} style={{ borderColor: BORDER }} value={name}
          onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam Turner" />
      </Field>
      <Field label="Email">
        <input type="email" className={inputClass} style={{ borderColor: BORDER }} value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="sam@example.com" />
      </Field>
      <Field label="Role">
        <select className={inputClass} style={{ borderColor: BORDER }} value={role}
          onChange={(e) => setRole(e.target.value)}>
          <option value="employee">Employee</option>
          <option value="owner">Owner</option>
        </select>
      </Field>
      <div className="flex gap-2">
        <button
          disabled={!name.trim() || !email.includes("@")}
          onClick={() => onSave({ name: name.trim(), email: email.trim(), role })}
          className="flex-1 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: ACCENT }}
        >
          Create account
        </button>
        <button onClick={onCancel} className="rounded-lg py-2 px-4 text-sm font-semibold" style={{ color: MUTED }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------- add / edit client modal ----------
function ClientModal({ mode = "add", initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [businessType, setBusinessType] = useState(initial?.businessType || BUSINESS_TYPES[0]);
  const [status, setStatus] = useState(initial?.status || "active");
  const [contacts, setContacts] = useState(
    initial?.contacts?.length ? initial.contacts : [{ name: "", role: "" }]
  );
  const [goals, setGoals] = useState(initial?.goals || "");
  const [monthlyRetainer, setMonthlyRetainer] = useState(
    initial?.billing?.monthlyRetainer != null ? String(initial.billing.monthlyRetainer) : ""
  );
  const [billingStatus, setBillingStatus] = useState(initial?.billing?.status || "current");
  const [renewalDate, setRenewalDate] = useState(initial?.billing?.renewalDate || "");

  function updateContact(i, field, value) {
    setContacts((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }
  function removeContact(i) {
    setContacts((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addContact() {
    setContacts((prev) => [...prev, { name: "", role: "" }]);
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center px-4" style={{ background: "rgba(20,20,40,0.45)" }}>
      <div className="w-full max-w-md rounded-2xl p-6 max-h-[85vh] overflow-y-auto" style={{ background: CARD }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-extrabold text-lg tracking-tight">
            {mode === "edit" ? "Edit client" : "Add client"}
          </h2>
          <button onClick={onClose}><X size={18} color={MUTED} /></button>
        </div>

        <Field label="Business / client name">
          <input className={inputClass} style={{ borderColor: BORDER }} value={name}
            onChange={(e) => setName(e.target.value)} placeholder="e.g. Riverside Properties" />
        </Field>

        <div className="grid grid-cols-2 gap-x-3">
          <Field label="Business type">
            <select className={inputClass} style={{ borderColor: BORDER }} value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}>
              {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={inputClass} style={{ borderColor: BORDER }} value={status}
              onChange={(e) => setStatus(e.target.value)}>
              {CLIENT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="mb-3">
          <Label>Contacts</Label>
          <div className="space-y-2">
            {contacts.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input className={inputClass} style={{ borderColor: BORDER }} value={c.name}
                  onChange={(e) => updateContact(i, "name", e.target.value)} placeholder="e.g. Sam Turner" />
                <input className={inputClass} style={{ borderColor: BORDER, maxWidth: 130 }} value={c.role}
                  onChange={(e) => updateContact(i, "role", e.target.value)} placeholder="Role (optional)" />
                <button
                  onClick={() => removeContact(i)}
                  className="flex-shrink-0 p-1.5"
                  style={{ color: MUTED }}
                  title="Remove contact"
                  type="button"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addContact}
            className="mt-2 flex items-center gap-1 text-xs font-semibold"
            style={{ color: ACCENT }}
            type="button"
          >
            <Plus size={13} /> Add contact
          </button>
        </div>

        <Field label="Goals / what they care about">
          <textarea className={inputClass} style={{ borderColor: BORDER, minHeight: 70 }} value={goals}
            onChange={(e) => setGoals(e.target.value)} placeholder="e.g. more listing enquiries, wants a polished, trustworthy feel" />
        </Field>

        <Label>Billing</Label>
        <div className="grid grid-cols-3 gap-x-2 mb-3">
          <div>
            <input
              type="number" min="0" step="0.01"
              className={inputClass} style={{ borderColor: BORDER }} value={monthlyRetainer}
              onChange={(e) => setMonthlyRetainer(e.target.value)} placeholder="£/month"
            />
          </div>
          <select className={inputClass} style={{ borderColor: BORDER }} value={billingStatus}
            onChange={(e) => setBillingStatus(e.target.value)}>
            {BILLING_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <input
            type="date"
            className={inputClass} style={{ borderColor: BORDER }} value={renewalDate}
            onChange={(e) => setRenewalDate(e.target.value)}
          />
        </div>

        <button
          disabled={!name.trim()}
          onClick={() =>
            onSave({
              name: name.trim(),
              businessType,
              status,
              contacts: contacts
                .filter((c) => c.name.trim())
                .map((c) => ({ id: c.id, name: c.name.trim(), role: (c.role || "").trim() })),
              goals: goals.trim(),
              billing: {
                monthlyRetainer: monthlyRetainer.trim() === "" ? null : Number(monthlyRetainer),
                status: billingStatus,
                renewalDate: renewalDate || null,
              },
            })
          }
          className="w-full mt-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ background: ACCENT }}
        >
          {mode === "edit" ? "Save changes" : "Save client"}
        </button>
      </div>
    </div>
  );
}

// ---------- client detail panel ----------
function ClientPanel({
  client, tab, setTab, onAddNote, onEditNote, onDeleteNote, onDraftSaved, onDeleteDraft,
  onAddCalendarItem, onEditCalendarItem, onDeleteCalendarItem,
  onEdit, onDelete, onBack, askConfirm, currentUserId,
}) {
  const info = lastContactInfo(client);
  const statusMeta = CLIENT_STATUSES.find((s) => s.id === client.status);
  const contactsLabel = (client.contacts || [])
    .map((c) => (c.role ? `${c.name} (${c.role})` : c.name))
    .join(", ");

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={onBack} className="md:hidden flex items-center gap-1 text-xs mb-3" style={{ color: MUTED }}>
          <ChevronLeft size={14} /> All clients
        </button>
        <div className="flex items-center gap-3">
          <Avatar name={client.name} healthColor={info.color} size={40} />
          <h1 className="font-extrabold text-xl tracking-tight flex-1 truncate">{client.name}</h1>
          {statusMeta && statusMeta.id !== "active" && (
            <span
              className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded flex-shrink-0"
              style={{
                background: statusMeta.id === "churned" ? "#FCE8E8" : "#FFF4E0",
                color: statusMeta.id === "churned" ? RED : AMBER,
              }}
            >
              {statusMeta.label}
            </span>
          )}
          <button onClick={onEdit} className="p-1.5 rounded-md transition-colors" style={{ color: MUTED }} title="Edit client">
            <Pencil size={15} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-md transition-colors" style={{ color: MUTED }} title="Delete client">
            <Trash2 size={15} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 pl-[52px]">
          <span className="text-sm" style={{ color: MUTED }}>{client.businessType}</span>
          {contactsLabel && <span className="text-sm" style={{ color: MUTED }}>{contactsLabel}</span>}
          <span className="text-xs font-mono" style={{ color: MUTED }}>{info.label}</span>
        </div>

        <div className="flex gap-1 mt-4 flex-wrap">
          {[
            { id: "notes", label: "Relationship", icon: StickyNote },
            { id: "calendar", label: "Calendar", icon: CalendarDays },
            { id: "email", label: "Draft email", icon: Mail },
            { id: "report", label: "Report", icon: FileText },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                style={{ background: active ? INK : "transparent", color: active ? "#fff" : MUTED }}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === "notes" && (
          <NotesTab
            client={client}
            onAddNote={onAddNote}
            onEditNote={onEditNote}
            onDeleteNote={onDeleteNote}
            askConfirm={askConfirm}
            currentUserId={currentUserId}
          />
        )}
        {tab === "calendar" && (
          <CalendarTab
            client={client}
            onAddItem={onAddCalendarItem}
            onEditItem={onEditCalendarItem}
            onDeleteItem={onDeleteCalendarItem}
            askConfirm={askConfirm}
          />
        )}
        {tab === "email" && (
          <EmailTab
            client={client} onDraftSaved={onDraftSaved} onDeleteDraft={onDeleteDraft}
            askConfirm={askConfirm} currentUserId={currentUserId}
          />
        )}
        {tab === "report" && (
          <ReportTab
            client={client} onDraftSaved={onDraftSaved} onDeleteDraft={onDeleteDraft}
            askConfirm={askConfirm} currentUserId={currentUserId}
          />
        )}
      </div>
    </div>
  );
}

// ---------- notes tab ----------
function NotesTab({ client, onAddNote, onEditNote, onDeleteNote, askConfirm, currentUserId }) {
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const sorted = [...client.notes].sort((a, b) => new Date(b.date) - new Date(a.date));

  function submit() {
    if (!text.trim()) return;
    onAddNote(text.trim());
    setText("");
  }

  function startEdit(note) {
    setEditingId(note.id);
    setEditText(note.text);
  }

  function saveEdit(noteId) {
    if (!editText.trim()) return;
    onEditNote(noteId, editText.trim());
    setEditingId(null);
  }

  const billing = client.billing;
  const hasBillingInfo = billing && (billing.monthlyRetainer != null || billing.renewalDate);

  return (
    <div className="max-w-2xl">
      {hasBillingInfo && (
        <div className="mb-5 p-4 rounded-xl" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <Label>Billing</Label>
          <div className="flex items-center gap-3 flex-wrap mt-0.5">
            {billing.monthlyRetainer != null && (
              <span className="text-sm font-semibold">{formatMoney(billing.monthlyRetainer)}/mo</span>
            )}
            <span
              className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded"
              style={{
                background: billing.status === "overdue" ? "#FCE8E8" : "#E8F7EE",
                color: billing.status === "overdue" ? RED : GREEN,
              }}
            >
              {BILLING_STATUSES.find((s) => s.id === billing.status)?.label}
            </span>
            {billing.renewalDate && (
              <span className="text-xs" style={{ color: renewalDueSoon(client) ? RED : MUTED }}>
                Renews {new Date(billing.renewalDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                {renewalDueSoon(client) ? ` (${daysUntil(billing.renewalDate)}d)` : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {client.goals && (
        <div className="mb-5 p-4 rounded-xl" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <Label>Goals / what they care about</Label>
          <p className="text-sm">{client.goals}</p>
        </div>
      )}

      <div className="mb-5">
        <Label>Log a touchpoint</Label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Called Sam — happy with reach, wants more video content next month"
          className={inputClass}
          style={{ borderColor: BORDER, minHeight: 64 }}
        />
        <button
          onClick={submit}
          disabled={!text.trim()}
          className="mt-2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: ACCENT }}
        >
          <Send size={13} /> Add note
        </button>
      </div>

      <Label>History</Label>
      {sorted.length === 0 ? (
        <p className="text-sm" style={{ color: MUTED }}>No notes logged yet.</p>
      ) : (
        <div className="space-y-3 mt-2">
          {sorted.map((n) => (
            <div key={n.id} className="flex gap-3 group">
              <Clock size={14} className="mt-0.5 flex-shrink-0" color={MUTED} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono mb-0.5" style={{ color: MUTED }}>
                    {new Date(n.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    {n.author?.name && ` · ${n.author.id === currentUserId ? "You" : n.author.name}`}
                  </div>
                  {editingId !== n.id && (
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEdit(n)} style={{ color: MUTED }} title="Edit note">
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={() =>
                          askConfirm({
                            title: "Delete this note?",
                            message: "This note will be permanently removed — it can't be recovered.",
                            confirmLabel: "Delete note",
                            onConfirm: () => onDeleteNote(n.id),
                          })
                        }
                        style={{ color: MUTED }}
                        title="Delete note"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
                {editingId === n.id ? (
                  <div>
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className={inputClass}
                      style={{ borderColor: BORDER, minHeight: 50 }}
                      autoFocus
                    />
                    <div className="flex gap-2 mt-1.5">
                      <button
                        onClick={() => saveEdit(n.id)}
                        disabled={!editText.trim()}
                        className="text-xs font-semibold rounded-md px-2.5 py-1 text-white disabled:opacity-40"
                        style={{ background: ACCENT }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs font-semibold rounded-md px-2.5 py-1"
                        style={{ color: MUTED }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{n.text}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- calendar tab ----------
function CalendarTab({ client, onAddItem, onEditItem, onDeleteItem, askConfirm }) {
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState(CONTENT_PLATFORMS[0]);
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});

  const items = [...(client.calendar || [])].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(a.date) - new Date(b.date);
  });

  function submit() {
    if (!title.trim()) return;
    onAddItem({ title: title.trim(), platform, date: date || null, notes: notes.trim() });
    setTitle("");
    setDate("");
    setNotes("");
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditValues({ title: item.title, platform: item.platform, date: item.date || "", notes: item.notes || "" });
  }

  function saveEdit(itemId) {
    if (!editValues.title.trim()) return;
    onEditItem(itemId, {
      title: editValues.title.trim(),
      platform: editValues.platform,
      date: editValues.date || null,
      notes: editValues.notes.trim(),
    });
    setEditingId(null);
  }

  function toggleStatus(item) {
    onEditItem(item.id, { status: item.status === "posted" ? "planned" : "posted" });
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <Label>Plan content</Label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Reel — new listing walkthrough"
          className={inputClass}
          style={{ borderColor: BORDER }}
        />
        <div className="grid grid-cols-2 gap-2 mt-2">
          <select className={inputClass} style={{ borderColor: BORDER }} value={platform}
            onChange={(e) => setPlatform(e.target.value)}>
            {CONTENT_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input type="date" className={inputClass} style={{ borderColor: BORDER }} value={date}
            onChange={(e) => setDate(e.target.value)} />
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className={inputClass}
          style={{ borderColor: BORDER, minHeight: 50, marginTop: 8 }}
        />
        <button
          onClick={submit}
          disabled={!title.trim()}
          className="mt-2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: ACCENT }}
        >
          <CalendarPlus size={13} /> Add to calendar
        </button>
      </div>

      <Label>Scheduled content</Label>
      {items.length === 0 ? (
        <p className="text-sm mt-2" style={{ color: MUTED }}>Nothing planned yet.</p>
      ) : (
        <div className="space-y-2 mt-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="p-3 rounded-xl"
              style={{ background: CARD, border: `1px solid ${BORDER}`, opacity: item.status === "posted" ? 0.65 : 1 }}
            >
              {editingId === item.id ? (
                <div>
                  <input
                    value={editValues.title}
                    onChange={(e) => setEditValues((v) => ({ ...v, title: e.target.value }))}
                    className={inputClass}
                    style={{ borderColor: BORDER }}
                  />
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <select className={inputClass} style={{ borderColor: BORDER }} value={editValues.platform}
                      onChange={(e) => setEditValues((v) => ({ ...v, platform: e.target.value }))}>
                      {CONTENT_PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input type="date" className={inputClass} style={{ borderColor: BORDER }} value={editValues.date}
                      onChange={(e) => setEditValues((v) => ({ ...v, date: e.target.value }))} />
                  </div>
                  <textarea
                    value={editValues.notes}
                    onChange={(e) => setEditValues((v) => ({ ...v, notes: e.target.value }))}
                    className={inputClass}
                    style={{ borderColor: BORDER, minHeight: 50, marginTop: 8 }}
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => saveEdit(item.id)}
                      disabled={!editValues.title.trim()}
                      className="text-xs font-semibold rounded-md px-2.5 py-1 text-white disabled:opacity-40"
                      style={{ background: ACCENT }}
                    >
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-xs font-semibold rounded-md px-2.5 py-1" style={{ color: MUTED }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className={`font-semibold text-sm ${item.status === "posted" ? "line-through" : ""}`}>
                      {item.title}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: MUTED }}>
                      {item.platform}
                      {item.date &&
                        ` · ${new Date(item.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`}
                    </div>
                    {item.notes && <p className="text-sm mt-1.5" style={{ color: MUTED }}>{item.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleStatus(item)}
                      className="p-1.5 rounded-md"
                      style={{ color: item.status === "posted" ? GREEN : MUTED }}
                      title={item.status === "posted" ? "Mark as planned" : "Mark as posted"}
                    >
                      <CheckCircle2 size={14} />
                    </button>
                    <button onClick={() => startEdit(item)} className="p-1.5 rounded-md" style={{ color: MUTED }} title="Edit">
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() =>
                        askConfirm({
                          title: "Delete this item?",
                          message: "It will be permanently removed from this client's content calendar.",
                          confirmLabel: "Delete",
                          onConfirm: () => onDeleteItem(item.id),
                        })
                      }
                      className="p-1.5 rounded-md"
                      style={{ color: MUTED }}
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- shared: copy button ----------
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1.5 text-xs font-semibold rounded-md px-2.5 py-1.5 transition-colors"
      style={{ background: copied ? GREEN : "#EEF2FF", color: copied ? "#fff" : ACCENT }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ---------- shared: draft/report history ----------
function DraftHistory({ title, drafts, onLoad, onDelete, askConfirm, currentUserId, onDownloadPdf }) {
  if (!drafts.length) return null;
  return (
    <div className="mt-6">
      <Label>{title}</Label>
      <div className="space-y-2 mt-2">
        {drafts.map((d) => (
          <div key={d.id} className="rounded-lg p-3" style={{ border: `1px solid ${BORDER}` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-mono mb-1" style={{ color: MUTED }}>
                  {new Date(d.createdAt).toLocaleString(undefined, {
                    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                  })}
                  {d.purpose ? ` · ${emailPurposeLabel(d.purpose) || d.purpose}` : ""}
                  {d.createdBy?.name && ` · ${d.createdBy.id === currentUserId ? "You" : d.createdBy.name}`}
                </div>
                <p className="text-sm line-clamp-2" style={{ color: MUTED }}>{d.content}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {onDownloadPdf && (
                  <button
                    onClick={() => onDownloadPdf(d)}
                    className="p-1.5 rounded-md"
                    style={{ color: ACCENT }}
                    title="Download as PDF"
                  >
                    <Download size={13} />
                  </button>
                )}
                <button
                  onClick={() => onLoad(d)}
                  className="p-1.5 rounded-md"
                  style={{ color: ACCENT }}
                  title="Load into editor"
                >
                  <RotateCcw size={13} />
                </button>
                <button
                  onClick={() =>
                    askConfirm({
                      title: "Delete this draft?",
                      message: "It will be permanently removed from this client's history.",
                      confirmLabel: "Delete",
                      onConfirm: () => onDelete(d.id),
                    })
                  }
                  className="p-1.5 rounded-md"
                  style={{ color: MUTED }}
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- email tab ----------
function EmailTab({ client, onDraftSaved, onDeleteDraft, askConfirm, currentUserId }) {
  const [purpose, setPurpose] = useState(EMAIL_PURPOSES[0].id);
  const [customNote, setCustomNote] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const history = [...(client.drafts || [])]
    .filter((d) => d.kind === "email")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const recentNotes = [...client.notes]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5)
        .map((n) => ({ date: n.date, text: n.text }));

      const { text, draft: saved } = await api.draftEmail({
        clientId: client.id,
        client: {
          name: client.name,
          businessType: client.businessType,
          contacts: client.contacts,
          goals: client.goals,
        },
        purpose,
        customNote: purpose === "custom" ? customNote : undefined,
        recentNotes,
      });
      setDraft(text);
      if (saved) onDraftSaved(saved);
    } catch (e) {
      setError(e.message || "Couldn't generate a draft — check connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <Field label="Purpose">
        <select className={inputClass} style={{ borderColor: BORDER }} value={purpose}
          onChange={(e) => setPurpose(e.target.value)}>
          {EMAIL_PURPOSES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </Field>

      {purpose === "custom" && (
        <Field label="What should this email cover?">
          <textarea className={inputClass} style={{ borderColor: BORDER, minHeight: 60 }} value={customNote}
            onChange={(e) => setCustomNote(e.target.value)} placeholder="e.g. Let them know we're proposing a new content format next month" />
        </Field>
      )}

      <button
        onClick={generate}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white mb-4 disabled:opacity-60"
        style={{ background: INK }}
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {loading ? "Drafting…" : draft ? "Regenerate" : "Draft email"}
      </button>

      {error && <p className="text-sm mb-3" style={{ color: RED }}>{error}</p>}

      {draft && (
        <div className="rounded-xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between mb-2">
            <Label>Draft — edit freely before sending</Label>
            <CopyButton text={draft} />
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full text-sm leading-relaxed outline-none resize-y"
            style={{ minHeight: 220, background: "transparent" }}
          />
        </div>
      )}

      <DraftHistory
        title="Past drafts" drafts={history} onLoad={(d) => setDraft(d.content)} onDelete={onDeleteDraft}
        askConfirm={askConfirm} currentUserId={currentUserId}
      />
    </div>
  );
}

// ---------- report tab ----------
function ReportTab({ client, onDraftSaved, onDeleteDraft, askConfirm, currentUserId }) {
  const [postsPublished, setPostsPublished] = useState("");
  const [followerGrowth, setFollowerGrowth] = useState("");
  const [engagement, setEngagement] = useState("");
  const [topPost, setTopPost] = useState("");
  const [highlights, setHighlights] = useState("");
  const [report, setReport] = useState("");
  const [currentMeta, setCurrentMeta] = useState(null); // { stats, generatedAt } for the report currently in the editor
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const history = [...(client.drafts || [])]
    .filter((d) => d.kind === "report")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const stats = { postsPublished, followerGrowth, engagement, topPost, highlights };
      const { text, draft: saved } = await api.generateReport({
        clientId: client.id,
        client: { name: client.name, businessType: client.businessType, goals: client.goals },
        stats,
      });
      setReport(text);
      setCurrentMeta({ stats, generatedAt: saved?.createdAt || new Date().toISOString() });
      if (saved) onDraftSaved(saved);
    } catch (e) {
      setError(e.message || "Couldn't generate a report — check connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function downloadCurrentPdf() {
    downloadReportPdf({
      client,
      content: report,
      stats: currentMeta?.stats,
      generatedAt: currentMeta?.generatedAt || new Date().toISOString(),
    });
  }

  function downloadHistoryPdf(draft) {
    downloadReportPdf({ client, content: draft.content, stats: draft.stats, generatedAt: draft.createdAt });
  }

  return (
    <div className="max-w-2xl">
      <div className="grid grid-cols-2 gap-x-4">
        <Field label="Posts published">
          <input className={inputClass} style={{ borderColor: BORDER }} value={postsPublished}
            onChange={(e) => setPostsPublished(e.target.value)} placeholder="e.g. 12" />
        </Field>
        <Field label="Follower growth">
          <input className={inputClass} style={{ borderColor: BORDER }} value={followerGrowth}
            onChange={(e) => setFollowerGrowth(e.target.value)} placeholder="e.g. +340 (6%)" />
        </Field>
      </div>
      <Field label="Engagement">
        <input className={inputClass} style={{ borderColor: BORDER }} value={engagement}
          onChange={(e) => setEngagement(e.target.value)} placeholder="e.g. avg 4.2% engagement rate, up from 3.1%" />
      </Field>
      <Field label="Top-performing post">
        <input className={inputClass} style={{ borderColor: BORDER }} value={topPost}
          onChange={(e) => setTopPost(e.target.value)} placeholder="e.g. Reel of the new listing walkthrough — 18k views" />
      </Field>
      <Field label="Other highlights (optional)">
        <textarea className={inputClass} style={{ borderColor: BORDER, minHeight: 50 }} value={highlights}
          onChange={(e) => setHighlights(e.target.value)} />
      </Field>

      <button
        onClick={generate}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white mb-4 disabled:opacity-60"
        style={{ background: INK }}
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {loading ? "Writing…" : report ? "Regenerate" : "Generate report"}
      </button>

      {error && <p className="text-sm mb-3" style={{ color: RED }}>{error}</p>}

      {report && (
        <div className="rounded-xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between mb-2">
            <Label>Report — edit freely before sending</Label>
            <div className="flex items-center gap-1.5">
              <button
                onClick={downloadCurrentPdf}
                className="flex items-center gap-1.5 text-xs font-semibold rounded-md px-2.5 py-1.5 transition-colors"
                style={{ background: "#EEF2FF", color: ACCENT }}
              >
                <Download size={13} /> PDF
              </button>
              <CopyButton text={report} />
            </div>
          </div>
          <textarea
            value={report}
            onChange={(e) => setReport(e.target.value)}
            className="w-full text-sm leading-relaxed outline-none resize-y"
            style={{ minHeight: 200, background: "transparent" }}
          />
        </div>
      )}

      <DraftHistory
        title="Past reports" drafts={history}
        onLoad={(d) => { setReport(d.content); setCurrentMeta({ stats: d.stats, generatedAt: d.createdAt }); }}
        onDelete={onDeleteDraft}
        askConfirm={askConfirm} currentUserId={currentUserId}
        onDownloadPdf={downloadHistoryPdf}
      />
    </div>
  );
}
