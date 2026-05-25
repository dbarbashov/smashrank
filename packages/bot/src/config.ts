export interface Config {
  botToken: string;
  defaultLang: string;
  outboundProxyUrl?: string;
}

export function loadConfig(): Config {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
  }
  const outboundProxyUrl = process.env.OUTBOUND_PROXY_URL
    ?? process.env.TELEGRAM_PROXY_URL
    ?? process.env.ALL_PROXY
    ?? process.env.all_proxy;
  if (outboundProxyUrl) {
    const protocol = new URL(outboundProxyUrl).protocol;
    if (!protocol.startsWith("socks")) {
      throw new Error("OUTBOUND_PROXY_URL/TELEGRAM_PROXY_URL must use a SOCKS proxy URL, e.g. socks5h://host:port");
    }
  }
  return {
    botToken,
    defaultLang: process.env.DEFAULT_LANG ?? "en",
    outboundProxyUrl,
  };
}
