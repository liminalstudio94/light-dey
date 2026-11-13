/** Identifies us to source sites without any personal details. */
export const USER_AGENT = `LightDey/1.0 (+${process.env.NEXT_PUBLIC_SITE_URL ?? "https://light-dey-pink.vercel.app"}/sources; community electricity map)`;

export type Fetcher = (url: string) => Promise<{ status: number; text: string }>;

export const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/rss+xml,application/xml;q=0.9" }, signal: AbortSignal.timeout(12_000), cache: "no-store" });
  return { status: res.status, text: await res.text() };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET with retries (exponential backoff) on network errors, 429 and 5xx. 4xx other than 429 fail immediately. */
export async function fetchWithRetry(fetcher: Fetcher, url: string, log: string[], attempts = 3, baseDelayMs = 1_000): Promise<{ text: string; attempts: number }> {
  let lastErr = "";
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetcher(url);
      if (r.status >= 200 && r.status < 300) {
        log.push(`GET ${url} -> ${r.status} (${r.text.length} bytes, attempt ${i})`);
        return { text: r.text, attempts: i };
      }
      lastErr = `HTTP ${r.status}`;
      log.push(`GET ${url} -> ${r.status} (attempt ${i})`);
      if (r.status !== 429 && r.status < 500) break;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      log.push(`GET ${url} failed: ${lastErr} (attempt ${i})`);
    }
    if (i < attempts) await sleep(baseDelayMs * 2 ** (i - 1));
  }
  throw new RetryError(`${url}: ${lastErr}`, attempts);
}

export class RetryError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
  ) {
    super(message);
  }
}

export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'");
}

export const stripTags = (html: string) => decodeEntities(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
