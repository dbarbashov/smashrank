export interface DigestData {
  groupName: string;
  matchCount: number;
  mostActive: { name: string; count: number } | null;
  biggestGainer: { name: string; change: number } | null;
  biggestLoser: { name: string; change: number } | null;
  longestStreak: { name: string; streak: number } | null;
  newAchievements: { playerName: string; achievementName: string; emoji: string }[];
}

const DIGEST_SYSTEM_PROMPT = `You are SmashRank, a witty office ping pong league bot.
Generate a fun weekly digest summary from the stats provided.
Rules:
- Max 8 lines. Be engaging and concise.
- Use 2-3 relevant emojis.
- Highlight notable events: biggest movers, streaks, achievements.
- Keep tone lighthearted and encouraging.
- Do not use markdown formatting.`;

const LANGUAGE_DIRECTIVES: Record<string, string> = {
  en: "Respond in English.",
  ru: "Respond in Russian.",
};

export async function generateDigestCommentary(
  data: DigestData,
  language: string = "en",
  timeoutMs: number = 5000,
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENROUTER_MODEL ?? "google/gemini-2.0-flash-001";
  const langDirective = LANGUAGE_DIRECTIVES[language] ?? LANGUAGE_DIRECTIVES.en;

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
          { role: "system", content: `${DIGEST_SYSTEM_PROMPT}\n\n${langDirective}` },
          { role: "user", content: JSON.stringify(data) },
        ],
        max_tokens: 400,
        temperature: 0.9,
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const result = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return result.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function formatDigestFallback(
  data: DigestData,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (data.matchCount === 0) {
    return t("digest.no_activity");
  }

  const lines = [
    t("digest.title", { group: data.groupName }),
    "",
    t("digest.matches", { count: data.matchCount }),
  ];

  if (data.mostActive) {
    lines.push(t("digest.most_active", { name: data.mostActive.name, count: data.mostActive.count }));
  }
  if (data.biggestGainer && data.biggestGainer.change > 0) {
    lines.push(t("digest.biggest_gainer", { name: data.biggestGainer.name, change: data.biggestGainer.change }));
  }
  if (data.biggestLoser && data.biggestLoser.change < 0) {
    lines.push(t("digest.biggest_loser", { name: data.biggestLoser.name, change: data.biggestLoser.change }));
  }
  if (data.longestStreak) {
    lines.push(t("digest.longest_streak", { name: data.longestStreak.name, streak: data.longestStreak.streak }));
  }

  if (data.newAchievements.length > 0) {
    lines.push("");
    for (const a of data.newAchievements) {
      lines.push(`${a.emoji} ${a.playerName}: ${a.achievementName}`);
    }
  }

  return lines.join("\n");
}
