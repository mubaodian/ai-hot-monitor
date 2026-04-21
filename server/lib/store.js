import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyEnvOverrides, envManagedFields } from './env.js';
import { createId, limitItems, nowIso, pickMaskedSecrets } from './utils.js';

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
      enabled: false,
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
    watchers: [
      {
        id: 'watch_ai_coding',
        name: 'AI 编程雷达',
        query: 'AI 编程',
        scope: '聚焦 AI coding, coding agents, code model, devtool 发布和热门讨论',
        enabled: true,
        intervalMinutes: 15,
        notificationChannels: ['browser', 'email'],
        sourceIds: [],
        createdAt: now,
        updatedAt: now,
        lastRunAt: null
      }
    ],
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

export async function createStore() {
  await mkdir(path.dirname(STORE_FILE), { recursive: true });

  let state;
  try {
    state = JSON.parse(await readFile(STORE_FILE, 'utf8'));
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
      activity: clone(limitItems([...state.activity].reverse(), 100))
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
        name: payload.name || payload.query || '未命名监控',
        query: payload.query || '',
        scope: payload.scope || '',
        enabled: payload.enabled !== false,
        intervalMinutes: Number(payload.intervalMinutes || 15),
        notificationChannels: payload.notificationChannels || ['browser'],
        sourceIds: payload.sourceIds || [],
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
      Object.assign(watcher, patch, { updatedAt: nowIso() });
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
      recordActivity('watcher', `Watcher removed: ${removed.name}`);
      await persist();
      return removed;
    },
    async createSource(payload) {
      const now = nowIso();
      const source = {
        id: createId('src'),
        name: payload.name || '未命名源',
        type: payload.type || 'rss',
        enabled: payload.enabled !== false,
        config: payload.config || {},
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
      Object.assign(source, patch, { updatedAt: nowIso() });
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
      recordActivity('source', `Source removed: ${removed.name}`);
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
