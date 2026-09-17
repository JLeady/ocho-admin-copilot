import { Router } from "express";
import { Anthropic, generateText } from "../anthropicClient.js";
import { appendDraft } from "../db.js";

const router = Router();

const EMAIL_PURPOSE_LABELS = {
  checkin: "Friendly check-in",
  status: "Status update",
  followup: "Follow-up after a meeting",
  approval: "Chase content approval",
  custom: "Custom (described below)",
};

function contactsLine(contacts) {
  if (!Array.isArray(contacts) || contacts.length === 0) return "not specified";
  return contacts.map((c) => (c.role ? `${c.name} (${c.role})` : c.name)).join(", ");
}

function handleAnthropicError(err, res) {
  console.error("Anthropic API error:", err);
  if (err instanceof Anthropic.AuthenticationError) {
    return res.status(500).json({ error: "Server AI configuration error (invalid API key)." });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return res.status(429).json({ error: "Rate limited by Claude — try again in a moment." });
  }
  if (err instanceof Anthropic.BadRequestError) {
    return res.status(502).json({ error: "The AI request was malformed." });
  }
  if (err instanceof Anthropic.APIError) {
    return res.status(502).json({ error: `AI service error: ${err.message}` });
  }
  return res.status(err.status || 500).json({ error: err.message || "Failed to generate content." });
}

router.post("/email", async (req, res) => {
  const { clientId, client, purpose, customNote, recentNotes } = req.body || {};
  if (!clientId) return res.status(400).json({ error: "Missing clientId" });
  if (!client?.name) return res.status(400).json({ error: "Missing client details" });

  const purposeLabel = EMAIL_PURPOSE_LABELS[purpose] || EMAIL_PURPOSE_LABELS.checkin;
  const notesBlock =
    Array.isArray(recentNotes) && recentNotes.length
      ? recentNotes.map((n) => `- ${new Date(n.date).toLocaleDateString()}: ${n.text}`).join("\n")
      : "No notes logged yet.";

  const prompt = `You are helping a social media agency owner named Christie draft a short, warm, professional email to her client.

Client: ${client.name} (${client.businessType || "not specified"})
Main contact(s): ${contactsLine(client.contacts)}
Client goals: ${client.goals || "not specified"}

Recent notes / history with this client:
${notesBlock}

Email purpose: ${purposeLabel}${purpose === "custom" ? `\nSpecific instructions: ${customNote || "none given"}` : ""}

Write only the email itself (including a short subject line on the first line as "Subject: ..."), no preamble or explanation. Keep it warm, concise, and specific to this client's context — avoid generic filler. Sign off as Christie.`;

  try {
    const text = await generateText(prompt);
    const draft = await appendDraft(clientId, {
      kind: "email",
      purpose,
      content: text,
      createdBy: { id: req.user.id, name: req.user.name },
    });
    res.json({ text, draft });
  } catch (err) {
    handleAnthropicError(err, res);
  }
});

router.post("/report", async (req, res) => {
  const { clientId, client, stats } = req.body || {};
  if (!clientId) return res.status(400).json({ error: "Missing clientId" });
  if (!client?.name) return res.status(400).json({ error: "Missing client details" });

  const { postsPublished, followerGrowth, engagement, topPost, highlights } = stats || {};

  const prompt = `You are helping a social media agency owner named Christie turn raw monthly stats into a polished, client-ready report summary.

Client: ${client.name} (${client.businessType || "not specified"})
Client goals: ${client.goals || "not specified"}

Raw stats this period:
- Posts published: ${postsPublished || "not provided"}
- Follower growth: ${followerGrowth || "not provided"}
- Engagement: ${engagement || "not provided"}
- Top-performing post: ${topPost || "not provided"}
- Other highlights / context: ${highlights || "none"}

Write a short, polished report summary (4-6 sentences plus a brief "what's next" line) that Christie could send or paste into a report. Reference the client's own goals where relevant. No preamble, just the report text.`;

  try {
    const text = await generateText(prompt);
    const draft = await appendDraft(clientId, {
      kind: "report",
      content: text,
      stats: stats || null,
      createdBy: { id: req.user.id, name: req.user.name },
    });
    res.json({ text, draft });
  } catch (err) {
    handleAnthropicError(err, res);
  }
});

export default router;
