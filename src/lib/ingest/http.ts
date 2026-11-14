/** Identifies us to source sites without any personal details. */
export const USER_AGENT = `LightDey/1.0 (+${process.env.NEXT_PUBLIC_SITE_URL ?? "https://light-dey-pink.vercel.app"}/sources; community electricity map)`;

export type Fetcher = (url: string) => Promise<{ status: number; text: string }>;

export const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/rss+xml,application/xml;q=0.9" }, signal: AbortSignal.timeout(8_000), cache: "no-store" });
  return { status: res.status, text: await res.text() };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET with retries (exponential backoff) on network errors, 429 and 5xx; other 4xx fail immediately.
 * `deadline` (epoch ms) bounds the whole call, so slow sources can't push a refresh past the function limit.
 */
export async function fetchWithRetry(
  fetcher: Fetcher,
  url: string,
  log: string[],
  { attempts = 3, baseDelayMs = 1_000, deadline = Infinity }: { attempts?: number; baseDelayMs?: number; deadline?: number } = {},
): Promise<{ text: string; attempts: number }> {
  let lastErr = "";
  let i = 0;
  while (i < attempts) {
    if (Date.now() >= deadline) {
      lastErr ||= "deadline reached";
      log.push(`GET ${url}: deadline reached before attempt ${i + 1}`);
      break;
    }
    i++;
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
    const delay = baseDelayMs * 2 ** (i - 1);
    if (i < attempts && Date.now() + delay < deadline) await sleep(delay);
    else if (i < attempts) break;
  }
  throw new RetryError(`${url}: ${lastErr}`, Math.max(i, 1));
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
