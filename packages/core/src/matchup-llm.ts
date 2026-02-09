export interface MatchupCommentaryContext {
  player1: { name: string; elo: number };
  player2: { name: string; elo: number };
  h2h?: { wins1: number; wins2: number; total: number };
}

const SYSTEM_PROMPT = `You are SmashRank, a boxing-style fight card announcer for an office ping pong league.
You generate SHORT, dramatic "Matchup of the Day" messages to hype an upcoming match.

Rules:
- Max 3 lines of text. Be concise.
- Use 1-2 relevant emojis per message.
- Create boxing/MMA-style fight card hype. Build anticipation.
- Reference ELO ratings, head-to-head history if available.
- End with something like "Who will step up?" or "Time to settle this!"
- Never be mean or personal — keep it lighthearted and exciting.
- Do not use markdown formatting.`;

const LANGUAGE_DIRECTIVES: Record<string, string> = {
  en: "Respond in English.",
  ru: "Respond in Russian.",
};

export async function generateMatchupCommentary(
  context: MatchupCommentaryContext,
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
