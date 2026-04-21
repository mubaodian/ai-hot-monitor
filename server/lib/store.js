import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyEnvOverrides, envManagedFields } from './env.js';
import {
  createId,
  ensureArray,
  limitItems,
  nowIso,
  pickMaskedSecrets
} from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_FILE = path.resolve(__dirname, '../../data/store.json');

function createDefaultSources() {
  const now = nowIso();
  return [
    {
      id: 'src_rss_hn_ai',
      name: 'HN RSS: AI',
      type: 'rss',
      enabled: true,
      config: {
        feedUrl: 'https://hnrss.org/newest?q=AI',
        limit: 12
      },
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'src_bing_web',
      name: 'Bing Web Search',
      type: 'bing_web',
      enabled: true,
      config: {
        queryTemplate: '{query}',
        limit: 8
      },
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'src_baidu_web',
      name: 'Baidu Search',
      type: 'baidu_web',
      enabled: true,
      config: {
        queryTemplate: '{query}',
        limit: 8
      },
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'src_weibo_hot',
      name: 'Weibo Hot',
      type: 'weibo_hot',
      enabled: true,
      config: {
        limit: 15
      },
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'src_twitterapi_search',
      name: 'Twitter API Search',
      type: 'twitterapi_io',
      enabled: false,
      config: {
        mode: 'search',
        queryTemplate: '{query}',
        queryType: 'Latest'
      },
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'src_webpage_openai_news',
      name: 'OpenAI News Page',
      type: 'webpage',
      enabled: false,
      config: {
        urls: ['https://openai.com/news/']
      },
      createdAt: now,
      updatedAt: now
    }
  ];
}

function createDefaultState() {
  const now = nowIso();
  return {
    settings: {
      openRouterApiKey: '',
      openRouterModel: 'openai/gpt-4.1-mini',
      smtpHost: '',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: '',
      smtpPass: '',
      emailFrom: '',
      emailTo: '',
      twitterApiKey: '',
      pollIntervalMs: 60000,
      browserNotificationsEnabled: true
    },
    watchers: [],
    sources: createDefaultSources(),
    findings: [],
    notifications: [],
    activity: [
      {
        id: createId('activity'),
        level: 'info',
        type: 'boot',
        message: 'Store initialized',
        createdAt: now
      }
    ]
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeWatcher(watcher) {
  if (!watcher?.id || !watcher?.query) {
    return null;
  }

  return {
    id: watcher.id,
    name: watcher.name || watcher.query,
    query: watcher.query,
    scope: watcher.scope || '',
    enabled: watcher.enabled !== false,
    intervalMinutes: Number(watcher.intervalMinutes || 15),
    notificationChannels: ensureArray(watcher.notificationChannels).filter(Boolean),
    sourceIds: ensureArray(watcher.sourceIds).filter(Boolean),
    createdAt: watcher.createdAt || nowIso(),
    updatedAt: watcher.updatedAt || watcher.createdAt || nowIso(),
    lastRunAt: watcher.lastRunAt || null
  };
}

function normalizeSource(source) {
  if (!source?.id || !source?.type) {
    return null;
  }

  return {
    id: source.id,
    name: source.name || source.id,
    type: source.type,
    enabled: source.enabled !== false,
    config: source.config && typeof source.config === 'object' ? source.config : {},
    createdAt: source.createdAt || nowIso(),
    updatedAt: source.updatedAt || source.createdAt || nowIso()
  };
}

function normalizeFinding(finding) {
  if (!finding?.id || !finding?.watcherId || !finding?.sourceId) {
    return null;
  }
  return finding;
}

function normalizeNotification(notification) {
  if (!notification?.id) {
    return null;
  }
  return notification;
}

function normalizeActivity(activity) {
  if (!activity?.id || !activity?.type || !activity?.message) {
    return null;
  }

  return {
    ...activity,
    level: activity.level || 'info',
    meta: activity.meta && typeof activity.meta === 'object' ? activity.meta : {}
  };
}

function normalizeLoadedState(loadedState) {
  const defaults = createDefaultState();
  const normalized = {
    settings: {
      ...defaults.settings,
      ...(loadedState?.settings || {})
    },
    watchers: Array.isArray(loadedState?.watchers)
      ? loadedState.watchers.map(normalizeWatcher).filter(Boolean)
      : [],
    sources: Array.isArray(loadedState?.sources)
      ? loadedState.sources.map(normalizeSource).filter(Boolean)
      : [],
    findings: Array.isArray(loadedState?.findings)
      ? loadedState.findings.map(normalizeFinding).filter(Boolean)
      : [],
    notifications: Array.isArray(loadedState?.notifications)
      ? loadedState.notifications.map(normalizeNotification).filter(Boolean)
      : [],
    activity: Array.isArray(loadedState?.activity)
      ? loadedState.activity.map(normalizeActivity).filter(Boolean)
      : []
  };

  let restoredDefaultSources = false;
  if (!normalized.sources.length) {
    normalized.sources = createDefaultSources();
    restoredDefaultSources = true;
  }

  const watcherIds = new Set(normalized.watchers.map((watcher) => watcher.id));
  const sourceIds = new Set(normalized.sources.map((source) => source.id));

  normalized.findings = normalized.findings
    .filter((finding) => watcherIds.has(finding.watcherId) && sourceIds.has(finding.sourceId))
    .slice(-400);

  const findingIds = new Set(normalized.findings.map((finding) => finding.id));
  normalized.notifications = normalized.notifications
    .filter((notification) => !notification.findingId || findingIds.has(notification.findingId))
    .slice(-400);

  if (!normalized.activity.length) {
    normalized.activity = defaults.activity;
  } else {
    normalized.activity = normalized.activity.slice(-400);
  }

  return {
    state: normalized,
    restoredDefaultSources
  };
}

function removeRelatedFindings(state, predicate) {
  const removedFindingIds = new Set();
  state.findings = state.findings.filter((finding) => {
    if (predicate(finding)) {
      removedFindingIds.add(finding.id);
      return false;
    }
    return true;
  });

  if (!removedFindingIds.size) {
    return 0;
  }

  state.notifications = state.notifications.filter(
    (notification) => !notification.findingId || !removedFindingIds.has(notification.findingId)
  );

  return removedFindingIds.size;
}

export async function createStore() {
  await mkdir(path.dirname(STORE_FILE), { recursive: true });

  let state;
  let restoredDefaultSources = false;

  try {
    const raw = await readFile(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const normalized = normalizeLoadedState(parsed);
    state = normalized.state;
    restoredDefaultSources = normalized.restoredDefaultSources;

    if (JSON.stringify(parsed) !== JSON.stringify(state)) {
      await writeFile(STORE_FILE, JSON.stringify(state, null, 2), 'utf8');
    }
  } catch {
    state = createDefaultState();
    await writeFile(STORE_FILE, JSON.stringify(state, null, 2), 'utf8');
  }

  let writeQueue = Promise.resolve();

  async function persist() {
    writeQueue = writeQueue.then(() =>
      writeFile(STORE_FILE, JSON.stringify(state, null, 2), 'utf8')
    );
    await writeQueue;
  }

  function publicState() {
    const runtimeSettings = applyEnvOverrides(state.settings);
    return {
      settings: {
        ...pickMaskedSecrets(runtimeSettings),
        envManaged: envManagedFields()
      },
      watchers: clone(state.watchers),
      sources: clone(state.sources),
      findings: clone(limitItems([...state.findings].reverse(), 80)),
      notifications: clone(limitItems([...state.notifications].reverse(), 80)),
      activity: clone(
        limitItems(
          [...state.activity]
            .reverse()
            .map((item) => ({
              ...item,
              level: item.level || 'info',
              meta: item.meta || {}
            })),
          100
        )
      )
    };
  }

  function recordActivity(type, message, meta = {}, level = 'info') {
    state.activity.push({
      id: createId('activity'),
      level,
      type,
      message,
      meta,
      createdAt: nowIso()
    });
    state.activity = limitItems(state.activity.slice(-400), 400);
  }

  if (restoredDefaultSources) {
    recordActivity(
      'source',
      'Source list was empty. Default sources were restored automatically.',
      { sourceCount: state.sources.length },
      'warn'
    );
    await persist();
  }

  return {
    getState() {
      return {
        ...clone(state),
        settings: applyEnvOverrides(clone(state.settings))
      };
    },
    getPublicState: publicState,
    async updateSettings(patch) {
      const sanitizedPatch = { ...patch };
      const managed = envManagedFields();

      for (const key of Object.keys(managed)) {
        if (managed[key]) {
          delete sanitizedPatch[key];
        }
      }

      state.settings = {
        ...state.settings,
        ...sanitizedPatch
      };
      recordActivity('settings', 'Settings updated');
      await persist();
      return publicState();
    },
    async createWatcher(payload) {
      const now = nowIso();
      const watcher = {
        id: createId('watch'),
        name: payload.name || payload.query || 'Untitled watcher',
        query: payload.query || '',
        scope: payload.scope || '',
        enabled: payload.enabled !== false,
        intervalMinutes: Number(payload.intervalMinutes || 15),
        notificationChannels: ensureArray(payload.notificationChannels).filter(Boolean),
        sourceIds: ensureArray(payload.sourceIds).filter(Boolean),
        createdAt: now,
        updatedAt: now,
        lastRunAt: null
      };
      state.watchers.push(watcher);
      recordActivity('watcher', `Watcher created: ${watcher.name}`);
      await persist();
      return watcher;
    },
    async updateWatcher(id, patch) {
      const watcher = state.watchers.find((item) => item.id === id);
      if (!watcher) {
        throw new Error('Watcher not found');
      }

      const next = normalizeWatcher({
        ...watcher,
        ...patch,
        updatedAt: nowIso()
      });

      Object.assign(watcher, next);
      recordActivity('watcher', `Watcher updated: ${watcher.name}`);
      await persist();
      return watcher;
    },
    async removeWatcher(id) {
      const index = state.watchers.findIndex((item) => item.id === id);
      if (index === -1) {
        throw new Error('Watcher not found');
      }

      const [removed] = state.watchers.splice(index, 1);
      const removedCount = removeRelatedFindings(state, (finding) => finding.watcherId === id);
      recordActivity('watcher', `Watcher removed: ${removed.name}`, {
        removedFindings: removedCount
      });
      await persist();
      return removed;
    },
    async createSource(payload) {
      const now = nowIso();
      const source = {
        id: createId('src'),
        name: payload.name || 'Untitled source',
        type: payload.type || 'rss',
        enabled: payload.enabled !== false,
        config: payload.config && typeof payload.config === 'object' ? payload.config : {},
        createdAt: now,
        updatedAt: now
      };
      state.sources.push(source);
      recordActivity('source', `Source created: ${source.name}`);
      await persist();
      return source;
    },
    async updateSource(id, patch) {
      const source = state.sources.find((item) => item.id === id);
      if (!source) {
        throw new Error('Source not found');
      }

      const next = normalizeSource({
        ...source,
        ...patch,
        updatedAt: nowIso()
      });

      Object.assign(source, next);
      recordActivity('source', `Source updated: ${source.name}`);
      await persist();
      return source;
    },
    async removeSource(id) {
      const index = state.sources.findIndex((item) => item.id === id);
      if (index === -1) {
        throw new Error('Source not found');
      }

      const [removed] = state.sources.splice(index, 1);
      const removedCount = removeRelatedFindings(state, (finding) => finding.sourceId === id);

      if (!state.sources.length) {
        state.sources = createDefaultSources();
        recordActivity(
          'source',
          'All sources were removed. Default sources were restored automatically.',
          { sourceCount: state.sources.length },
          'warn'
        );
      }

      recordActivity('source', `Source removed: ${removed.name}`, {
        removedFindings: removedCount
      });
      await persist();
      return removed;
    },
    async addFinding(finding) {
      state.findings.push(finding);
      state.findings = limitItems(state.findings.slice(-400), 400);
      await persist();
      return finding;
    },
    async addNotification(notification) {
      state.notifications.push(notification);
      state.notifications = limitItems(state.notifications.slice(-400), 400);
      await persist();
      return notification;
    },
    async touchWatcherRun(id) {
      const watcher = state.watchers.find((item) => item.id === id);
      if (!watcher) {
        return;
      }
      watcher.lastRunAt = nowIso();
      watcher.updatedAt = nowIso();
      await persist();
    },
    async recordActivity(type, message, meta = {}, level = 'info') {
      recordActivity(type, message, meta, level);
      await persist();
    }
  };
}
