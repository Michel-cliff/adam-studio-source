// When the AI fails: what really happened, read from what Codex or Claude printed, and said plainly with what to do.
// No Node here: the studio uses it too.
export type AiProblem = "quota" | "signin" | "missing" | "timeout" | "network";
export type AiFailure = { problem: AiProblem; retry?: string };
type Engine = "claude" | "codex";
type Lang = "en" | "fr";

const RULES: [AiProblem, RegExp][] = [
  ["quota", /usage limit|rate.?limit|quota|limit reached|hit your .*limit|credit balance|too many requests|out of (extra )?usage/i],
  ["signin", /\b401\b|unauthori[sz]ed|not logged in|not signed in|please run .*login|codex login|invalid api key|authentication|sign in/i],
  ["missing", /could not start the AI|ENOENT|not recognized as|command not found/i],
  ["timeout", /took too long|timed? ?out/i],
  ["network", /ENOTFOUND|ECONN|getaddrinfo|network|fetch failed|stream error|overloaded|\b50[234]\b/i],
];

/** Only what the tool reports as a failure: the words of a successful answer may well mention a limit. */
function failureLines(output: string): string[] {
  return output.split("\n").flatMap((line) => {
    if (!line.startsWith("{")) return line.trim() ? [line] : [];
    try {
      const e = JSON.parse(line);
      if (e.type === "error") return [String(e.message ?? "")];
      if (e.type === "turn.failed") return [String(e.error?.message ?? "")];
      if (e.type === "result" && e.is_error) return [String(e.result ?? e.subtype ?? "")];
    } catch { /* not an event */ }
    return [];
  });
}

function retryOf(text: string): string | undefined {
  const at = text.match(/try again at ([^.,)|]+)/i) ?? text.match(/resets? (?:at )?([^.,)|]+)/i);
  if (at) return at[1]!.trim();
  const stamp = text.match(/limit reached\|(\d{10})/i);
  if (stamp) return new Date(Number(stamp[1]) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return undefined;
}

export function aiFailureOf(output: string): AiFailure | null {
  const text = failureLines(output).join("\n");
  const rule = RULES.find(([, re]) => re.test(text));
  if (!rule) return null;
  const retry = rule[0] === "quota" ? retryOf(text) : undefined;
  return { problem: rule[0], ...(retry ? { retry } : {}) };
}

export function aiFailureText(f: AiFailure, engine: Engine, lang: Lang): string {
  const who = engine === "codex" ? "Codex" : "Claude";
  if (lang === "fr") {
    switch (f.problem) {
      case "quota": return `${who} a atteint sa limite d'utilisation${f.retry ? ` (de nouveau disponible à ${f.retry})` : ""}. Change d'IA pour continuer tout de suite.`;
      case "signin": return `${who} n'est pas connecté sur cet ordinateur. Connecte-le ou change d'IA.`;
      case "missing": return `${who} est introuvable sur cet ordinateur. Installe-le ou change d'IA.`;
      case "timeout": return `${who} a mis trop de temps à répondre. Réessaie ou change d'IA.`;
      case "network": return `${who} n'a pas pu être joint (réseau ou service indisponible). Réessaie ou change d'IA.`;
    }
  }
  switch (f.problem) {
    case "quota": return `${who} has reached its usage limit${f.retry ? ` (available again at ${f.retry})` : ""}. Switch AI to carry on right away.`;
    case "signin": return `${who} is not signed in on this computer. Sign in or switch AI.`;
    case "missing": return `${who} was not found on this computer. Install it or switch AI.`;
    case "timeout": return `${who} took too long to answer. Try again or switch AI.`;
    case "network": return `${who} could not be reached (network or service down). Try again or switch AI.`;
  }
}
