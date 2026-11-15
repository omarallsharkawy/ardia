export const MAX_OPEN_LINKS = 20;

const OPENABLE = new Set(["http:", "https:", "file:"]);

// Links another app handed to the `ardia` launcher (Linux: Ardia is running, so the launcher passes them here instead
// of to Chrome's own command line, which would open plain tabs and skip Settings › General › Open links from other
// apps in Little Ardia).
export function parseOpenLinks(params: Record<string, unknown>): string[] | { error: string } {
  const { urls } = params;
  if (!Array.isArray(urls) || !urls.length) return { error: "urls must be a non-empty list of links." };
  if (urls.length > MAX_OPEN_LINKS) return { error: `At most ${MAX_OPEN_LINKS} links at once.` };
  const links: string[] = [];
  for (const url of urls) {
    if (typeof url !== "string") return { error: "Each link must be a string." };
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { error: `${url} isn't a link.` };
    }
    if (!OPENABLE.has(parsed.protocol)) return { error: `${parsed.protocol} links can't open from other apps.` };
    links.push(parsed.href);
  }
  return links;
}
