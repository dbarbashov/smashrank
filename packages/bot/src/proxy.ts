import fetch from "node-fetch";
import { SocksProxyAgent } from "socks-proxy-agent";

export function createSocksAgent(proxyUrl: string): SocksProxyAgent {
  return new SocksProxyAgent(proxyUrl);
}

export function installProxyFetch(proxyUrl: string): SocksProxyAgent {
  const agent = createSocksAgent(proxyUrl);
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    return fetch(input, { ...init, agent });
  }) as unknown as typeof globalThis.fetch;
  return agent;
}
