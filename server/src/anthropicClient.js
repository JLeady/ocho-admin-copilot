import Anthropic from "@anthropic-ai/sdk";

// Model + effort live here in one place so they're easy to tune later.
// claude-sonnet-5 (Anthropic's current mid-tier model, ~60% cheaper than
// Opus 5) is plenty for grounded, short-form writing like this — drafting
// from notes/stats already handed to it, not open-ended reasoning. "medium"
// effort keeps these short drafting tasks (an email, a report paragraph)
// fast and cheap without needing the deeper reasoning "high"/"xhigh" are
// meant for.
const MODEL = "claude-sonnet-5";
const EFFORT = "medium";
const MAX_TOKENS = 2000;

let client = null;

function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "AI drafting isn't set up on this install — ask the account owner to add an ANTHROPIC_API_KEY."
      );
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export async function generateText(prompt) {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: EFFORT },
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("Claude returned an empty response");
  return text;
}

export { Anthropic };
