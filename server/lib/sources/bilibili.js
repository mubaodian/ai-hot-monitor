import { normalizeWhitespace, sleep } from '../utils.js';

const BILIBILI_SEARCH_URL = 'https://api.bilibili.com/x/web-interface/search/all/v2';
const BILIBILI_TYPED_SEARCH_URL = 'https://api.bilibili.com/x/web-interface/search/type';

function stripTags(value = '') {
  return normalizeWhitespace(String(value).replace(/<[^>]+>/g, ' '));
}

function toNumber(value, fallback = 0) {
  const normalized = String(value ?? '')
    .replace(/,/g, '')
    .replace(/[^\d.万亿kKmM]/g, '')
    .trim();

  if (!normalized) {
    return fallback;
  }

  const lower = normalized.toLowerCase();
  const multiplier = lower.endsWith('亿')
    ? 100000000
    : lower.endsWith('万')
      ? 10000
      : lower.endsWith('k')
        ? 1000
        : lower.endsWith('m')
          ? 1000000
          : 1;
  const numeric = Number(lower.replace(/[万亿km]/g, ''));
  return Number.isFinite(numeric) ? Math.round(numeric * multiplier) : fallback;
}

function toIsoTime(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'number') {
    return new Date(value * 1000).toISOString();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function accountSnippet(item) {
  const parts = [];

  if (item.usign) {
    parts.push(stripTags(item.usign));
  }

  if (item.official_verify?.desc) {
    parts.push(stripTags(item.official_verify.desc));
  }

  const followerCount = toNumber(item.fans);
  const videoCount = toNumber(item.videos);
  if (followerCount > 0) {
    parts.push(`粉丝 ${followerCount}`);
  }
  if (videoCount > 0) {
    parts.push(`视频 ${videoCount}`);
  }

  return normalizeWhitespace(parts.join(' | '));
}

function mapUserItem(item, source, index) {
  const userName = stripTags(item.uname || item.title || '');
  const followerCount = toNumber(item.fans);
  const videoCount = toNumber(item.videos);
  const isOfficial = Number(item.official_verify?.type ?? -1) >= 0;

  return {
    externalId: `${source.id}_user_${item.mid || index}`,
    title: userName,
    url: item.mid ? `https://space.bilibili.com/${item.mid}` : '',
    snippet: accountSnippet(item),
    publishedAt: null,
    sourceType: source.type,
    sourceName: source.name,
    author: userName,
    metrics: {
      followerCount,
      videoCount,
      accountRank: index + 1,
      isOfficial: isOfficial ? 1 : 0
    },
    raw: {
      entityType: 'bilibili_user',
      officialVerify: item.official_verify || null,
      mid: item.mid || null,
      level: item.level || null
    }
  };
}

function mapVideoItem(item, source, index) {
  const title = stripTags(item.title || '');
  const description = stripTags(item.description || item.desc || '');
  const url =
    item.arcurl ||
    (item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : '') ||
    (item.aid ? `https://www.bilibili.com/video/av${item.aid}` : '');

  return {
    externalId: `${source.id}_video_${item.bvid || item.aid || index}`,
    title,
    url,
    snippet: description,
    publishedAt: toIsoTime(item.pubdate || item.pub_time),
    sourceType: source.type,
    sourceName: source.name,
    author: stripTags(item.author || item.upic_name || ''),
    metrics: {
      playCount: toNumber(item.play),
      danmakuCount: toNumber(item.video_review),
      favoriteCount: toNumber(item.favorites),
      likeCount: toNumber(item.like),
      videoRank: index + 1
    },
    raw: {
      entityType: 'bilibili_video',
      bvid: item.bvid || null,
      aid: item.aid || null
    }
  };
}

function moduleItems(module) {
  if (!module) {
    return [];
  }

  if (Array.isArray(module.result)) {
    return module.result;
  }

  if (Array.isArray(module.data)) {
    return module.data;
  }

  return [];
}

export function parseBilibiliSearchPayload(payload, source) {
  const modules = Array.isArray(payload?.data?.result) ? payload.data.result : [];
  const userItems = [];
  const videoItems = [];

  for (const module of modules) {
    const type = module.result_type || module.type || '';
    if (type === 'bili_user') {
      userItems.push(...moduleItems(module).map((item, index) => mapUserItem(item, source, index)));
    }
    if (type === 'video') {
      videoItems.push(...moduleItems(module).map((item, index) => mapVideoItem(item, source, index)));
    }
  }

  return {
    userItems,
    videoItems
  };
}

export function parseBilibiliTypedPayload(payload, source, searchType) {
  const results = Array.isArray(payload?.data?.result) ? payload.data.result : [];

  if (searchType === 'bili_user') {
    return results.map((item, index) => mapUserItem(item, source, index));
  }

  if (searchType === 'video') {
    return results.map((item, index) => mapVideoItem(item, source, index));
  }

  return [];
}

function buildHeaders(query) {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    Referer: `https://search.bilibili.com/all?keyword=${encodeURIComponent(query)}`,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
  };
}

async function requestBilibiliJson(url, query) {
  const response = await fetch(url, {
    headers: buildHeaders(query)
  });

  if (!response.ok) {
    throw new Error(`Bilibili request failed: ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.code !== 0) {
    throw new Error(`Bilibili response error: ${payload?.message || payload?.code || 'unknown'}`);
  }

  return payload;
}

function isAccountLikeQuery(query = '') {
  const normalized = normalizeWhitespace(query);
  if (!normalized) {
    return false;
  }

  return (
    normalized.startsWith('@') ||
    /官方|账号|帳號|up主|up$|official/i.test(normalized) ||
    (!/\s/.test(normalized) && normalized.length <= 24)
  );
}

export async function fetchBilibiliItems({ source, watcher }) {
  const query = watcher.query;
  const config = source.config || {};
  const accountFirst = config.accountFirst !== false && isAccountLikeQuery(query);
  const userLimit = Number(config.userLimit || 3);
  const videoLimit = Number(config.videoLimit || config.limit || 6);

  await sleep(450 + Math.floor(Math.random() * 250));

  let userItems = [];
  let videoItems = [];

  try {
    const payload = await requestBilibiliJson(
      `${BILIBILI_SEARCH_URL}?keyword=${encodeURIComponent(query)}`,
      query
    );
    const parsed = parseBilibiliSearchPayload(payload, source);
    userItems = parsed.userItems;
    videoItems = parsed.videoItems;
  } catch {
    userItems = [];
    videoItems = [];
  }

  if (!userItems.length) {
    try {
      const payload = await requestBilibiliJson(
        `${BILIBILI_TYPED_SEARCH_URL}?search_type=bili_user&keyword=${encodeURIComponent(query)}&page=1`,
        query
      );
      userItems = parseBilibiliTypedPayload(payload, source, 'bili_user');
    } catch {
      userItems = [];
    }
  }

  if (!videoItems.length) {
    try {
      const payload = await requestBilibiliJson(
        `${BILIBILI_TYPED_SEARCH_URL}?search_type=video&keyword=${encodeURIComponent(query)}&page=1&order=totalrank`,
        query
      );
      videoItems = parseBilibiliTypedPayload(payload, source, 'video');
    } catch {
      videoItems = [];
    }
  }

  const selectedUsers = userItems.slice(0, userLimit);
  const selectedVideos = videoItems.slice(0, videoLimit);

  return accountFirst
    ? [...selectedUsers, ...selectedVideos]
    : [...selectedVideos, ...selectedUsers];
}
