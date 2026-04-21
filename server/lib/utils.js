import crypto from 'node:crypto';

export function createId(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function ensureArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return [value];
}

export function normalizeWhitespace(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

export function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(number, min, max) {
  return Math.max(min, Math.min(max, number));
}

export function jitter(ms, ratio = 0.15) {
  const delta = ms * ratio;
  return Math.round(ms + (Math.random() * delta * 2 - delta));
}

export function canonicalizeUrl(value = '') {
  try {
    const url = new URL(value);
    url.hash = '';
    if (url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return value.trim();
  }
}

export function dedupeKeyForItem(item) {
  const base = [
    canonicalizeUrl(item.url || ''),
    normalizeWhitespace(item.title || '').toLowerCase(),
    item.sourceName || ''
  ].join('|');
  return crypto.createHash('sha1').update(base).digest('hex');
}

export function roughMatchScore(haystack, needle) {
  const text = normalizeWhitespace(haystack).toLowerCase();
  const query = normalizeWhitespace(needle).toLowerCase();
  if (!text || !query) {
    return 0;
  }

  if (text.includes(query)) {
    return 1;
  }

  const terms = query
    .split(/[\s,，;；|/]+/)
    .map((term) => term.trim())
    .filter(Boolean);

  if (!terms.length) {
    return 0;
  }

  let hitCount = 0;
  for (const term of terms) {
    if (text.includes(term)) {
      hitCount += 1;
    }
  }

  return hitCount / terms.length;
}

export function pickMaskedSecrets(settings) {
  const secretFields = [
    'openRouterApiKey',
    'smtpPass',
    'twitterApiKey'
  ];
  const clone = { ...settings };

  for (const key of secretFields) {
    if (clone[key]) {
      clone[key] = `${String(clone[key]).slice(0, 4)}***`;
    }
  }

  return clone;
}

export function limitItems(items, max = 50) {
  return items.slice(0, max);
}

