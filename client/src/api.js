// Thin fetch wrapper around the backend's /api routes. Every call includes
// the session cookie so the backend's requireAuth middleware recognizes us.

const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  // A 401 from /auth/* is the endpoint's own real answer (wrong password,
  // rate-limited, not logged in yet) — let it fall through to the generic
  // handling below so the actual message reaches the user. A 401 from any
  // other route means our session expired mid-use, which callers use to
  // bounce back to the login screen.
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const err = new Error("Not authenticated");
    err.status = 401;
    throw err;
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  bootstrapStatus: () => request("/auth/bootstrap-status"),
  bootstrap: ({ name, email, password }) =>
    request("/auth/bootstrap", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  login: ({ email, password }) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),
  updateProfile: ({ name }) => request("/auth/me", { method: "PATCH", body: JSON.stringify({ name }) }),
  changePassword: ({ currentPassword, newPassword }) =>
    request("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  logoutOtherSessions: () => request("/auth/logout-other-sessions", { method: "POST" }),
  emailStatus: () => request("/auth/email-status"),
  forgotPassword: ({ email }) =>
    request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: ({ token, newPassword }) =>
    request("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword }) }),

  listUsers: () => request("/users"),
  createUser: (data) => request("/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id, data) => request(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  resetUserPassword: (id) => request(`/users/${id}/reset-password`, { method: "POST" }),

  listClients: () => request("/clients"),
  createClient: (data) => request("/clients", { method: "POST", body: JSON.stringify(data) }),
  updateClient: (id, data) => request(`/clients/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteClient: (id) => request(`/clients/${id}`, { method: "DELETE" }), // soft delete — moves to Trash

  listDeletedClients: () => request("/clients/deleted"),
  restoreClient: (id) => request(`/clients/${id}/restore`, { method: "POST" }),
  permanentlyDeleteClient: (id) => request(`/clients/${id}/permanent`, { method: "DELETE" }),

  addNote: (clientId, text) =>
    request(`/clients/${clientId}/notes`, { method: "POST", body: JSON.stringify({ text }) }),
  updateNote: (clientId, noteId, text) =>
    request(`/clients/${clientId}/notes/${noteId}`, { method: "PATCH", body: JSON.stringify({ text }) }),
  deleteNote: (clientId, noteId) =>
    request(`/clients/${clientId}/notes/${noteId}`, { method: "DELETE" }),

  deleteDraft: (clientId, draftId) =>
    request(`/clients/${clientId}/drafts/${draftId}`, { method: "DELETE" }),

  addCalendarItem: (clientId, data) =>
    request(`/clients/${clientId}/calendar`, { method: "POST", body: JSON.stringify(data) }),
  updateCalendarItem: (clientId, itemId, data) =>
    request(`/clients/${clientId}/calendar/${itemId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCalendarItem: (clientId, itemId) =>
    request(`/clients/${clientId}/calendar/${itemId}`, { method: "DELETE" }),

  draftEmail: (payload) => request("/ai/email", { method: "POST", body: JSON.stringify(payload) }),
  generateReport: (payload) => request("/ai/report", { method: "POST", body: JSON.stringify(payload) }),
};
