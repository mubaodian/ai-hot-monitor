import * as cheerio from 'cheerio';
import { ensureArray, normalizeWhitespace } from '../utils.js';

export async function fetchWebpageItems({ source }) {
  const urls = ensureArray(source.config.urls);
  const items = [];

  for (const url of urls) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'AI-Hot-Monitor/0.1'
      }
    });

    if (!response.ok) {
      continue;
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const title = normalizeWhitespace(
      $('meta[property="og:title"]').attr('content') || $('title').text()
    );
    const description = normalizeWhitespace(
      $('meta[name="description"]').attr('content') ||
        $('meta[property="og:description"]').attr('content') ||
        ''
    );

    items.push({
      externalId: `${source.id}_${url}`,
      title: title || url,
      url,
      snippet: description,
      publishedAt: null,
      sourceType: source.type,
      sourceName: source.name,
      author: '',
      metrics: {},
      raw: {}
    });
  }

  return items;
}

