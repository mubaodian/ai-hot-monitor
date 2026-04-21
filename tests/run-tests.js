import assert from 'node:assert/strict';
import { buildFindingCandidates } from '../server/lib/quality.js';
import { parseBilibiliSearchPayload } from '../server/lib/sources/bilibili.js';
import {
  canonicalizeUrl,
  dedupeKeyForItem,
  parseDateCandidate,
  roughMatchScore
} from '../server/lib/utils.js';

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run('canonicalizeUrl removes trailing slash and hash', () => {
  const actual = canonicalizeUrl('https://example.com/path/#section');
  assert.equal(actual, 'https://example.com/path');
});

run('dedupeKeyForItem is stable for equivalent items', () => {
  const a = dedupeKeyForItem({
    title: 'OpenAI launches new model',
    url: 'https://example.com/post/'
  });

  const b = dedupeKeyForItem({
    title: 'OpenAI   launches new model',
    url: 'https://example.com/post#intro'
  });

  assert.equal(a, b);
});

run('roughMatchScore distinguishes strong and weak matches', () => {
  const high = roughMatchScore('AI coding agents coding model released today', 'AI coding');
  const low = roughMatchScore('football transfer updates', 'AI coding');

  assert.ok(high > 0.4);
  assert.equal(low, 0);
});

run('buildFindingCandidates filters low-signal UGC but keeps cross-engine consensus', () => {
  const watcher = {
    query: 'Claude Code',
    scope: ''
  };

  const { candidates, dropped } = buildFindingCandidates({
    watcher,
    settledResults: [
      {
        ok: true,
        source: { id: 'src_bing_web', name: 'Bing Web Search', type: 'bing_web' },
        items: [
          {
            title: 'Claude Code usage notes - Zhihu',
            url: 'https://www.zhihu.com/question/123456',
            snippet: 'A low-signal question thread',
            metrics: { searchRank: 1 },
            sourceType: 'bing_web',
            sourceName: 'Bing Web Search'
          }
        ]
      },
      {
        ok: true,
        source: { id: 'src_sogou_web', name: 'Sogou Search', type: 'sogou_web' },
        items: [
          {
            title: 'Claude Code official docs',
            url: 'https://docs.anthropic.com/en/docs/claude-code',
            snippet: 'Anthropic official documentation',
            metrics: { searchRank: 1 },
            sourceType: 'sogou_web',
            sourceName: 'Sogou Search'
          }
        ]
      },
      {
        ok: true,
        source: { id: 'src_so360_web', name: '360 Search', type: 'so360_web' },
        items: [
          {
            title: 'Claude Code official docs',
            url: 'https://docs.anthropic.com/en/docs/claude-code',
            snippet: 'The second search engine also matched it',
            metrics: { searchRank: 2 },
            sourceType: 'so360_web',
            sourceName: '360 Search'
          }
        ]
      }
    ]
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].quality.consensusCount, 2);
  assert.ok(dropped.some((item) => item.title.includes('Zhihu')));
});

run('parseDateCandidate extracts explicit and relative dates', () => {
  const now = new Date('2026-04-21T12:00:00.000Z');
  const explicit = parseDateCandidate('Published 2026-04-19 update', now);
  const relative = parseDateCandidate('2 days ago', now);

  assert.equal(explicit?.toISOString().slice(0, 10), '2026-04-19');
  assert.equal(relative?.toISOString().slice(0, 10), '2026-04-19');
});

run('buildFindingCandidates drops stale detail items and keeps latest merged timestamp', () => {
  const watcher = {
    query: 'OpenAI launch',
    scope: ''
  };

  const { candidates, dropped } = buildFindingCandidates({
    watcher,
    settledResults: [
      {
        ok: true,
        source: { id: 'src_bing_web', name: 'Bing Web Search', type: 'bing_web' },
        items: [
          {
            title: 'OpenAI launch analysis',
            url: 'https://example.com/launch-analysis',
            snippet: '2025-01-10 old recap',
            publishedAt: '2025-01-10T00:00:00.000Z',
            metrics: { searchRank: 1 },
            sourceType: 'bing_web',
            sourceName: 'Bing Web Search'
          }
        ]
      },
      {
        ok: true,
        source: { id: 'src_sogou_web', name: 'Sogou Search', type: 'sogou_web' },
        items: [
          {
            title: 'OpenAI launch official docs',
            url: 'https://openai.com/index/new-launch',
            snippet: '2026-04-20 release note',
            publishedAt: '2026-04-18T00:00:00.000Z',
            metrics: { searchRank: 1 },
            sourceType: 'sogou_web',
            sourceName: 'Sogou Search'
          }
        ]
      },
      {
        ok: true,
        source: { id: 'src_so360_web', name: '360 Search', type: 'so360_web' },
        items: [
          {
            title: 'OpenAI launch official docs',
            url: 'https://openai.com/index/new-launch',
            snippet: '2026-04-20 another search hit',
            publishedAt: '2026-04-20T00:00:00.000Z',
            metrics: { searchRank: 2 },
            sourceType: 'so360_web',
            sourceName: '360 Search'
          }
        ]
      }
    ]
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].publishedAt, '2026-04-20T00:00:00.000Z');
  assert.ok(dropped.some((item) => item.title.includes('analysis')));
});

run('parseBilibiliSearchPayload extracts user and video items', () => {
  const source = { id: 'src_bilibili_web', name: 'Bilibili Search', type: 'bilibili_web' };
  const payload = {
    data: {
      result: [
        {
          result_type: 'bili_user',
          result: [
            {
              mid: 123,
              uname: '<em class="keyword">OpenAI</em> Official',
              usign: 'Official account',
              fans: 125000,
              videos: 42,
              official_verify: {
                type: 0,
                desc: 'Verified'
              }
            }
          ]
        },
        {
          result_type: 'video',
          result: [
            {
              bvid: 'BV1xx411c7mD',
              title: '<em class="keyword">OpenAI</em> keynote',
              description: 'Model launch recap',
              arcurl: 'https://www.bilibili.com/video/BV1xx411c7mD',
              author: 'OpenAI Official',
              play: 32000,
              video_review: 180,
              pubdate: 1710000000
            }
          ]
        }
      ]
    }
  };

  const parsed = parseBilibiliSearchPayload(payload, source);
  assert.equal(parsed.userItems.length, 1);
  assert.equal(parsed.videoItems.length, 1);
  assert.equal(parsed.userItems[0].title, 'OpenAI Official');
  assert.equal(parsed.userItems[0].metrics.isOfficial, 1);
  assert.equal(parsed.videoItems[0].author, 'OpenAI Official');
});

console.log('All tests passed.');
