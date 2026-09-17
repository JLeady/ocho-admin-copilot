import { Document, Page, View, Text, Image, StyleSheet, pdf } from "@react-pdf/renderer";
import ochoLogo from "./assets/ocho-logo.png";

const INK = "#1A1A2E";
const ACCENT = "#2E5BFF";
const MUTED = "#6B6B76";
const BORDER = "#E4E6EF";
const PANEL = "#F5F6FA";

// Same measured badge bounds used for the login screen's logo crop (see
// Login.jsx) — the source file is a 263×209 rectangle with the actual mark
// sitting inside it as a 149px circle centered at (124.5, 99.5), rather than
// filling the canvas. Re-deriving the crop here at whatever box size the PDF
// wants, instead of hard-coding pixel offsets for one size.
const LOGO_NATURAL_WIDTH = 263;
const LOGO_NATURAL_HEIGHT = 209;
const LOGO_MARK_CENTER_X = 124.5;
const LOGO_MARK_CENTER_Y = 99.5;
const LOGO_FILL_SCALE = 1.4; // matches the login screen's slight overfill

function logoCropStyle(boxSize) {
  const scale = LOGO_FILL_SCALE * (boxSize / 200);
  return {
    width: LOGO_NATURAL_WIDTH * scale,
    height: LOGO_NATURAL_HEIGHT * scale,
    position: "absolute",
    left: boxSize / 2 - LOGO_MARK_CENTER_X * scale,
    top: boxSize / 2 - LOGO_MARK_CENTER_Y * scale,
  };
}

const LOGO_BOX = 32;

const styles = StyleSheet.create({
  page: { padding: 48, paddingBottom: 64, fontSize: 11, fontFamily: "Helvetica", color: INK },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 28 },
  logoBox: {
    width: LOGO_BOX, height: LOGO_BOX, borderRadius: LOGO_BOX / 2,
    overflow: "hidden", backgroundColor: INK, marginRight: 10,
  },
  agencyName: {
    fontSize: 10, fontFamily: "Helvetica-Bold", textTransform: "uppercase",
    letterSpacing: 1.5, color: MUTED,
  },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  subtitle: { fontSize: 10, color: MUTED, marginBottom: 26 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 26 },
  statBox: {
    flexGrow: 1, minWidth: 110, padding: 10, borderRadius: 6,
    backgroundColor: PANEL, marginRight: 8, marginBottom: 8,
  },
  statValue: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  statLabel: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 3 },
  bodyText: { fontSize: 11, lineHeight: 1.6 },
  footer: {
    position: "absolute", bottom: 32, left: 48, right: 48,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 8, color: MUTED, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 8,
  },
});

function StatBox({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function ReportDocument({ client, content, stats, generatedAt }) {
  const dateLabel = new Date(generatedAt).toLocaleDateString(undefined, {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <Document title={`${client.name} — Report — ${dateLabel}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.logoBox}>
            <Image src={ochoLogo} style={logoCropStyle(LOGO_BOX)} />
          </View>
          <Text style={styles.agencyName}>Ocho The Agency</Text>
        </View>

        <Text style={styles.title}>{client.name}</Text>
        <Text style={styles.subtitle}>Performance report · {dateLabel}</Text>

        {stats && (
          <View style={styles.statsRow}>
            <StatBox label="Posts published" value={stats.postsPublished} />
            <StatBox label="Follower growth" value={stats.followerGrowth} />
            <StatBox label="Engagement" value={stats.engagement} />
            <StatBox label="Top-performing post" value={stats.topPost} />
          </View>
        )}

        <Text style={styles.bodyText}>{content}</Text>

        <View style={styles.footer} fixed>
          <Text>Prepared by Ocho The Agency</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, "").trim();
}

// Builds the PDF and triggers a normal browser download — this is a real
// local app in the user's own browser, not a sandboxed viewer, so a plain
// blob-URL download works fine here.
export async function downloadReportPdf({ client, content, stats, generatedAt }) {
  const blob = await pdf(
    <ReportDocument client={client} content={content} stats={stats} generatedAt={generatedAt} />
  ).toBlob();

  const dateStr = new Date(generatedAt).toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(client.name)} - Report - ${dateStr}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
