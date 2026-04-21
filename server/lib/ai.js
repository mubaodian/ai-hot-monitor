import OpenAI from 'openai';
import { clamp, normalizeWhitespace, roughMatchScore } from './utils.js';

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    relevant: { type: 'boolean' },
    relevanceScore: { type: 'number' },
    suspectedImpersonation: { type: 'boolean' },
    credibility: { type: 'string', enum: ['low', 'medium', 'high'] },
    isOfficial: { type: 'boolean' },
    heatScore: { type: 'number' },
    shouldNotify: { type: 'boolean' },
    summary: { type: 'string' },
    reason: { type: 'string' },
    tags: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: [
    'relevant',
    'relevanceScore',
    'suspectedImpersonation',
    'credibility',
    'isOfficial',
    'heatScore',
    'shouldNotify',
    'summary',
    'reason',
    'tags'
  ]
};

function heuristicDecision(watcher, item) {
  const combined = [
    item.title,
    item.snippet,
    item.author,
    JSON.stringify(item.metrics || {})
  ].join(' ');
  const score = roughMatchScore(combined, `${watcher.query} ${watcher.scope || ''}`);
  const heat = clamp(Math.round(score * 70 + (item.metrics?.likeCount || 0) / 1000), 0, 100);

  return {
    relevant: score >= 0.34,
    relevanceScore: Math.round(score * 100),
    suspectedImpersonation: false,
    credibility: item.sourceType === 'twitterapi_io' ? 'medium' : 'medium',
    isOfficial: /openai|anthropic|google|meta|x\.com|twitter\.com|github/i.test(item.url || ''),
    heatScore: heat,
    shouldNotify: score >= 0.45,
    summary: normalizeWhitespace(item.snippet || item.title || '').slice(0, 180),
    reason: 'AI 未配置，使用启发式规则作为临时判定。',
    tags: ['heuristic']
  };
}

function extractJson(text = '') {
  const trimmed = text.trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1) {
    throw new Error('No JSON object in model response');
  }
  return JSON.parse(trimmed.slice(first, last + 1));
}

export async function assessFinding({ settings, watcher, item }) {
  if (!settings.openRouterApiKey || !settings.openRouterModel) {
    return heuristicDecision(watcher, item);
  }

  const client = new OpenAI({
    apiKey: settings.openRouterApiKey,
    baseURL: 'https://openrouter.ai/api/v1'
  });

  const completion = await client.chat.completions.create({
    model: settings.openRouterModel,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content: [
          'You are an AI hot topic verifier.',
          'Decide whether the item is truly relevant to the watcher topic, whether it looks fake or impersonated, and whether it is hot enough to notify.',
          'Return strict JSON only.'
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify({
          watcher: {
            name: watcher.name,
            query: watcher.query,
            scope: watcher.scope
          },
          item: {
            title: item.title,
            url: item.url,
            snippet: item.snippet,
            publishedAt: item.publishedAt,
            sourceType: item.sourceType,
            sourceName: item.sourceName,
            author: item.author,
            metrics: item.metrics
          },
          scoringRule: {
            notifyOnlyWhen: 'relevant and not suspicious and meaningfully hot or official'
          }
        })
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'hot_monitor_verdict',
        strict: true,
        schema: RESPONSE_SCHEMA
      }
    }
  });

  const content = completion.choices[0]?.message?.content ?? '{}';
  const parsed = typeof content === 'string' ? extractJson(content) : extractJson(JSON.stringify(content));

  return {
    relevant: Boolean(parsed.relevant),
    relevanceScore: clamp(Number(parsed.relevanceScore || 0), 0, 100),
    suspectedImpersonation: Boolean(parsed.suspectedImpersonation),
    credibility: ['low', 'medium', 'high'].includes(parsed.credibility) ? parsed.credibility : 'medium',
    isOfficial: Boolean(parsed.isOfficial),
    heatScore: clamp(Number(parsed.heatScore || 0), 0, 100),
    shouldNotify: Boolean(parsed.shouldNotify),
    summary: normalizeWhitespace(parsed.summary || ''),
    reason: normalizeWhitespace(parsed.reason || ''),
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 8) : []
  };
}

