export interface MatchCommentaryContext {
  winner: { name: string; elo_before: number; elo_after: number };
  loser: { name: string; elo_before: number; elo_after: number };
  set_scores: string;
  elo_change: number;
  is_upset: boolean;
  elo_gap: number;
  winner_streak: number;
}

const SYSTEM_PROMPT = `You are SmashRank, a witty sports commentator for an office ping pong league.
You generate SHORT, fun, engaging messages about match results.

Rules:
- Max 3 lines of text. Be concise.
- Use 1-2 relevant emojis per message.
- Reference the context: streaks, rivalries, rank changes, upsets.
- Vary your style: sometimes hype, sometimes dry humor, sometimes dramatic.
- Never be mean or personal — keep it lighthearted.
- Always include the ELO changes as: "PlayerName: 1000 → 1016 (+16)"
- Do not use markdown formatting.`;

const LANGUAGE_DIRECTIVES: Record<string, string> = {
  en: "Respond in English.",
  ru: "Respond in Russian.",
};

export async function generateMatchCommentary(
  context: MatchCommentaryContext,
  language: string = "en",
  timeoutMs: number = 3000,
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENROUTER_MODEL ?? "google/gemini-2.0-flash-001";
  const langDirective = LANGUAGE_DIRECTIVES[language] ?? LANGUAGE_DIRECTIVES.en;

  const userMessage = JSON.stringify(context);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT}\n\n${langDirective}` },
          { role: "user", content: userMessage },
        ],
        max_tokens: 200,
        temperature: 0.9,
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
