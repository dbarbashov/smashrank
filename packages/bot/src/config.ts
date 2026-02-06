export interface Config {
  botToken: string;
  defaultLang: string;
}

export function loadConfig(): Config {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
  }
  return {
    botToken,
    defaultLang: process.env.DEFAULT_LANG ?? "en",
  };
}
