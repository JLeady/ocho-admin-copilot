import { useState, useEffect } from "react";
import { Lock, Mail, User, Loader2, KeyRound } from "lucide-react";
import { api } from "./api";
import ochoLogo from "./assets/ocho-logo.png";

const INK = "#1A1A2E";
const BG = "#F5F6FA";
const CARD = "#FFFFFF";
const BORDER = "#E4E6EF";
const ACCENT = "#2E5BFF";
const MUTED = "#6B6B76";
const RED = "#E5484D";

// Bigger, softer inputs than the rest of the app on purpose — this screen is
// meant to feel like a proper front door, not a compact form.
const inputClass =
  "w-full rounded-2xl pl-11 pr-4 py-3.5 text-[15px] outline-none border transition-colors focus:border-[#2E5BFF]";

function Wordmark() {
  return (
    <div className="flex items-baseline gap-0.5">
      <span className="font-sans font-extrabold text-2xl tracking-tight" style={{ color: INK }}>Ocho</span>
      <span className="font-sans font-extrabold text-2xl tracking-tight" style={{ color: ACCENT }}>.AI</span>
    </div>
  );
}

// The real Ocho The Agency badge. The source file is a 263×209 rectangle
// with the circular mark sitting inside it (measured bounds: a 149px circle
// centered at 124.5, 99.5) rather than filling the canvas edge-to-edge, so a
// plain object-fit: cover leaves a ring of the file's own background
// visible. Instead, position and scale the image explicitly — computed from
// those measured bounds — so the mark itself fills the circular frame.
const LOGO_NATURAL_WIDTH = 263;
const LOGO_NATURAL_HEIGHT = 209;
const LOGO_MARK_CENTER_X = 124.5;
const LOGO_MARK_CENTER_Y = 99.5;
const LOGO_BOX_SIZE = 200;
const LOGO_SCALE = 1.4; // slight overfill so no background edge peeks through

function BrandBadge() {
  return (
    <div
      className="relative rounded-full overflow-hidden flex-shrink-0"
      style={{ width: LOGO_BOX_SIZE, height: LOGO_BOX_SIZE, border: "1px solid rgba(255,255,255,0.1)" }}
    >
      <img
        src={ochoLogo}
        alt="Ocho The Agency"
        style={{
          position: "absolute",
          width: LOGO_NATURAL_WIDTH * LOGO_SCALE,
          height: LOGO_NATURAL_HEIGHT * LOGO_SCALE,
          maxWidth: "none",
          left: LOGO_BOX_SIZE / 2 - LOGO_MARK_CENTER_X * LOGO_SCALE,
          top: LOGO_BOX_SIZE / 2 - LOGO_MARK_CENTER_Y * LOGO_SCALE,
        }}
      />
    </div>
  );
}

function BrandPanel() {
  return (
    <div className="hidden md:flex md:w-1/2 flex-col items-center justify-center px-10 relative" style={{ background: INK }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="relative flex flex-col items-center text-center">
        <BrandBadge />
        <p className="text-sm mt-7 max-w-[240px]" style={{ color: "rgba(255,255,255,0.45)" }}>
          Internal tools for the Ocho The Agency team.
        </p>
      </div>
    </div>
  );
}

function AuthShell({ children }) {
  return (
    <div className="h-screen w-full flex items-center justify-center p-0 md:p-8" style={{ background: BG }}>
      <div
        className="relative w-full h-full md:h-[85vh] md:max-w-5xl md:rounded-[2rem] overflow-hidden flex shadow-xl"
        style={{ background: CARD }}
      >
        <div className="w-full md:w-1/2 flex items-center justify-center px-6 sm:px-12 md:px-16 py-10 overflow-y-auto">
          <div className="w-full max-w-sm">
            <div className="md:hidden mb-8">
              <Wordmark />
              <div className="font-mono text-[10px] uppercase tracking-widest mt-1" style={{ color: MUTED }}>
                Ocho The Agency
              </div>
            </div>
            {children}
          </div>
        </div>
        <BrandPanel />
      </div>
    </div>
  );
}

function Heading({ title, subtitle }) {
  return (
    <div className="mb-7">
      <div className="hidden md:block mb-4"><Wordmark /></div>
      <h1 className="font-extrabold text-[26px] tracking-tight mb-1.5" style={{ color: INK }}>{title}</h1>
      <p className="text-sm" style={{ color: MUTED }}>{subtitle}</p>
    </div>
  );
}

function IconField({ icon: Icon, ...props }) {
  return (
    <div className="relative mb-3.5">
      <Icon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" color={MUTED} />
      <input className={inputClass} style={{ borderColor: BORDER }} {...props} />
    </div>
  );
}

function PrimaryButton({ loading, loadingLabel, children, ...props }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className="w-full rounded-full py-3.5 text-sm font-bold uppercase tracking-wide text-white transition-opacity
        disabled:opacity-40 flex items-center justify-center gap-2"
      style={{ background: ACCENT }}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {loading ? loadingLabel : children}
    </button>
  );
}

// ---------- login ----------
export default function Login({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError("");
    try {
      const { user } = await api.login({ email, password });
      onSuccess(user);
    } catch (err) {
      setError(err.message || "Login failed — check connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (forgotOpen) {
    return (
      <AuthShell>
        <ForgotPasswordPanel onBack={() => setForgotOpen(false)} />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <Heading title="Sign in" subtitle="Enter your email and password to continue." />

        <IconField
          icon={Mail} type="email" autoFocus value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="Email"
        />
        <IconField
          icon={Lock} type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="Password"
        />

        <div className="flex justify-end mb-3 -mt-1">
          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="text-xs font-semibold"
            style={{ color: ACCENT }}
          >
            Forgot password?
          </button>
        </div>

        {error && <p className="text-sm mb-3" style={{ color: RED }}>{error}</p>}

        <div className="mt-5">
          <PrimaryButton type="submit" loading={loading} loadingLabel="Signing in…" disabled={!email || !password}>
            Log in
          </PrimaryButton>
        </div>

        <p className="text-xs text-center mt-5" style={{ color: MUTED }}>
          Don't have an account? Ask your team owner to add you.
        </p>
      </form>
    </AuthShell>
  );
}

// Checks whether email sending is actually configured server-side before
// promising a reset email — see server/src/email.js. If it isn't, this
// points people at the fallback (an owner resetting them from Team) instead
// of pretending to send something that was never going to arrive.
function ForgotPasswordPanel({ onBack }) {
  const [checking, setChecking] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.emailStatus()
      .then((res) => setConfigured(!!res.configured))
      .catch(() => setConfigured(false))
      .finally(() => setChecking(false));
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError("");
    try {
      await api.forgotPassword({ email });
      setSent(true);
    } catch (err) {
      setError(err.message || "Something went wrong — check connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Heading
        title="Reset your password"
        subtitle={configured ? "Enter your email and we'll send you a reset link." : "Self-service reset isn't set up yet."}
      />

      {checking ? (
        <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin" color={MUTED} /></div>
      ) : !configured ? (
        <p className="text-sm mb-5 rounded-lg p-3" style={{ color: MUTED, background: BG }}>
          Ask your team owner to reset your password for you from Team, inside the app.
        </p>
      ) : sent ? (
        <p className="text-sm mb-5 rounded-lg p-3" style={{ color: MUTED, background: BG }}>
          If an account exists for that email, we've sent a link to reset your password. It expires in 1 hour.
        </p>
      ) : (
        <form onSubmit={submit}>
          <IconField
            icon={Mail} type="email" autoFocus value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="Email"
          />
          {error && <p className="text-sm mb-3" style={{ color: RED }}>{error}</p>}
          <PrimaryButton type="submit" loading={loading} loadingLabel="Sending…" disabled={!email}>
            Send reset link
          </PrimaryButton>
        </form>
      )}

      <button type="button" onClick={onBack} className="text-xs font-semibold mt-5" style={{ color: ACCENT }}>
        ← Back to login
      </button>
    </div>
  );
}

// ---------- first-run setup (creates the owner account) ----------
export function Setup({ onSuccess }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { user } = await api.bootstrap({ name, email, password });
      onSuccess(user);
    } catch (err) {
      setError(err.message || "Couldn't create your account — check connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <Heading
          title="Create your account"
          subtitle="No accounts exist yet, so this one becomes the owner account. Add your team afterward from Team in the sidebar."
        />

        <IconField icon={User} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        <IconField icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <IconField
          icon={Lock} type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="Password (min. 8 characters)"
        />
        <IconField
          icon={Lock} type="password" value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password"
        />

        {error && <p className="text-sm mb-3" style={{ color: RED }}>{error}</p>}

        <div className="mt-5">
          <PrimaryButton
            type="submit" loading={loading} loadingLabel="Creating…"
            disabled={!name || !email || !password || !confirmPassword}
          >
            Create account
          </PrimaryButton>
        </div>
      </form>
    </AuthShell>
  );
}

// ---------- forced password change (after an admin issues a temp password) ----------
export function ForcePasswordChange({ onSuccess }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { user } = await api.changePassword({ currentPassword, newPassword });
      onSuccess(user);
    } catch (err) {
      setError(err.message || "Couldn't change your password — check connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <Heading title="Set a new password" subtitle="You're using a temporary password — set your own to continue." />

        <IconField
          icon={KeyRound} type="password" autoFocus value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Temporary password"
        />
        <IconField
          icon={Lock} type="password" value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (min. 8 characters)"
        />
        <IconField
          icon={Lock} type="password" value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password"
        />

        {error && <p className="text-sm mb-3" style={{ color: RED }}>{error}</p>}

        <div className="mt-5">
          <PrimaryButton
            type="submit" loading={loading} loadingLabel="Saving…"
            disabled={!currentPassword || !newPassword || !confirmPassword}
          >
            Set password
          </PrimaryButton>
        </div>
      </form>
    </AuthShell>
  );
}

// ---------- reset password (opened from the emailed link, ?token=...) ----------
export function ResetPassword({ token, onSuccess, onCancel }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { user } = await api.resetPassword({ token, newPassword });
      onSuccess(user);
    } catch (err) {
      setError(err.message || "Couldn't reset your password — check connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <Heading title="Choose a new password" subtitle="Set a new password for your account." />

        <IconField
          icon={Lock} type="password" autoFocus value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (min. 8 characters)"
        />
        <IconField
          icon={Lock} type="password" value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password"
        />

        {error && <p className="text-sm mb-3" style={{ color: RED }}>{error}</p>}

        <div className="mt-5">
          <PrimaryButton
            type="submit" loading={loading} loadingLabel="Saving…"
            disabled={!newPassword || !confirmPassword}
          >
            Set password
          </PrimaryButton>
        </div>

        <button
          type="button" onClick={onCancel}
          className="text-xs font-semibold mt-5 block mx-auto"
          style={{ color: MUTED }}
        >
          Back to login
        </button>
      </form>
    </AuthShell>
  );
}
