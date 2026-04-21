import {
  ageInDays,
  canonicalizeUrl,
  clamp,
  normalizeWhitespace,
  parseDateCandidate,
  roughMatchScore
} from './utils.js';

const TRUSTED_HOSTS = [
  'github.com',
  'gitlab.com',
  'arxiv.org',
  'huggingface.co',
  'openai.com',
  'anthropic.com',
  'google.com',
  'deepmind.google',
  'meta.com',
  'microsoft.com',
  'docs.python.org',
  'developer.mozilla.org',
  'nodejs.org',
  'techcrunch.com',
  'theverge.com',
  'reuters.com',
  'bloomberg.com',
  '36kr.com',
  'jiqizhixin.com',
  'infoq.com'
];

const COMMUNITY_HOSTS = [
  'zhihu.com',
  'reddit.com',
  'x.com',
  'twitter.com',
  'weibo.com',
  'bilibili.com',
  'tieba.baidu.com',
  'v2ex.com',
  'juejin.cn',
  'medium.com',
  'substack.com',
  'bilibili.com'
];

const LOW_SIGNAL_HOSTS = [
  'wenku.baidu.com',
  'mbd.baidu.com'
];

const LIST_PATH_PATTERNS = [
  /\/search/i,
  /\/tag(s)?\b/i,
  /\/topic(s)?\b/i,
  /\/people\b/i,
  /\/user(s)?\b/i,
  /\/member(s)?\b/i,
  /\/collection(s)?\b/i,
  /\/channel(s)?\b/i,
  /\/explore\b/i,
  /\/discover\b/i,
  /\/hot\b/i
];

function hostnameForUrl(url = '') {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function pathnameForUrl(url = '') {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return '/';
  }
}

function hostMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function inDomainList(hostname, domains) {
  return domains.some((domain) => hostMatches(hostname, domain));
}

function normalizeTitle(value = '') {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[|｜\-—_:：]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function engagementHintsFromText(text = '') {
  const normalized = normalizeWhitespace(text).toLowerCase();
  const patterns = [
    { key: 'answerCount', regex: /(\d[\d,]*)\s*(?:answers?|回答)/gi },
    { key: 'replyCount', regex: /(\d[\d,]*)\s*(?:replies?|回复)/gi },
    { key: 'commentCount', regex: /(\d[\d,]*)\s*(?:comments?|评论)/gi },
    { key: 'upvoteCount', regex: /(\d[\d,]*)\s*(?:upvotes?|赞同|点赞)/gi },
    { key: 'viewCount', regex: /(\d[\d,]*)\s*(?:views?|浏览)/gi }
  ];

  const metrics = {};
  for (const { key, regex } of patterns) {
    let match;
    while ((match = regex.exec(normalized))) {
      const value = Number(String(match[1]).replaceAll(',', ''));
      if (!Number.isNaN(value)) {
        metrics[key] = Math.max(metrics[key] || 0, value);
      }
    }
  }

  return metrics;
}

function mergeMetrics(items) {
  const merged = {};

  for (const item of items) {
    const hints = engagementHintsFromText(`${item.title || ''} ${item.snippet || ''}`);
    const metrics = {
      ...(item.metrics || {}),
      ...hints
    };

    for (const [key, value] of Object.entries(metrics)) {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        continue;
      }
      merged[key] = Math.max(merged[key] || 0, value);
    }
  }

  return merged;
}

function scoreEngagement(metrics) {
  const replyCount = Number(metrics.replyCount || 0);
  const answerCount = Number(metrics.answerCount || 0);
  const commentCount = Number(metrics.commentCount || 0);
  const upvoteCount = Number(metrics.upvoteCount || 0);
  const likeCount = Number(metrics.likeCount || 0);
  const repostCount = Number(metrics.retweetCount || 0);
  const viewCount = Number(metrics.viewCount || 0);

  const interactionTotal =
    replyCount * 1.4 +
    answerCount * 1.8 +
    commentCount * 1.2 +
    upvoteCount * 0.15 +
    likeCount * 0.1 +
    repostCount * 0.35 +
    viewCount * 0.002;

  if (interactionTotal <= 0) {
    return 0;
  }

  return clamp(Math.round(Math.log10(interactionTotal + 1) * 12), 0, 28);
}

function classifyHost(hostname, sourceType) {
  if (!hostname) {
    return 'unknown';
  }

  if (sourceType === 'rss') {
    return 'feed';
  }

  if (sourceType === 'twitterapi_io' || sourceType === 'weibo_hot') {
    return 'community';
  }

  if (inDomainList(hostname, LOW_SIGNAL_HOSTS)) {
    return 'low';
  }

  if (inDomainList(hostname, TRUSTED_HOSTS)) {
    return 'trusted';
  }

  if (inDomainList(hostname, COMMUNITY_HOSTS)) {
    return 'community';
  }

  return 'standard';
}

function classifyPageType(item, hostname, pathname) {
  if (item.raw?.entityType === 'bilibili_user') {
    return item.metrics?.isOfficial ? 'official_profile' : 'creator_profile';
  }

  if (item.raw?.entityType === 'bilibili_video') {
    return 'detail';
  }

  if (item.sourceType === 'rss') {
    return 'feed_item';
  }

  if (item.sourceType === 'twitterapi_io') {
    return 'social_post';
  }

  if (item.sourceType === 'weibo_hot') {
    return 'trend';
  }

  if (hostname === 'github.com') {
    const segments = pathname.split('/').filter(Boolean);
    if (pathname.startsWith('/search') || pathname.startsWith('/topics')) {
      return 'search';
    }
    if (segments.length === 1) {
      return 'profile';
    }
    if (segments.length >= 2) {
      return 'repo';
    }
  }

  if (hostname.endsWith('zhihu.com')) {
    if (pathname.startsWith('/question/')) {
      return 'ugc_detail';
    }
    if (pathname.startsWith('/topic/')) {
      return 'topic';
    }
    if (pathname.startsWith('/people/')) {
      return 'profile';
    }
  }

  if (LIST_PATH_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return pathname.includes('/search') ? 'search' : 'list';
  }

  if (pathname === '/' || pathname === '') {
    return 'root';
  }

  return 'detail';
}

function hostBonus(hostClass) {
  switch (hostClass) {
    case 'trusted':
      return 18;
    case 'feed':
      return 12;
    case 'standard':
      return 8;
    case 'community':
      return -6;
    case 'low':
      return -14;
    default:
      return 0;
  }
}

function pageTypeBonus(pageType) {
  switch (pageType) {
    case 'detail':
    case 'repo':
    case 'feed_item':
      return 14;
    case 'social_post':
      return 8;
    case 'trend':
      return 16;
    case 'creator_profile':
      return 12;
    case 'official_profile':
      return 18;
    case 'ugc_detail':
      return 4;
    case 'root':
      return -10;
    case 'profile':
      return -20;
    case 'topic':
      return -28;
    case 'search':
      return -26;
    case 'list':
      return -22;
    default:
      return 0;
  }
}

function rankBonus(rank) {
  if (!rank) {
    return 0;
  }

  return clamp(16 - (Number(rank) - 1) * 3, 0, 16);
}

function qualityReason(label, value) {
  return `${label}:${value}`;
}

function freshnessWindowDays(pageType, hostClass) {
  if (pageType === 'official_profile' || pageType === 'creator_profile') {
    return null;
  }

  if (pageType === 'trend') {
    return 3;
  }

  if (pageType === 'social_post') {
    return 10;
  }

  if (pageType === 'ugc_detail') {
    return 14;
  }

  if (pageType === 'feed_item' || pageType === 'detail' || pageType === 'repo') {
    return hostClass === 'trusted' || hostClass === 'feed' ? 45 : 21;
  }

  return 30;
}

function freshnessBonus(ageDays) {
  if (ageDays === null) {
    return 0;
  }

  if (ageDays <= 1) {
    return 16;
  }
  if (ageDays <= 3) {
    return 12;
  }
  if (ageDays <= 7) {
    return 8;
  }
  if (ageDays <= 14) {
    return 4;
  }
  if (ageDays <= 30) {
    return 0;
  }
  if (ageDays <= 60) {
    return -6;
  }

  return -14;
}

function candidateKeepDecision({
  score,
  hostClass,
  pageType,
  engagementScore,
  consensusCount,
  isStale
}) {
  if (score < 45) {
    return false;
  }

  if (isStale) {
    return false;
  }

  if (pageType === 'official_profile') {
    return score >= 58;
  }

  if (pageType === 'creator_profile') {
    return score >= 62;
  }

  if (['topic', 'search', 'list', 'profile', 'root'].includes(pageType)) {
    return consensusCount >= 2 && score >= 70;
  }

  if (hostClass === 'low') {
    return consensusCount >= 2 && score >= 75;
  }

  if (hostClass === 'community') {
    return engagementScore >= 10 || consensusCount >= 2;
  }

  return true;
}

function sortByPrimaryValue(left, right) {
  return right.quality.reliabilityScore - left.quality.reliabilityScore;
}

export function consensusKeyForItem(item) {
  const canonicalUrl = canonicalizeUrl(item.url || '');
  if (canonicalUrl) {
    return canonicalUrl;
  }

  return normalizeTitle(item.title || '');
}

export function assessCandidateQuality({ watcher, source, item, consensusCount, sourceNames }) {
  const hostname = hostnameForUrl(item.url);
  const pathname = pathnameForUrl(item.url);
  const hostClass = classifyHost(hostname, source.type);
  const pageType = classifyPageType(item, hostname, pathname);
  const publishedAtDate =
    parseDateCandidate(item.publishedAt || '') ||
    parseDateCandidate(`${item.title || ''} ${item.snippet || ''}`);
  const ageDays = ageInDays(publishedAtDate);
  const maxAgeDays = freshnessWindowDays(pageType, hostClass);
  const isStale = ageDays !== null && maxAgeDays !== null && ageDays > maxAgeDays;
  const metrics = mergeMetrics([item]);
  const engagementScore = scoreEngagement(metrics);
  const relevanceScore = roughMatchScore(
    `${item.title || ''} ${item.snippet || ''} ${item.author || ''}`,
    `${watcher.query} ${watcher.scope || ''}`.trim()
  );
  const followerBoost = clamp(
    Math.round(Math.log10(Number(item.metrics?.followerCount || 0) + 1) * 5),
    0,
    18
  );
  const accountExactMatch =
    normalizeTitle(item.title || '') === normalizeTitle(watcher.query || '') ? 10 : 0;
  const officialBoost = item.metrics?.isOfficial ? 10 : 0;
  const consensusBonus = consensusCount > 1 ? Math.min((consensusCount - 1) * 16, 32) : 0;
  const score = clamp(
    Math.round(
      18 +
        relevanceScore * 30 +
        hostBonus(hostClass) +
        pageTypeBonus(pageType) +
        rankBonus(item.metrics?.searchRank) +
        engagementScore +
        freshnessBonus(ageDays) +
        followerBoost +
        accountExactMatch +
        officialBoost +
        consensusBonus
    ),
    0,
    100
  );

  const keep = candidateKeepDecision({
    score,
    hostClass,
    pageType,
    engagementScore,
    consensusCount,
    isStale
  });

  return {
    keep,
    reliabilityScore: score,
    relevanceScore: Math.round(relevanceScore * 100),
    hostName: hostname,
    hostClass,
    pageType,
    engagementScore,
    consensusCount,
    publishedAt: publishedAtDate?.toISOString() || null,
    ageDays,
    maxAgeDays,
    isStale,
    sourceNames,
    reasons: [
      qualityReason('host', hostClass),
      qualityReason('page', pageType),
      qualityReason('ageDays', ageDays ?? 'unknown'),
      qualityReason('engagement', engagementScore),
      qualityReason('followers', Number(item.metrics?.followerCount || 0)),
      qualityReason('consensus', consensusCount)
    ]
  };
}

export function buildFindingCandidates({ watcher, settledResults }) {
  const groups = new Map();

  for (const result of settledResults) {
    if (!result.ok) {
      continue;
    }

    for (const item of result.items) {
      const key = consensusKeyForItem(item);
      if (!key) {
        continue;
      }

      const entries = groups.get(key) || [];
      entries.push({
        source: result.source,
        item
      });
      groups.set(key, entries);
    }
  }

  const candidates = [];
  const dropped = [];

  for (const entries of groups.values()) {
    const sourceNames = [...new Set(entries.map((entry) => entry.source.name))];
    const sourceIds = [...new Set(entries.map((entry) => entry.source.id))];
    const consensusCount = sourceIds.length;
    const scoredEntries = entries
      .map((entry) => ({
        ...entry,
        quality: assessCandidateQuality({
          watcher,
          source: entry.source,
          item: entry.item,
          consensusCount,
          sourceNames
        })
      }))
      .sort(sortByPrimaryValue);

    const primary = scoredEntries[0];
    if (!primary?.quality.keep) {
      dropped.push({
        title: primary?.item.title || 'Untitled',
        sourceNames,
        quality: primary?.quality || null
      });
      continue;
    }

    const mergedMetrics = mergeMetrics(scoredEntries.map((entry) => entry.item));
    const publishedAt =
      scoredEntries
        .map((entry) => entry.quality.publishedAt || entry.item.publishedAt)
        .filter(Boolean)
        .sort()
        .at(-1) || null;

    candidates.push({
      sourceId: primary.source.id,
      sourceType: primary.source.type,
      sourceName: primary.source.name,
      title: primary.item.title,
      url: primary.item.url,
      snippet: primary.item.snippet,
      publishedAt,
      author: primary.item.author || '',
      metrics: mergedMetrics,
      raw: primary.item.raw || {},
      quality: primary.quality,
      sourceMatches: scoredEntries.map((entry) => ({
        sourceId: entry.source.id,
        sourceName: entry.source.name,
        sourceType: entry.source.type,
        searchRank: entry.item.metrics?.searchRank || null
      }))
    });
  }

  candidates.sort((left, right) => {
    if (right.quality.reliabilityScore !== left.quality.reliabilityScore) {
      return right.quality.reliabilityScore - left.quality.reliabilityScore;
    }

    return right.quality.consensusCount - left.quality.consensusCount;
  });

  return {
    candidates,
    dropped
  };
}
