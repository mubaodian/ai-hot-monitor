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
    normalizeWhitespace(item.title || '').toLowerCase()
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

function validDateOrNull(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function ageInDays(value, now = new Date()) {
  const date = value instanceof Date ? value : validDateOrNull(value);
  if (!date) {
    return null;
  }

  return Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
}

export function parseDateCandidate(text = '', now = new Date()) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return null;
  }

  const direct = validDateOrNull(normalized);
  if (direct) {
    return direct;
  }

  const explicitPatterns = [
    /(?<year>20\d{2}|19\d{2})[-/.](?<month>\d{1,2})[-/.](?<day>\d{1,2})/,
    /(?<year>20\d{2}|19\d{2})\s*[\u5e74](?<month>\d{1,2})\s*[\u6708](?<day>\d{1,2})\s*[\u65e5\u53f7]?/
  ];

  for (const pattern of explicitPatterns) {
    const match = normalized.match(pattern);
    if (!match?.groups) {
      continue;
    }

    const date = new Date(
      Number(match.groups.year),
      Number(match.groups.month) - 1,
      Number(match.groups.day),
      12
    );
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  const monthDayMatch = normalized.match(
    /(?<month>\d{1,2})[-/.](?<day>\d{1,2})|(?<cnMonth>\d{1,2})\s*[\u6708](?<cnDay>\d{1,2})\s*[\u65e5\u53f7]?/
  );
  if (monthDayMatch) {
    const month = Number(monthDayMatch.groups?.month || monthDayMatch.groups?.cnMonth);
    const day = Number(monthDayMatch.groups?.day || monthDayMatch.groups?.cnDay);
    if (month && day) {
      let date = new Date(now.getFullYear(), month - 1, day, 12);
      if (date.getTime() > now.getTime() + 2 * 24 * 60 * 60 * 1000) {
        date = new Date(now.getFullYear() - 1, month - 1, day, 12);
      }
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
  }

  if (/(^|\s)(today|\u4eca\u5929)(\s|$)/i.test(normalized)) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  }

  if (/(^|\s)(yesterday|\u6628\u5929)(\s|$)/i.test(normalized)) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
  }

  const relativePatterns = [
    { regex: /(\d+)\s*(minutes?|mins?)\s+ago/i, unitMs: 60 * 1000 },
    { regex: /(\d+)\s*(hours?|hrs?)\s+ago/i, unitMs: 60 * 60 * 1000 },
    { regex: /(\d+)\s*(days?)\s+ago/i, unitMs: 24 * 60 * 60 * 1000 },
    { regex: /(\d+)\s*[\u5206\u949f]\s*[\u524d]/, unitMs: 60 * 1000 },
    { regex: /(\d+)\s*[\u5c0f\u65f6]\s*[\u524d]/, unitMs: 60 * 60 * 1000 },
    { regex: /(\d+)\s*[\u5929]\s*[\u524d]/, unitMs: 24 * 60 * 60 * 1000 }
  ];

  for (const { regex, unitMs } of relativePatterns) {
    const match = normalized.match(regex);
    if (!match) {
      continue;
    }

    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) {
      continue;
    }

    const date = new Date(now.getTime() - amount * unitMs);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}
