import assert from 'node:assert/strict';
import { canonicalizeUrl, dedupeKeyForItem, roughMatchScore } from '../server/lib/utils.js';

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
    url: 'https://example.com/post/',
    sourceName: 'RSS'
  });

  const b = dedupeKeyForItem({
    title: 'OpenAI   launches new model',
    url: 'https://example.com/post#intro',
    sourceName: 'RSS'
  });

  assert.equal(a, b);
});

run('roughMatchScore distinguishes strong and weak matches', () => {
  const high = roughMatchScore('AI 编程 agents coding model released today', 'AI 编程');
  const low = roughMatchScore('足球转会消息', 'AI 编程');

  assert.ok(high > 0.4);
  assert.equal(low, 0);
});

console.log('All tests passed.');
