import { Component } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

const INK = "#1A1A2E";
const BG = "#F5F6FA";
const CARD = "#FFFFFF";
const BORDER = "#E4E6EF";
const ACCENT = "#2E5BFF";
const MUTED = "#6B6B76";
const RED = "#E5484D";

// React error boundaries have to be class components — there's no hook
// equivalent (as of this writing). This is the only class component in the
// app; everything else stays functional.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Goes to the browser console at minimum; if server-side error logging
    // gets added later, this is the spot to also report it there.
    console.error("Ocho AI — caught a render error:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        className="flex flex-col items-center justify-center text-center p-8"
        style={{ background: BG, minHeight: this.props.fill ? "100%" : "100vh" }}
      >
        <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div
            className="mx-auto mb-4 flex items-center justify-center rounded-full"
            style={{ width: 48, height: 48, background: "#FCE8E8" }}
          >
            <AlertTriangle size={22} color={RED} />
          </div>
          <h2 className="font-extrabold text-lg tracking-tight mb-1.5" style={{ color: INK }}>
            {this.props.title || "Something went wrong"}
          </h2>
          <p className="text-sm mb-5" style={{ color: MUTED }}>
            {this.props.message ||
              "This part of the app hit an unexpected error. Your data is safe — try again, or reload the page."}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold text-white"
              style={{ background: ACCENT }}
            >
              <RotateCw size={14} /> Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg py-2.5 px-4 text-sm font-semibold"
              style={{ color: MUTED, border: `1px solid ${BORDER}` }}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
