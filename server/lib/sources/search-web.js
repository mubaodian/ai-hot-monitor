import * as cheerio from 'cheerio';
import { normalizeWhitespace, parseDateCandidate, sleep } from '../utils.js';

const SEARCH_ENGINES = {
  bing_web: {
    buildUrl(query) {
      return `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    },
    extract($, source) {
      return collectSearchItems($, source, {
        itemSelector: 'li.b_algo',
        titleSelector: 'h2 a',
        snippetSelector: '.b_caption p, .b_snippet',
        fallbackSnippetSelector: 'p'
      });
    }
  },
  baidu_web: {
    buildUrl(query) {
      return `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;
    },
    extract($, source) {
      return collectSearchItems($, source, {
        itemSelector: '.result, .result-op, .c-container',
        titleSelector: 'h3 a',
        snippetSelector: '.c-span-last, .content-right_8Zs40, .c-abstract, .c-color-text',
        fallbackSnippetSelector: 'div, p'
      });
    }
  },
  sogou_web: {
    buildUrl(query) {
      return `https://www.sogou.com/web?query=${encodeURIComponent(query)}`;
    },
    extract($, source) {
      return collectSearchItems($, source, {
        itemSelector: '.results > .vrwrap, .results > .rb, .vrwrap, .rb',
        titleSelector: 'h3 a, .vr-title a',
        snippetSelector: '.str_info, .text-layout, .ft, .attribute, p',
        fallbackSnippetSelector: 'div, p'
      });
    }
  },
  so360_web: {
    buildUrl(query) {
      return `https://www.so.com/s?q=${encodeURIComponent(query)}`;
    },
    extract($, source) {
      return collectSearchItems($, source, {
        itemSelector: 'li.res-list, .res-list, .result, .g-card',
        titleSelector: 'h3 a, .res-title a, a[data-md]',
        snippetSelector: '.res-desc, .summary, .content, p',
        fallbackSnippetSelector: 'div, p'
      });
    }
  }
};

function buildQuery(source, watcher) {
  const template = source.config.queryTemplate || '{query}';
  return template.replaceAll('{query}', watcher.query);
}

function collectSearchItems($, source, selectors) {
  const items = [];

  $(selectors.itemSelector).each((index, element) => {
    const anchor = $(element).find(selectors.titleSelector).first();
    const title = normalizeWhitespace(anchor.text());
    const url = normalizeWhitespace(anchor.attr('href') || '');
    const snippet = normalizeWhitespace(
      $(element).find(selectors.snippetSelector).first().text() ||
        $(element).find(selectors.fallbackSnippetSelector).first().text()
    );

    if (!title || !url || url.startsWith('javascript:')) {
      return;
    }

    items.push({
      externalId: `${source.id}_${index}_${url}`,
      title,
      url,
      snippet,
      publishedAt: parseDateCandidate(`${title} ${snippet}`)?.toISOString() || null,
      sourceType: source.type,
      sourceName: source.name,
      author: '',
      metrics: {
        searchRank: index + 1
      },
      raw: {
        engine: source.type
      }
    });
  });

  return items;
}

export async function fetchSearchItems({ source, watcher }) {
  const engine = SEARCH_ENGINES[source.type];
  if (!engine) {
    throw new Error(`Unsupported search source type: ${source.type}`);
  }

  const query = buildQuery(source, watcher);
  const url = engine.buildUrl(query);

  await sleep(400 + Math.floor(Math.random() * 300));

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Search request failed: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const items = engine.extract($, source);
  const limit = Number(source.config.limit || 8);
  return items.slice(0, limit);
}
