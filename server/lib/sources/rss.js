import { XMLParser } from 'fast-xml-parser';
import { normalizeWhitespace } from '../utils.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
});

function toArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export async function fetchRssItems({ source }) {
  const feedUrl = source.config.feedUrl;
  const response = await fetch(feedUrl, {
    headers: {
      'User-Agent': 'AI-Hot-Monitor/0.1'
    }
  });

  if (!response.ok) {
    throw new Error(`RSS request failed: ${response.status}`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml);
  const rssItems = toArray(parsed?.rss?.channel?.item);
  const atomItems = toArray(parsed?.feed?.entry);
  const items = rssItems.length ? rssItems : atomItems;
  const limit = Number(source.config.limit || 10);

  return items.slice(0, limit).map((item, index) => ({
    externalId: item.guid?.['#text'] || item.guid || item.id || `${source.id}_${index}`,
    title: normalizeWhitespace(item.title?.['#text'] || item.title || 'Untitled'),
    url: item.link?.['@_href'] || item.link || '',
    snippet: normalizeWhitespace(
      item.description ||
        item.summary ||
        item.content ||
        item['content:encoded'] ||
        ''
    ),
    publishedAt: item.pubDate || item.updated || item.published || null,
    sourceType: source.type,
    sourceName: source.name,
    author: normalizeWhitespace(item.author?.name || item.author || ''),
    metrics: {},
    raw: item
  }));
}

