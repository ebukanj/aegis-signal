import type { RawItem } from "../../domain/collector";

/**
 * A small, dependency-free RSS/Atom parser.
 *
 * ── Why hand-rolled and not a library ──
 *
 * An RSS feed is a flat list of items with a title, a link, a summary and a date.
 * The platform needs exactly those four fields, from feeds it has already checked.
 * Pulling in a full XML/RSS dependency for four fields is weight the deploy does
 * not need, and every dependency is attack surface and a supply-chain risk this
 * codebase is deliberately sparing with. This parser is ~40 lines, has no
 * dependencies, and does one job.
 *
 * It is intentionally forgiving: feeds are messy, and a single malformed item must
 * never lose the whole batch. An item it cannot parse is skipped, not thrown.
 */
export function parseFeed(xml: string): RawItem[] {
  const items: RawItem[] = [];

  /* RSS uses <item>, Atom uses <entry>. Handle both. */
  const blocks = [
    ...matchAll(xml, /<item[\s>][\s\S]*?<\/item>/gi),
    ...matchAll(xml, /<entry[\s>][\s\S]*?<\/entry>/gi),
  ];

  for (const block of blocks) {
    const title = clean(tag(block, "title"));
    if (!title) continue; // an item with no title is not an item

    const description = clean(
      tag(block, "description") || tag(block, "summary") || tag(block, "content"),
    );

    const url = extractLink(block);
    const publishedAt = parseDate(
      tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || tag(block, "dc:date"),
    );

    items.push({
      title,
      description: description.slice(0, 2000),
      url,
      publishedAt,
      language: "en",
    });
  }

  return items;
}

/* ── Field extraction ──────────────────────────────────────────────── */

function tag(block: string, name: string): string {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i");
  return re.exec(block)?.[1] ?? "";
}

function extractLink(block: string): string | null {
  /* RSS: <link>https://…</link>. Atom: <link href="https://…" />. */
  const rss = /<link[^>]*>([\s\S]*?)<\/link>/i.exec(block)?.[1];
  if (rss && rss.trim().startsWith("http")) return clean(rss);

  const atom = /<link[^>]*href="([^"]+)"/i.exec(block)?.[1];
  return atom ?? null;
}

/**
 * Strip CDATA, HTML tags and entities down to plain text. Feeds wrap descriptions
 * in CDATA and stuff them with markup; the classifier and the trader both want
 * words, not `<p>` tags.
 */
function clean(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(raw: string): number {
  const t = Date.parse(clean(raw));
  /* A feed with no parseable date is stamped "now" — better than dropping the
   * story, and it will simply sort to the top until a real timestamp arrives. */
  return Number.isNaN(t) ? Date.now() : t;
}

function matchAll(text: string, re: RegExp): string[] {
  return [...text.matchAll(re)].map((m) => m[0]);
}
