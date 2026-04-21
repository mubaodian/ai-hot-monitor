import { normalizeWhitespace } from '../utils.js';

function buildEndpoint(source, watcher) {
  const config = source.config || {};
  if (config.mode === 'trends') {
    const woeid = Number(config.woeid || 1);
    const count = Number(config.count || 30);
    return `https://api.twitterapi.io/twitter/trends?woeid=${woeid}&count=${count}`;
  }

  const template = config.queryTemplate || '{query}';
  const query = template.replaceAll('{query}', watcher.query);
  const queryType = config.queryType || 'Latest';
  return `https://api.twitterapi.io/twitter/tweet/advanced_search?query=${encodeURIComponent(query)}&queryType=${encodeURIComponent(queryType)}`;
}

export async function fetchTwitterItems({ source, watcher, settings }) {
  if (!settings.twitterApiKey) {
    throw new Error('twitterapi.io key is missing');
  }

  const response = await fetch(buildEndpoint(source, watcher), {
    headers: {
      'x-api-key': settings.twitterApiKey
    }
  });

  if (!response.ok) {
    throw new Error(`twitterapi.io request failed: ${response.status}`);
  }

  const data = await response.json();
  if (source.config.mode === 'trends') {
    return (data.trends || []).map((item, index) => ({
      externalId: `${source.id}_${index}_${item.name}`,
      title: normalizeWhitespace(item.name),
      url: `https://x.com/search?q=${encodeURIComponent(item.target?.query || item.name)}&src=trend_click`,
      snippet: normalizeWhitespace(item.meta_description || ''),
      publishedAt: null,
      sourceType: source.type,
      sourceName: source.name,
      author: '',
      metrics: {
        rank: item.rank
      },
      raw: item
    }));
  }

  return (data.tweets || []).map((item) => ({
    externalId: item.id,
    title: normalizeWhitespace(item.text || '').slice(0, 120),
    url: item.url,
    snippet: normalizeWhitespace(item.text || ''),
    publishedAt: item.createdAt || null,
    sourceType: source.type,
    sourceName: source.name,
    author: item.author?.userName || item.author?.name || '',
    metrics: {
      likeCount: item.likeCount || 0,
      retweetCount: item.retweetCount || 0,
      replyCount: item.replyCount || 0,
      viewCount: item.viewCount || 0
    },
    raw: item
  }));
}

