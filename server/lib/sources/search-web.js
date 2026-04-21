import * as cheerio from 'cheerio';
import { normalizeWhitespace, sleep } from '../utils.js';

function buildQuery(source, watcher) {
  const template = source.config.queryTemplate || '{query}';
  return template.replaceAll('{query}', watcher.query);
}

function buildUrl(type, query) {
  if (type === 'bing_web') {
    return `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  }
  if (type === 'baidu_web') {
    return `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;
  }
  throw new Error(`Unsupported search source type: ${type}`);
}

function extractBing($, source) {
  const items = [];
  $('li.b_algo').each((index, element) => {
    const anchor = $(element).find('h2 a').first();
    const title = normalizeWhitespace(anchor.text());
    const url = anchor.attr('href') || '';
    const snippet = normalizeWhitespace($(element).find('.b_caption p').first().text());
    if (!title || !url) {
      return;
    }
    items.push({
      externalId: `${source.id}_${index}_${url}`,
      title,
      url,
      snippet,
      publishedAt: null,
      sourceType: source.type,
      sourceName: source.name,
      author: '',
      metrics: {},
      raw: {}
    });
  });
  return items;
}

function extractBaidu($, source) {
  const items = [];
  $('.result, .result-op, .c-container').each((index, element) => {
    const anchor = $(element).find('h3 a').first();
    const title = normalizeWhitespace(anchor.text());
    const url = anchor.attr('href') || '';
    const snippet = normalizeWhitespace(
      $(element)
        .find('.c-span-last, .content-right_8Zs40, .c-abstract, .c-color-text')
        .first()
        .text()
    );
    if (!title || !url) {
      return;
    }
    items.push({
      externalId: `${source.id}_${index}_${url}`,
      title,
      url,
      snippet,
      publishedAt: null,
      sourceType: source.type,
      sourceName: source.name,
      author: '',
      metrics: {},
      raw: {}
    });
  });
  return items;
}

export async function fetchSearchItems({ source, watcher }) {
  const query = buildQuery(source, watcher);
  const url = buildUrl(source.type, query);

  await sleep(400 + Math.floor(Math.random() * 300));

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Search request failed: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const items = source.type === 'bing_web' ? extractBing($, source) : extractBaidu($, source);
  const limit = Number(source.config.limit || 8);
  return items.slice(0, limit);
}

