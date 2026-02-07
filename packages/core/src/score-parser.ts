export interface SetScore {
  reporterScore: number;
  opponentScore: number;
}

export interface ParsedGameCommand {
  opponentUsername: string;
  /** Who won relative to the reporter: 'reporter' or 'opponent' */
  winner: "reporter" | "opponent";
  winnerSets: number;
  loserSets: number;
  setScores: SetScore[] | null;
}

export type ParseError =
  | "no_opponent"
  | "no_scores"
  | "invalid_score_format"
  | "invalid_set_score"
  | "self_play";

export type ParseResult =
  | { ok: true; data: ParsedGameCommand }
  | { ok: false; error: ParseError };

function isValidSetScore(winner: number, loser: number): boolean {
  if (winner < 11) return false;
  if (winner === 11 && loser < 0) return false;
  if (winner === 11 && loser <= 9) return true;
  // Deuce: must win by exactly 2 and both >= 10
  if (winner > 11 && loser >= 10 && winner - loser === 2) return true;
  return false;
}

export function parseGameCommand(
  text: string,
  reporterUsername?: string,
): ParseResult {
  // Remove /game prefix if present
  const cleaned = text.replace(/^\/game\s*/, "").trim();

  // Extract opponent @username
  const mentionMatch = cleaned.match(/@(\w+)/);
  if (!mentionMatch) {
    return { ok: false, error: "no_opponent" };
  }

  const opponentUsername = mentionMatch[1];

  if (
    reporterUsername &&
    opponentUsername.toLowerCase() === reporterUsername.toLowerCase()
  ) {
    return { ok: false, error: "self_play" };
  }

  // Get everything after the mention
  const afterMention = cleaned.slice(mentionMatch.index! + mentionMatch[0].length).trim();

  if (!afterMention) {
    return { ok: false, error: "no_scores" };
  }

  // Check for "won X-Y" pattern (explicit winner declaration)
  const wonMatch = afterMention.match(/^won\s+(\d+)-(\d+)$/i);
  if (wonMatch) {
    const winnerSets = parseInt(wonMatch[1], 10);
    const loserSets = parseInt(wonMatch[2], 10);
    if (winnerSets <= loserSets) {
      return { ok: false, error: "invalid_score_format" };
    }
    return {
      ok: true,
      data: {
        opponentUsername,
        winner: "reporter",
        winnerSets,
        loserSets,
        setScores: null,
      },
    };
  }

  // Parse score pairs: "11-7 11-5" or "11-7, 11-5" or "2-0"
  const scoreStr = afterMention.replace(/,/g, " ");
  const scorePairs = scoreStr.match(/\d+-\d+/g);

  if (!scorePairs || scorePairs.length === 0) {
    return { ok: false, error: "no_scores" };
  }

  const scores = scorePairs.map((pair) => {
    const [a, b] = pair.split("-").map(Number);
    return { a, b };
  });

  // Determine if these are set scores (>=11) or set counts
  const looksLikeSetScores = scores.some((s) => s.a >= 11 || s.b >= 11);

  if (looksLikeSetScores) {
    // Detailed set scores
    const setScores: SetScore[] = [];
    let reporterSets = 0;
    let opponentSets = 0;

    for (const s of scores) {
      const high = Math.max(s.a, s.b);
      const low = Math.min(s.a, s.b);
      if (!isValidSetScore(high, low)) {
        return { ok: false, error: "invalid_set_score" };
      }
      if (s.a > s.b) {
        reporterSets++;
      } else {
        opponentSets++;
      }
      setScores.push({ reporterScore: s.a, opponentScore: s.b });
    }

    const reporterWon = reporterSets > opponentSets;
    return {
      ok: true,
      data: {
        opponentUsername,
        winner: reporterWon ? "reporter" : "opponent",
        winnerSets: Math.max(reporterSets, opponentSets),
        loserSets: Math.min(reporterSets, opponentSets),
        setScores,
      },
    };
  } else {
    // Set count only, e.g. "2-0"
    if (scores.length !== 1) {
      return { ok: false, error: "invalid_score_format" };
    }
    const { a, b } = scores[0];
    if (a === b) {
      return { ok: false, error: "invalid_score_format" };
    }
    const reporterWon = a > b;
    return {
      ok: true,
      data: {
        opponentUsername,
        winner: reporterWon ? "reporter" : "opponent",
        winnerSets: Math.max(a, b),
        loserSets: Math.min(a, b),
        setScores: null,
      },
    };
  }
}
