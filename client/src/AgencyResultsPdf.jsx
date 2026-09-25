import { Document, Page, View, Text, Image, StyleSheet, pdf } from "@react-pdf/renderer";
import ochoLogo from "./assets/ocho-logo.png";

const INK = "#1A1A2E";
const ACCENT = "#2E5BFF";
const MUTED = "#6B6B76";
const BORDER = "#E4E6EF";
const PANEL = "#F5F6FA";

// Same measured badge crop as ReportPdf.jsx / Login.jsx — see ReportPdf.jsx
// for the full explanation. Kept self-contained here rather than imported,
// matching how Login.jsx and ReportPdf.jsx each keep their own copy.
const LOGO_NATURAL_WIDTH = 263;
const LOGO_NATURAL_HEIGHT = 209;
const LOGO_MARK_CENTER_X = 124.5;
const LOGO_MARK_CENTER_Y = 99.5;
const LOGO_FILL_SCALE = 1.4;

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
    flexGrow: 1, minWidth: 130, padding: 10, borderRadius: 6,
    backgroundColor: PANEL, marginRight: 8, marginBottom: 8,
  },
  statValue: { fontSize: 16, fontFamily: "Helvetica-Bold", color: ACCENT },
  statLabel: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 3 },
  sectionLabel: {
    fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase",
    letterSpacing: 1, color: MUTED, marginBottom: 10,
  },
  clientBlock: {
    marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  clientName: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  clientDate: { fontSize: 8.5, color: MUTED, marginBottom: 6 },
  bulletRow: { flexDirection: "row", marginBottom: 2 },
  bulletLabel: { fontSize: 9.5, color: MUTED, width: 110 },
  bulletValue: { fontSize: 9.5, flex: 1 },
  footer: {
    position: "absolute", bottom: 32, left: 48, right: 48,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 8, color: MUTED, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 8,
  },
});

function StatBox({ label, value }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Bullet({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletLabel}>{label}</Text>
      <Text style={styles.bulletValue}>{value}</Text>
    </View>
  );
}

export function AgencyResultsDocument({ summary, generatedAt }) {
  const dateLabel = new Date(generatedAt).toLocaleDateString(undefined, {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <Document title={`Ocho The Agency — Results — ${dateLabel}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.logoBox}>
            <Image src={ochoLogo} style={logoCropStyle(LOGO_BOX)} />
          </View>
          <Text style={styles.agencyName}>Ocho The Agency</Text>
        </View>

        <Text style={styles.title}>Agency Results</Text>
        <Text style={styles.subtitle}>Snapshot as of {dateLabel}</Text>

        <View style={styles.statsRow}>
          <StatBox label="Active clients" value={summary.totalActiveClients} />
          <StatBox label="Clients with a report on file" value={summary.clientsWithReports} />
          <StatBox label="Reports generated (last 30 days)" value={summary.reportsLast30Days} />
        </View>

        <Text style={styles.sectionLabel}>Latest results by client</Text>
        {summary.clientSummaries.length === 0 ? (
          <Text style={{ fontSize: 10, color: MUTED }}>No client reports on file yet.</Text>
        ) : (
          summary.clientSummaries.map(({ client, latestReport }) => {
            const reportDate = new Date(latestReport.createdAt).toLocaleDateString(undefined, {
              day: "numeric", month: "short", year: "numeric",
            });
            const stats = latestReport.stats || {};
            return (
              <View key={client.id} style={styles.clientBlock} wrap={false}>
                <Text style={styles.clientName}>{client.name}</Text>
                <Text style={styles.clientDate}>Most recent report · {reportDate}</Text>
                <Bullet label="Posts published" value={stats.postsPublished} />
                <Bullet label="Follower growth" value={stats.followerGrowth} />
                <Bullet label="Engagement" value={stats.engagement} />
                <Bullet label="Top-performing post" value={stats.topPost} />
              </View>
            );
          })
        )}

        <View style={styles.footer} fixed>
          <Text>Prepared by Ocho The Agency</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function downloadAgencyResultsPdf({ summary, generatedAt }) {
  const blob = await pdf(<AgencyResultsDocument summary={summary} generatedAt={generatedAt} />).toBlob();

  const dateStr = new Date(generatedAt).toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Ocho The Agency - Results - ${dateStr}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
