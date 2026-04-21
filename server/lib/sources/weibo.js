import * as cheerio from 'cheerio';
import { normalizeWhitespace } from '../utils.js';

export async function fetchWeiboHotItems({ source }) {
  const response = await fetch('https://s.weibo.com/top/summary', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Weibo request failed: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const rows = [];
  $('#pl_top_realtimehot table tbody tr').each((index, element) => {
    const anchor = $(element).find('td.td-02 a').first();
    const title = normalizeWhitespace(anchor.text());
    const href = anchor.attr('href');
    const heatText = normalizeWhitespace($(element).find('td.td-02 span').first().text());
    if (!title || !href) {
      return;
    }
    rows.push({
      externalId: `${source.id}_${index}_${title}`,
      title,
      url: href.startsWith('http') ? href : `https://s.weibo.com${href}`,
      snippet: heatText,
      publishedAt: null,
      sourceType: source.type,
      sourceName: source.name,
      author: '',
      metrics: {
        hotLabel: heatText
      },
      raw: {}
    });
  });

  return rows.slice(0, Number(source.config.limit || 15));
}

