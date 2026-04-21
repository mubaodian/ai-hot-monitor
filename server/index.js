import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessFinding } from './lib/ai.js';
import { loadEnvFile } from './lib/env.js';
import { createEventHub } from './lib/events.js';
import { readJsonBody, sendJson, serveStatic } from './lib/http.js';
import { createLogger } from './lib/logger.js';
import { sendFindingEmail, verifyEmailSettings } from './lib/notify.js';
import { buildFindingCandidates } from './lib/quality.js';
import { createScheduler } from './lib/scheduler.js';
import { fetchSourceItems } from './lib/sources/index.js';
import { createStore } from './lib/store.js';
import { createId, dedupeKeyForItem, normalizeWhitespace, roughMatchScore } from './lib/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const port = Number(process.env.PORT || 3000);
const logger = createLogger('server');

loadEnvFile();

const store = await createStore();
const events = createEventHub();

const QUERY_AWARE_SOURCE_TYPES = new Set([
  'bing_web',
  'baidu_web',
  'sogou_web',
  'so360_web',
  'bilibili_web',
  'twitterapi_io'
]);

async function logActivity(level, type, message, meta = {}) {
  logger[level](message, meta);
  await store.recordActivity(type, message, meta, level);
}

function selectedSources(state, watcher) {
  const enabledSources = state.sources.filter((source) => source.enabled);
  if (!watcher.sourceIds || !watcher.sourceIds.length) {
    const queryAwareSources = enabledSources.filter((source) => sourceSupportsWatcherQuery(source));
    return queryAwareSources.length ? queryAwareSources : enabledSources;
  }
  return enabledSources.filter((source) => watcher.sourceIds.includes(source.id));
}

function sourceSupportsWatcherQuery(source) {
  if (QUERY_AWARE_SOURCE_TYPES.has(source.type)) {
    return true;
  }

  if (source.type === 'rss') {
    return Boolean(source.config?.queryTemplate || String(source.config?.feedUrl || '').includes('{query}'));
  }

  if (source.type === 'webpage') {
    return Boolean(source.config?.queryTemplate);
  }

  return false;
}

function prefilterItems(watcher, source, items) {
  if (QUERY_AWARE_SOURCE_TYPES.has(source.type)) {
    return items;
  }

  return items.filter((item) => {
    const combined = `${item.title} ${item.snippet} ${item.author || ''}`;
    return roughMatchScore(combined, watcher.query) >= 0.18;
  });
}

async function notifyFinding(state, watcher, finding) {
  const channels = watcher.notificationChannels || [];
  await logActivity('debug', 'notify', `Preparing notifications for ${finding.title}`, {
    watcherId: watcher.id,
    findingId: finding.id,
    channels
  });

  if (channels.includes('browser')) {
    const notification = {
      id: createId('notification'),
      findingId: finding.id,
      channel: 'browser',
      status: 'sent',
      sentAt: new Date().toISOString(),
      errorMessage: ''
    };
    await store.addNotification(notification);
    await logActivity('info', 'notify', `Browser notification sent for ${finding.title}`, {
      watcherId: watcher.id,
      findingId: finding.id
    });
    events.broadcast('finding', { watcher, finding });
  }

  if (channels.includes('email')) {
    try {
      await sendFindingEmail(state.settings, watcher, finding);
      await store.addNotification({
        id: createId('notification'),
        findingId: finding.id,
        channel: 'email',
        status: 'sent',
        sentAt: new Date().toISOString(),
        errorMessage: ''
      });
      await logActivity('info', 'notify', `Email notification sent for ${finding.title}`, {
        watcherId: watcher.id,
        findingId: finding.id,
        to: state.settings.emailTo
      });
    } catch (error) {
      await store.addNotification({
        id: createId('notification'),
        findingId: finding.id,
        channel: 'email',
        status: 'failed',
        sentAt: new Date().toISOString(),
        errorMessage: error.message
      });
      await logActivity('error', 'notify-error', `Email send failed: ${error.message}`, {
        watcherId: watcher.id,
        findingId: finding.id
      });
    }
  }
}

async function runWatcher(watcherId, trigger = 'manual') {
  const state = store.getState();
  const watcher = state.watchers.find((item) => item.id === watcherId);
  if (!watcher || !watcher.enabled) {
    logger.warn('Watcher skipped', { watcherId, trigger, reason: 'missing_or_disabled' });
    return { watcherId, status: 'skipped' };
  }

  const sources = selectedSources(state, watcher);
  const startedAt = Date.now();
  await logActivity('info', 'sweep', `Sweep started for ${watcher.name}`, {
    watcherId: watcher.id,
    trigger,
    sourceCount: sources.length,
    query: watcher.query
  });

  if (!sources.length) {
    await logActivity('warn', 'source', 'No enabled sources available for watcher', {
      watcherId: watcher.id,
      trigger,
      query: watcher.query
    });
    await store.touchWatcherRun(watcher.id);
    events.broadcast('state', store.getPublicState());
    return {
      watcherId,
      createdFindings: 0,
      status: 'no_sources'
    };
  }

  const settled = await Promise.all(
    sources.map(async (source) => {
      const sourceStartedAt = Date.now();
      try {
        const items = await fetchSourceItems({ source, watcher, settings: state.settings });
        const filteredItems = prefilterItems(watcher, source, items);
        await logActivity('debug', 'source-fetch', `Source fetched: ${source.name}`, {
          watcherId: watcher.id,
          sourceId: source.id,
          rawCount: items.length,
          matchedCount: filteredItems.length,
          durationMs: Date.now() - sourceStartedAt
        });
        return {
          ok: true,
          source,
          items: filteredItems
        };
      } catch (error) {
        await logActivity('error', 'source-error', `${resultSafeName(source)} failed: ${error.message || 'Source fetch failed'}`, {
          watcherId: watcher.id,
          sourceId: source.id,
          durationMs: Date.now() - sourceStartedAt
        });
        return {
          ok: false,
          source,
          error
        };
      }
    })
  );

  const existingKeys = new Set(state.findings.map((finding) => finding.dedupeKey));
  const createdFindings = [];
  const { candidates, dropped } = buildFindingCandidates({
    watcher,
    settledResults: settled
  });

  if (dropped.length) {
    await logActivity('debug', 'quality-filter', `Low-quality candidates filtered for ${watcher.name}`, {
      watcherId: watcher.id,
      filteredCount: dropped.length,
      samples: dropped.slice(0, 5).map((item) => ({
        title: item.title,
        reliabilityScore: item.quality?.reliabilityScore || 0,
        sourceNames: item.sourceNames
      }))
    });
  }

  for (const candidate of candidates.slice(0, 12)) {
    const dedupeKey = dedupeKeyForItem(candidate);
    if (existingKeys.has(dedupeKey)) {
      continue;
    }

    existingKeys.add(dedupeKey);
    const aiDecision = await assessFinding({
      settings: state.settings,
      watcher,
      item: candidate,
      quality: candidate.quality
    });
    logger.debug('AI decision created', {
      watcherId: watcher.id,
      sourceId: candidate.sourceId,
      title: candidate.title,
      relevant: aiDecision.relevant,
      shouldNotify: aiDecision.shouldNotify,
      heatScore: aiDecision.heatScore,
      credibility: aiDecision.credibility,
      reliabilityScore: candidate.quality.reliabilityScore,
      consensusCount: candidate.quality.consensusCount
    });

    const finding = {
      id: createId('finding'),
      watcherId: watcher.id,
      sourceId: candidate.sourceId,
      sourceIds: candidate.sourceMatches.map((item) => item.sourceId),
      title: normalizeWhitespace(candidate.title || 'Untitled'),
      url: candidate.url,
      snippet: normalizeWhitespace(candidate.snippet || ''),
      publishedAt: candidate.publishedAt,
      detectedAt: new Date().toISOString(),
      sourceType: candidate.sourceType,
      sourceName: candidate.sourceName,
      sourceMatches: candidate.sourceMatches,
      author: candidate.author || '',
      metrics: candidate.metrics || {},
      quality: candidate.quality,
      aiDecision,
      dedupeKey
    };

    await store.addFinding(finding);
    createdFindings.push(finding);
    await logActivity('debug', 'finding', `Finding stored: ${finding.title}`, {
      watcherId: watcher.id,
      sourceId: candidate.sourceId,
      findingId: finding.id,
      relevant: aiDecision.relevant,
      shouldNotify: aiDecision.shouldNotify,
      heatScore: aiDecision.heatScore,
      reliabilityScore: candidate.quality.reliabilityScore,
      consensusCount: candidate.quality.consensusCount
    });

    if (
      aiDecision.relevant &&
      !aiDecision.suspectedImpersonation &&
      (aiDecision.shouldNotify || aiDecision.isOfficial || aiDecision.heatScore >= 70)
    ) {
      await notifyFinding(state, watcher, finding);
    }
  }

  await store.touchWatcherRun(watcher.id);
  await logActivity('info', 'sweep', `Sweep finished for ${watcher.name}`, {
    watcherId: watcher.id,
    createdFindings: createdFindings.length,
    durationMs: Date.now() - startedAt
  });
  events.broadcast('state', store.getPublicState());

  return {
    watcherId,
    createdFindings: createdFindings.length
  };
}

function resultSafeName(source) {
  return source?.name || source?.id || 'Unknown source';
}

async function runAllWatchers() {
  const state = store.getState();
  const results = [];
  for (const watcher of state.watchers.filter((item) => item.enabled)) {
    results.push(await runWatcher(watcher.id, 'manual'));
  }
  return results;
}

const scheduler = createScheduler({ store, runWatcher });
scheduler.start();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const requestStartedAt = Date.now();

  try {
    logger.debug('Incoming request', {
      method: req.method,
      path: url.pathname
    });

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, now: new Date().toISOString() });
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      return sendJson(res, 200, store.getPublicState());
    }

    if (req.method === 'GET' && url.pathname === '/api/events') {
      events.addClient(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/run-now') {
      const results = await runAllWatchers();
      logger.info('Run-now completed', {
        resultCount: results.length,
        durationMs: Date.now() - requestStartedAt
      });
      return sendJson(res, 200, { ok: true, results });
    }

    if (req.method === 'POST' && url.pathname === '/api/settings') {
      const body = await readJsonBody(req);
      const updated = await store.updateSettings(body);
      await logActivity('info', 'settings', 'Settings updated from UI', {
        keys: Object.keys(body)
      });
      events.broadcast('state', updated);
      return sendJson(res, 200, { ok: true, state: updated });
    }

    if (req.method === 'POST' && url.pathname === '/api/test-email') {
      const state = store.getState();
      await verifyEmailSettings(state.settings);
      await logActivity('info', 'notify', 'SMTP verify passed', {
        emailTo: state.settings.emailTo
      });
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/watchers') {
      const body = await readJsonBody(req);
      const watcher = await store.createWatcher(body);
      await logActivity('info', 'watcher', `Watcher created from UI: ${watcher.name}`, {
        watcherId: watcher.id,
        query: watcher.query
      });
      events.broadcast('state', store.getPublicState());
      return sendJson(res, 200, { ok: true, watcher });
    }

    if (req.method === 'POST' && url.pathname === '/api/sources') {
      const body = await readJsonBody(req);
      const source = await store.createSource(body);
      await logActivity('info', 'source', `Source created from UI: ${source.name}`, {
        sourceId: source.id,
        sourceType: source.type
      });
      events.broadcast('state', store.getPublicState());
      return sendJson(res, 200, { ok: true, source });
    }

    const watcherMatch = url.pathname.match(/^\/api\/watchers\/([^/]+)$/);
    if (watcherMatch) {
      const watcherId = watcherMatch[1];
      if (req.method === 'PATCH') {
        const body = await readJsonBody(req);
        const watcher = await store.updateWatcher(watcherId, body);
        await logActivity('info', 'watcher', `Watcher updated from UI: ${watcher.name}`, {
          watcherId: watcher.id,
          keys: Object.keys(body)
        });
        events.broadcast('state', store.getPublicState());
        return sendJson(res, 200, { ok: true, watcher });
      }
      if (req.method === 'DELETE') {
        await store.removeWatcher(watcherId);
        await logActivity('warn', 'watcher', 'Watcher removed from UI', { watcherId });
        events.broadcast('state', store.getPublicState());
        return sendJson(res, 200, { ok: true });
      }
    }

    const watcherRunMatch = url.pathname.match(/^\/api\/watchers\/([^/]+)\/run$/);
    if (watcherRunMatch && req.method === 'POST') {
      const watcherId = watcherRunMatch[1];
      const result = await runWatcher(watcherId, 'manual');
      logger.info('Single watcher run completed', {
        watcherId,
        durationMs: Date.now() - requestStartedAt,
        result
      });
      return sendJson(res, 200, { ok: true, result });
    }

    const sourceMatch = url.pathname.match(/^\/api\/sources\/([^/]+)$/);
    if (sourceMatch) {
      const sourceId = sourceMatch[1];
      if (req.method === 'PATCH') {
        const body = await readJsonBody(req);
        const source = await store.updateSource(sourceId, body);
        await logActivity('info', 'source', `Source updated from UI: ${source.name}`, {
          sourceId: source.id,
          keys: Object.keys(body)
        });
        events.broadcast('state', store.getPublicState());
        return sendJson(res, 200, { ok: true, source });
      }
      if (req.method === 'DELETE') {
        await store.removeSource(sourceId);
        await logActivity('warn', 'source', 'Source removed from UI', { sourceId });
        events.broadcast('state', store.getPublicState());
        return sendJson(res, 200, { ok: true });
      }
    }

    const served = await serveStatic(req, res, publicDir);
    if (served) {
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    logger.error('Request failed', {
      method: req.method,
      path: url.pathname,
      error: error.message || 'Unknown server error'
    });
    await store.recordActivity(
      'error',
      error.message || 'Unknown server error',
      {
        method: req.method,
        path: url.pathname
      },
      'error'
    );
    sendJson(res, 500, { error: error.message || 'Internal server error' });
  }
});

server.listen(port, () => {
  logger.info(`AI Hot Monitor listening on http://127.0.0.1:${port}`);
});
