import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  Bell,
  Clock3,
  Copy,
  ExternalLink,
  Flame,
  MailCheck,
  Radar,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  TriangleAlert,
  Workflow,
  Zap
} from 'lucide-react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { FloatingNav } from './components/ui/floating-nav.jsx';
import { Pagination } from './components/ui/pagination.jsx';
import { Spotlight } from './components/ui/spotlight.jsx';
import { cn, formatDate, paginate, summarizeSourceConfig } from './lib/utils.js';

const PAGE_SIZE = 10;
const ACTIVE_ALL = '__all__';

const NAV_ITEMS = [
  { to: '/findings', label: '热点流', icon: Flame },
  { to: '/watchers', label: '监控任务', icon: Radar },
  { to: '/sources', label: '信息源', icon: Workflow },
  { to: '/notifications', label: '通知记录', icon: Bell },
  { to: '/settings', label: '运行设置', icon: Settings2 }
];

const INITIAL_SETTINGS = {
  openRouterModel: '',
  pollIntervalMs: 60000,
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  emailFrom: '',
  emailTo: '',
  browserNotificationsEnabled: false
};

const INITIAL_WATCHER = {
  id: '',
  name: '',
  query: '',
  scope: '',
  intervalMinutes: 15,
  notificationChannels: ['browser', 'email'],
  sourceIds: []
};

const INITIAL_SOURCE = {
  id: '',
  name: '',
  type: 'rss',
  enabled: true,
  config: '{\n  "queryTemplate": "{query}",\n  "limit": 8\n}'
};

const EMPTY_STATE = {
  settings: INITIAL_SETTINGS,
  watchers: [],
  sources: [],
  findings: [],
  notifications: []
};

const EMPTY_SEARCH = {
  findings: '',
  watchers: '',
  sources: '',
  notifications: '',
  settings: ''
};

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeSection = getRouteSection(location.pathname);

  const [appState, setAppState] = useState(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeWatcherId, setActiveWatcherId] = useState(ACTIVE_ALL);
  const [findingFilter, setFindingFilter] = useState('all');
  const [settingsForm, setSettingsForm] = useState(INITIAL_SETTINGS);
  const [watcherForm, setWatcherForm] = useState(INITIAL_WATCHER);
  const [sourceForm, setSourceForm] = useState(INITIAL_SOURCE);
  const [searchQueries, setSearchQueries] = useState(EMPTY_SEARCH);
  const [pages, setPages] = useState({
    watchers: 1,
    sources: 1,
    findings: 1,
    notifications: 1
  });
  const [browserPermission, setBrowserPermission] = useState('unsupported');
  const [toastMessage, setToastMessage] = useState('');

  const loadStateRef = useRef(null);
  const settingsRef = useRef(appState.settings);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  useEffect(() => {
    if (!('Notification' in window)) {
      setBrowserPermission('unsupported');
      return;
    }

    setBrowserPermission(Notification.permission);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  function resolveActiveWatcher(data, nextActiveId = activeWatcherId) {
    if (nextActiveId === ACTIVE_ALL) {
      return ACTIVE_ALL;
    }

    if (!data.watchers.length) {
      return ACTIVE_ALL;
    }

    const current = data.watchers.find(
      (watcher) => watcher.id === nextActiveId && watcher.enabled !== false
    );
    return current ? current.id : ACTIVE_ALL;
  }

  async function loadState() {
    try {
      const response = await fetch('/api/state');
      const data = await response.json();
      const resolvedWatcherId = resolveActiveWatcher(data);

      startTransition(() => {
        setAppState(data);
        setSettingsForm({
          openRouterModel: data.settings.openRouterModel || '',
          pollIntervalMs: Number(data.settings.pollIntervalMs || 60000),
          smtpHost: data.settings.smtpHost || '',
          smtpPort: Number(data.settings.smtpPort || 587),
          smtpSecure: Boolean(data.settings.smtpSecure),
          emailFrom: data.settings.emailFrom || '',
          emailTo: data.settings.emailTo || '',
          browserNotificationsEnabled: Boolean(data.settings.browserNotificationsEnabled)
        });
        setActiveWatcherId(resolvedWatcherId);
        setError('');
      });
    } catch (nextError) {
      setError(nextError.message || '加载项目状态失败');
    } finally {
      setLoading(false);
    }
  }

  loadStateRef.current = loadState;

  useEffect(() => {
    void loadState();
  }, []);

  useEffect(() => {
    const stream = new EventSource('/api/events');

    stream.addEventListener('state', async () => {
      await loadStateRef.current?.();
    });

    stream.addEventListener('finding', async (event) => {
      const payload = JSON.parse(event.data);
      setActiveWatcherId(payload.watcher?.id || ACTIVE_ALL);
      maybeBrowserNotify(payload, settingsRef.current);
      setPages((current) => ({ ...current, findings: 1, notifications: 1 }));
      await loadStateRef.current?.();
    });

    return () => stream.close();
  }, []);

  useEffect(() => {
    settingsRef.current = appState.settings;
  }, [appState.settings]);

  const activeWatcher = useMemo(() => {
    if (activeWatcherId === ACTIVE_ALL) {
      return null;
    }

    return (
      appState.watchers.find(
        (watcher) => watcher.id === activeWatcherId && watcher.enabled !== false
      ) || null
    );
  }, [appState.watchers, activeWatcherId]);

  const watcherById = useMemo(
    () => Object.fromEntries(appState.watchers.map((watcher) => [watcher.id, watcher])),
    [appState.watchers]
  );

  const enabledWatchers = useMemo(
    () => appState.watchers.filter((watcher) => watcher.enabled !== false),
    [appState.watchers]
  );

  const enabledWatcherIds = useMemo(
    () => new Set(enabledWatchers.map((watcher) => watcher.id)),
    [enabledWatchers]
  );

  const sourceById = useMemo(
    () => Object.fromEntries(appState.sources.map((source) => [source.id, source])),
    [appState.sources]
  );

  const visibleFindings = useMemo(
    () => appState.findings.filter((finding) => enabledWatcherIds.has(finding.watcherId)),
    [appState.findings, enabledWatcherIds]
  );

  const findingById = useMemo(
    () => Object.fromEntries(visibleFindings.map((finding) => [finding.id, finding])),
    [visibleFindings]
  );

  const queryCapableSources = useMemo(
    () => appState.sources.filter((source) => isQueryCapableSource(source)),
    [appState.sources]
  );

  const findingsBase = useMemo(() => {
    const scoped = activeWatcher
      ? visibleFindings.filter((finding) => finding.watcherId === activeWatcher.id)
      : visibleFindings;

    const sorted = [...scoped].sort(
      (a, b) =>
        new Date(b.detectedAt || b.publishedAt || Date.now()).getTime() -
        new Date(a.detectedAt || a.publishedAt || Date.now()).getTime()
    );

    const relevant = sorted.filter((finding) => finding.aiDecision?.relevant !== false);
    return relevant.length ? relevant : sorted;
  }, [visibleFindings, activeWatcher]);

  const notificationsBase = useMemo(() => {
    if (!activeWatcher) {
      const visibleFindingIds = new Set(visibleFindings.map((finding) => finding.id));
      return appState.notifications
        .filter((notification) => visibleFindingIds.has(notification.findingId))
        .sort(
          (a, b) =>
            new Date(b.sentAt || b.createdAt || Date.now()).getTime() -
            new Date(a.sentAt || a.createdAt || Date.now()).getTime()
        );
    }

    const findingIds = new Set(findingsBase.map((finding) => finding.id));
    return appState.notifications
      .filter((notification) => findingIds.has(notification.findingId))
      .sort(
        (a, b) =>
          new Date(b.sentAt || b.createdAt || Date.now()).getTime() -
          new Date(a.sentAt || a.createdAt || Date.now()).getTime()
      );
  }, [appState.notifications, activeWatcher, findingsBase, visibleFindings]);

  const findingsKeyword = searchQueries.findings.trim().toLowerCase();
  const watchersKeyword = searchQueries.watchers.trim().toLowerCase();
  const sourcesKeyword = searchQueries.sources.trim().toLowerCase();
  const notificationsKeyword = searchQueries.notifications.trim().toLowerCase();

  const filteredWatchers = useMemo(() => {
    if (!watchersKeyword) {
      return appState.watchers;
    }

    return appState.watchers.filter((watcher) =>
      [watcher.name, watcher.query, watcher.scope]
        .join(' ')
        .toLowerCase()
        .includes(watchersKeyword)
    );
  }, [appState.watchers, watchersKeyword]);

  const filteredSources = useMemo(() => {
    if (!sourcesKeyword) {
      return appState.sources;
    }

    return appState.sources.filter((source) =>
      [source.name, formatSourceType(source.type), summarizeSourceConfig(source.config)]
        .join(' ')
        .toLowerCase()
        .includes(sourcesKeyword)
    );
  }, [appState.sources, sourcesKeyword]);

  const filteredFindings = useMemo(() => {
    return findingsBase.filter((finding) => {
      if (findingFilter === 'today') {
        const detectedDate = new Date(
          finding.detectedAt || finding.publishedAt || Date.now()
        ).toDateString();
        if (detectedDate !== new Date().toDateString()) {
          return false;
        }
      }

      if (findingFilter === 'urgent') {
        const heatScore = Number(finding.aiDecision?.heatScore || 0);
        if (!finding.aiDecision?.shouldNotify && heatScore < 70) {
          return false;
        }
      }

      if (!findingsKeyword) {
        return true;
      }

      return [finding.title, finding.snippet, finding.sourceName, finding.author]
        .join(' ')
        .toLowerCase()
        .includes(findingsKeyword);
    });
  }, [findingsBase, findingFilter, findingsKeyword]);

  const filteredNotifications = useMemo(() => {
    return notificationsBase.filter((notification) => {
      if (!notificationsKeyword) {
        return true;
      }

      const finding = findingById[notification.findingId];
      return [
        formatNotificationChannel(notification.channel),
        formatNotificationStatus(notification.status),
        notification.errorMessage,
        finding?.title,
        finding?.sourceName
      ]
        .join(' ')
        .toLowerCase()
        .includes(notificationsKeyword);
    });
  }, [notificationsBase, notificationsKeyword, findingById]);

  const totalHotspots = visibleFindings.length;
  const todayHotspots = useMemo(() => {
    const today = new Date().toDateString();
    return visibleFindings.filter(
      (finding) =>
        new Date(finding.detectedAt || finding.publishedAt || Date.now()).toDateString() === today
    ).length;
  }, [visibleFindings]);

  const urgentHotspots = useMemo(
    () =>
      visibleFindings.filter(
        (finding) => finding.aiDecision?.shouldNotify || Number(finding.aiDecision?.heatScore || 0) >= 70
      ).length,
    [visibleFindings]
  );

  const monitoredKeywords = enabledWatchers.length;

  const enabledSources = useMemo(
    () => appState.sources.filter((source) => source.enabled).length,
    [appState.sources]
  );

  const emailReady = Boolean(appState.settings.smtpHost && appState.settings.emailTo);

  const findingPage = paginate(filteredFindings, pages.findings, PAGE_SIZE);
  const notificationPage = paginate(filteredNotifications, pages.notifications, PAGE_SIZE);
  const watcherPage = paginate(filteredWatchers, pages.watchers, PAGE_SIZE);
  const sourcePage = paginate(filteredSources, pages.sources, PAGE_SIZE);

  async function requestJson(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || '璇锋眰澶辫触');
    }
    return payload;
  }

  async function handleAction(action, fallbackMessage) {
    try {
      await action();
      setError('');
    } catch (nextError) {
      setError(nextError.message || fallbackMessage);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    await handleAction(async () => {
      await requestJson('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm)
      });
      await loadState();
    }, '淇濆瓨璁剧疆澶辫触');
  }

  async function requestBrowserPermission() {
    await handleAction(async () => {
      if (!('Notification' in window)) {
        throw new Error('褰撳墠娴忚鍣ㄤ笉鏀寔鍘熺敓閫氱煡');
      }

      const permission = await Notification.requestPermission();
      setBrowserPermission(permission);

      if (permission !== 'granted') {
        throw new Error('浏览器通知权限未授予');
      }

      setSettingsForm((current) => ({
        ...current,
        browserNotificationsEnabled: true
      }));
    }, '鑾峰彇娴忚鍣ㄩ€氱煡鏉冮檺澶辫触');
  }

  async function testEmail() {
    await handleAction(async () => {
      await requestJson('/api/test-email', { method: 'POST' });
      window.alert('SMTP 验证通过，邮件链路可用。');
    }, '楠岃瘉閭欢閰嶇疆澶辫触');
  }

  async function saveWatcher(event) {
    event.preventDefault();
    await handleAction(async () => {
      const payload = {
        name: watcherForm.name,
        query: watcherForm.query,
        scope: watcherForm.scope,
        intervalMinutes: Number(watcherForm.intervalMinutes || 15),
        notificationChannels: watcherForm.notificationChannels,
        sourceIds: watcherForm.sourceIds
      };
      const url = watcherForm.id ? `/api/watchers/${watcherForm.id}` : '/api/watchers';
      const method = watcherForm.id ? 'PATCH' : 'POST';
      const response = await requestJson(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const watcherId = response.watcher?.id || watcherForm.id;
      setWatcherForm(INITIAL_WATCHER);
      setPages((current) => ({ ...current, watchers: 1, findings: 1, notifications: 1 }));

      if (watcherId) {
        await requestJson(`/api/watchers/${watcherId}/run`, { method: 'POST' });
        setActiveWatcherId(watcherId);
        setFindingFilter('all');
        navigate('/findings');
      }

      await loadState();
    }, '淇濆瓨鐩戞帶浠诲姟澶辫触');
  }

  async function saveSource(event) {
    event.preventDefault();
    await handleAction(async () => {
      const payload = {
        name: sourceForm.name,
        type: sourceForm.type,
        enabled: sourceForm.enabled,
        config: sourceForm.config ? JSON.parse(sourceForm.config) : {}
      };
      const url = sourceForm.id ? `/api/sources/${sourceForm.id}` : '/api/sources';
      const method = sourceForm.id ? 'PATCH' : 'POST';
      await requestJson(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setSourceForm(INITIAL_SOURCE);
      setPages((current) => ({ ...current, sources: 1 }));
      await loadState();
    }, '保存信息源失败');
  }

  async function runAllNow() {
    await handleAction(async () => {
      setFindingFilter('all');
      setActiveWatcherId(ACTIVE_ALL);
      setPages((current) => ({ ...current, findings: 1, notifications: 1 }));
      await requestJson('/api/run-now', { method: 'POST' });
      navigate('/findings');
      await loadState();
    }, '绔嬪嵆鎵弿澶辫触');
  }

  async function runWatcher(watcherId) {
    await handleAction(async () => {
      await requestJson(`/api/watchers/${watcherId}/run`, { method: 'POST' });
      setActiveWatcherId(watcherId);
      setFindingFilter('all');
      setPages((current) => ({ ...current, findings: 1, notifications: 1 }));
      navigate('/findings');
      await loadState();
    }, '杩愯鐩戞帶浠诲姟澶辫触');
  }

  async function toggleWatcher(watcher) {
    await handleAction(async () => {
      await requestJson(`/api/watchers/${watcher.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !watcher.enabled })
      });
      await loadState();
    }, '鏇存柊鐩戞帶浠诲姟澶辫触');
  }

  async function deleteWatcher(watcherId) {
    if (!window.confirm('确认删除这个监控任务吗？相关热点与通知记录也会被一并移除。')) {
      return;
    }

    await handleAction(async () => {
      await requestJson(`/api/watchers/${watcherId}`, { method: 'DELETE' });
      if (watcherId === activeWatcherId) {
        setActiveWatcherId(ACTIVE_ALL);
      }
      await loadState();
    }, '鍒犻櫎鐩戞帶浠诲姟澶辫触');
  }

  async function toggleSource(source) {
    await handleAction(async () => {
      await requestJson(`/api/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !source.enabled })
      });
      await loadState();
    }, '更新信息源失败');
  }

  async function deleteSource(sourceId) {
    if (!window.confirm('确认删除这个信息源吗？它关联的热点记录也会被删除。')) {
      return;
    }

    await handleAction(async () => {
      await requestJson(`/api/sources/${sourceId}`, { method: 'DELETE' });
      await loadState();
    }, '删除信息源失败');
  }

  function updateRouteSearch(value) {
    if (routeSection === 'settings') {
      return;
    }

    setSearchQueries((current) => ({
      ...current,
      [routeSection]: value
    }));
    setPages((current) => ({
      ...current,
      [routeSection]: 1
    }));
  }

  function clearRouteSearch() {
    updateRouteSearch('');
  }

  function openFindings(filter = 'all') {
    setFindingFilter(filter);
    setActiveWatcherId(ACTIVE_ALL);
    setPages((current) => ({ ...current, findings: 1 }));
    navigate('/findings');
  }

  function focusWatcher(watcherId) {
    setActiveWatcherId(watcherId);
    setFindingFilter('all');
    setPages((current) => ({ ...current, findings: 1, notifications: 1 }));
    navigate('/findings');
  }

  function showToast(message) {
    setToastMessage(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage('');
      toastTimerRef.current = null;
    }, 2200);
  }

  async function copyLink(url) {
    if (!url) {
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        showToast('\u94fe\u63a5\u5df2\u590d\u5236');
      } else {
        window.prompt('\u8bf7\u590d\u5236\u94fe\u63a5', url);
        showToast('\u8bf7\u624b\u52a8\u590d\u5236\u94fe\u63a5');
      }
    } catch {
      window.prompt('\u8bf7\u590d\u5236\u94fe\u63a5', url);
      showToast('\u8bf7\u624b\u52a8\u590d\u5236\u94fe\u63a5');
    }
  }

  const currentSearch = searchQueries[routeSection] || '';
  const currentPlaceholder = getSearchPlaceholder(routeSection);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(47,211,173,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(80,164,255,0.16),transparent_24%),linear-gradient(180deg,#04070d_0%,#060910_38%,#04070d_100%)] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(133,255,225,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(133,255,225,0.035)_1px,transparent_1px)] bg-[size:36px_36px] opacity-30 [mask-image:radial-gradient(circle_at_center,black_38%,transparent_82%)]" />
      <div className="relative mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <TopBar
          activeWatcher={activeWatcher}
          enabledSources={enabledSources}
          notificationCount={appState.notifications.length}
          onOpenNotifications={() => navigate('/notifications')}
          onRunNow={runAllNow}
        />

        <FloatingNav
          items={NAV_ITEMS}
          searchValue={currentSearch}
          searchPlaceholder={currentPlaceholder}
          searchDisabled={routeSection === 'settings'}
          onClearSearch={clearRouteSearch}
          onSearchChange={updateRouteSearch}
        />

        <Hero
          activeWatcher={activeWatcher}
          emailReady={emailReady}
          enabledSources={enabledSources}
          monitoredKeywords={monitoredKeywords}
          totalHotspots={totalHotspots}
          todayHotspots={todayHotspots}
          urgentHotspots={urgentHotspots}
          browserNotificationsEnabled={Boolean(appState.settings.browserNotificationsEnabled)}
          onMetricClick={openFindings}
          onResetWatcher={() => setActiveWatcherId(ACTIVE_ALL)}
          onRunNow={runAllNow}
        />

        {error ? (
          <div className="mb-6 rounded-2xl border border-amber-400/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-100">
            {error}
          </div>
        ) : null}

        {loading ? (
          <LoadingScreen />
        ) : (
          <Routes>
            <Route
              path="/"
              element={
                <FindingsPage
                  activeWatcher={activeWatcher}
                  filter={findingFilter}
                  page={findingPage}
                  watcherById={watcherById}
                  onCopyLink={copyLink}
                  onOpenAll={() => setActiveWatcherId(ACTIVE_ALL)}
                  onPageChange={(page) => setPages((current) => ({ ...current, findings: page }))}
                  onSetFilter={setFindingFilter}
                />
              }
            />
            <Route
              path="/findings"
              element={
                <FindingsPage
                  activeWatcher={activeWatcher}
                  filter={findingFilter}
                  page={findingPage}
                  watcherById={watcherById}
                  onCopyLink={copyLink}
                  onOpenAll={() => setActiveWatcherId(ACTIVE_ALL)}
                  onPageChange={(page) => setPages((current) => ({ ...current, findings: page }))}
                  onSetFilter={setFindingFilter}
                />
              }
            />
            <Route
              path="/watchers"
              element={
                <WatchersPage
                  activeWatcherId={activeWatcherId}
                  form={watcherForm}
                  page={watcherPage}
                  querySources={queryCapableSources}
                  sourceById={sourceById}
                  onDelete={deleteWatcher}
                  onEdit={(watcher) => setWatcherForm(watcherToForm(watcher))}
                  onFocus={focusWatcher}
                  onFormChange={setWatcherForm}
                  onPageChange={(page) => setPages((current) => ({ ...current, watchers: page }))}
                  onSubmit={saveWatcher}
                  onToggle={toggleWatcher}
                />
              }
            />
            <Route
              path="/sources"
              element={
                <SourcesPage
                  form={sourceForm}
                  page={sourcePage}
                  onDelete={deleteSource}
                  onEdit={(source) => setSourceForm(sourceToForm(source))}
                  onFormChange={setSourceForm}
                  onPageChange={(page) => setPages((current) => ({ ...current, sources: page }))}
                  onSubmit={saveSource}
                  onToggle={toggleSource}
                />
              }
            />
            <Route
              path="/notifications"
              element={
                <NotificationsPage
                  activeWatcher={activeWatcher}
                  findingById={findingById}
                  page={notificationPage}
                  watcherById={watcherById}
                  onCopyLink={copyLink}
                  onOpenFindingWatcher={focusWatcher}
                  onPageChange={(page) =>
                    setPages((current) => ({ ...current, notifications: page }))
                  }
                />
              }
            />
            <Route
              path="/settings"
              element={
                <SettingsPage
                  browserPermission={browserPermission}
                  envManaged={appState.settings.envManaged || {}}
                  form={settingsForm}
                  onFormChange={setSettingsForm}
                  onRequestBrowserPermission={requestBrowserPermission}
                  onSubmit={saveSettings}
                  onTestEmail={testEmail}
                />
              }
            />
          </Routes>
        )}

        {toastMessage ? (
          <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[#61efbd]/20 bg-[rgba(8,18,18,0.92)] px-4 py-2 text-sm text-[#ddffe9] shadow-[0_18px_45px_rgba(0,0,0,0.32)] backdrop-blur-xl">
            {toastMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TopBar({ activeWatcher, enabledSources, notificationCount, onOpenNotifications, onRunNow }) {
  return (
    <header className="mb-4 rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,14,22,0.98),rgba(8,11,18,0.98))] px-4 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#26d7af,#58a3ff)] shadow-[0_12px_30px_rgba(41,177,220,0.28)]">
            <Zap className="h-5 w-5 text-white" />
            <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border border-[#08111a] bg-[#6ef0b7]" />
          </div>
          <div>
            <div className="font-display text-[1.65rem] font-semibold tracking-tight text-white">
              HotPulse
            </div>
            <div className="text-sm text-white/45">
              面向 AI 创作者的热点雷达，盯住真实信号，不看假热闹
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-white/68">
            {activeWatcher ? (
              <span>
                当前聚焦: <span className="text-white">{activeWatcher.name}</span> / {activeWatcher.query}
              </span>
            ) : (
              <span>
                当前聚焦: <span className="text-white">全部任务</span>，已启用 {enabledSources} 个信息源
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onRunNow}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#1fd8ae,#4f92ff)] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_35px_rgba(32,171,210,0.24)] transition hover:translate-y-[-1px]"
          >
            <RefreshCw className="h-4 w-4" />
            立即扫描
          </button>
          <button
            type="button"
            onClick={onOpenNotifications}
            aria-label="打开通知记录"
            className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.04] text-white/72 transition hover:bg-white/[0.08] hover:text-white"
          >
            <Bell className="h-5 w-5" />
            {notificationCount ? (
              <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-[#ff625d] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero({
  activeWatcher,
  emailReady,
  enabledSources,
  monitoredKeywords,
  totalHotspots,
  todayHotspots,
  urgentHotspots,
  browserNotificationsEnabled,
  onMetricClick,
  onResetWatcher,
  onRunNow
}) {
  return (
    <section className="relative mb-8 overflow-hidden rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(8,12,19,0.97),rgba(7,10,16,0.97))] px-4 py-5 shadow-[0_24px_90px_rgba(0,0,0,0.35)] sm:px-5">
      <Spotlight className="-left-12 top-0 h-52 w-52" fill="rgba(45,148,255,0.14)" />
      <Spotlight className="right-0 top-10 h-48 w-48" fill="rgba(65,238,190,0.1)" />

      <div className="relative mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium tracking-[0.16em] text-white/58">
            <Sparkles className="h-3.5 w-3.5 text-[#7cd6ff]" />
            Signal Console
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            热点一出现，就该被你先抓到。
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-white/50">
            这里展示的是当前系统真实状态，不做装饰性假数据。你可以直接切到热点流、任务、信息源和通知记录，所有按钮都会实际触发扫描、筛选或跳转。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <InfoChip label="信息源" value={`${enabledSources} 个启用`} />
          <InfoChip
            label="浏览器推送"
            value={browserNotificationsEnabled ? '已开启' : '未开启'}
          />
          <InfoChip label="邮件通知" value={emailReady ? '已就绪' : '待配置'} />
          {activeWatcher ? (
            <button
              type="button"
              onClick={onResetWatcher}
              className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-white/78 transition hover:bg-white/[0.08]"
            >
              返回全部任务视图
            </button>
          ) : (
            <SecondaryActionButton icon={MailCheck} onClick={onRunNow}>
              刷新概览
            </SecondaryActionButton>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          action="点击查看全部热点"
          icon={Activity}
          label="热点总量"
          tone="cyan"
          value={totalHotspots}
          onClick={() => onMetricClick('all')}
        />
        <MetricCard
          action="点击筛选今日新增"
          icon={Clock3}
          label="今日新增"
          tone="blue"
          value={todayHotspots}
          onClick={() => onMetricClick('today')}
        />
        <MetricCard
          action="点击筛选高优先级热点"
          icon={TriangleAlert}
          label="高优先级热点"
          tone="rose"
          value={urgentHotspots}
          onClick={() => onMetricClick('urgent')}
        />
        <MetricCard
          action="点击进入监控任务"
          icon={Radar}
          label="生效中的关键词"
          tone="green"
          value={monitoredKeywords}
          onClick={() => onMetricClick('all')}
          linkToWatchers
        />
      </div>
    </section>
  );
}

function MetricCard({ action, icon: Icon, label, linkToWatchers = false, onClick, tone, value }) {
  const navigate = useNavigate();

  const toneMap = {
    cyan: 'border-[#223a4d] bg-[linear-gradient(180deg,rgba(10,23,35,0.92),rgba(9,14,22,0.92))] text-[#68d7ff]',
    blue: 'border-[#24345b] bg-[linear-gradient(180deg,rgba(11,22,43,0.92),rgba(9,14,22,0.92))] text-[#77c7ff]',
    rose: 'border-[#4d2232] bg-[linear-gradient(180deg,rgba(31,14,24,0.92),rgba(17,11,17,0.92))] text-[#ff817f]',
    green: 'border-[#1b473d] bg-[linear-gradient(180deg,rgba(9,26,24,0.92),rgba(8,15,16,0.92))] text-[#67ecba]'
  };

  function handleClick() {
    if (linkToWatchers) {
      navigate('/watchers');
      return;
    }

    onClick?.();
  }

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      onClick={handleClick}
      className={cn(
        'rounded-[24px] border p-5 text-left transition hover:translate-y-[-1px] focus:outline-none focus:ring-2 focus:ring-[#6fecc1]/30',
        toneMap[tone]
      )}
    >
      <div className="flex items-center gap-2 text-sm text-white/50">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <div className="mt-5 text-5xl font-semibold tracking-tight">{value}</div>
      <div className="mt-3 text-xs uppercase tracking-[0.18em] text-white/28">{action}</div>
    </motion.button>
  );
}

function PageShell({ kicker, title, description, extra, children }) {
  return (
    <section>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#8ef3c8]">
            {kicker}
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/56 sm:text-base">{description}</p>
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

function Panel({ children, className }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={cn(
        'rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(11,17,24,0.92),rgba(8,12,18,0.94))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)]',
        className
      )}
    >
      {children}
    </motion.section>
  );
}

function FindingsPage({
  activeWatcher,
  filter,
  page,
  watcherById,
  onCopyLink,
  onOpenAll,
  onPageChange,
  onSetFilter
}) {
  return (
    <PageShell
      kicker="Route /findings"
      title="热点流"
      description="只展示真实抓取并经过 AI 判别后的结果。你可以按当前任务查看，也可以切回全部任务视角，再用顶部搜索框继续缩小范围。"
      extra={
        <div className="flex flex-wrap items-center gap-2">
          <ScopeChip active>{activeWatcher ? `${activeWatcher.name} / ${activeWatcher.query}` : '全部任务'}</ScopeChip>
          <ScopeChip>{formatFindingFilter(filter)}</ScopeChip>
          {activeWatcher ? (
            <GhostButton onClick={onOpenAll}>查看全部任务热点</GhostButton>
          ) : null}
          {filter !== 'all' ? <GhostButton onClick={() => onSetFilter('all')}>清除筛选</GhostButton> : null}
        </div>
      }
    >
      <Panel>
        <div className="mb-4 flex flex-wrap gap-2">
          <FilterButton active={filter === 'all'} onClick={() => onSetFilter('all')}>
            全部
          </FilterButton>
          <FilterButton active={filter === 'today'} onClick={() => onSetFilter('today')}>
            今日新增
          </FilterButton>
          <FilterButton active={filter === 'urgent'} onClick={() => onSetFilter('urgent')}>
            高优先级
          </FilterButton>
        </div>

        <div className="space-y-4">
          {page.total ? (
            page.items.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                watcher={watcherById[finding.watcherId]}
                onCopyLink={onCopyLink}
              />
            ))
          ) : (
            <EmptyState
              title="当前条件下没有热点结果"
              description={
                activeWatcher
                  ? `任务“${activeWatcher.name}”目前还没有新的命中结果。你可以立即扫描，或者切回全部任务视图。`
                  : '暂时没有命中的热点。你可以创建监控任务，或点击顶部“立即扫描”重新抓取。'
              }
            />
          )}
        </div>
        <Pagination meta={{ ...page, pageSize: PAGE_SIZE }} onChange={onPageChange} />
      </Panel>
    </PageShell>
  );
}

function WatchersPage({
  activeWatcherId,
  form,
  page,
  querySources,
  sourceById,
  onDelete,
  onEdit,
  onFocus,
  onFormChange,
  onPageChange,
  onSubmit,
  onToggle
}) {
  return (
    <PageShell
      kicker="Route /watchers"
      title="监控任务"
      description="把你要抢的热点拆成可执行任务。保存后会立刻触发一次查询，列表区可以直接查看结果、编辑、启停和删除。"
    >
      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Panel>
          <FormTitle
            title="编辑任务"
            hint="关键词决定抓取方向，信息源绑定决定抓哪些来源，通知方式决定热点命中后怎么提醒你。"
          />
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="任务名称">
                <input
                  className={INPUT_CLASS}
                  value={form.name}
                  onChange={(event) => onFormChange((current) => ({ ...current, name: event.target.value }))}
                  placeholder="AI 编程雷达"
                />
              </Field>
              <Field label="关键词">
                <input
                  className={INPUT_CLASS}
                  required
                  value={form.query}
                  onChange={(event) => onFormChange((current) => ({ ...current, query: event.target.value }))}
                  placeholder="Claude Code"
                />
              </Field>
            </div>

            <Field label="范围说明">
              <textarea
                className={TEXTAREA_CLASS}
                rows="4"
                value={form.scope}
                onChange={(event) => onFormChange((current) => ({ ...current, scope: event.target.value }))}
                placeholder="例如：关注 coding agents、模型更新、IDE 插件、官方发布和高热讨论"
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="执行间隔（分钟）">
                <input
                  className={INPUT_CLASS}
                  min="1"
                  type="number"
                  value={form.intervalMinutes}
                  onChange={(event) =>
                    onFormChange((current) => ({
                      ...current,
                      intervalMinutes: Number(event.target.value || 15)
                    }))
                  }
                />
              </Field>
              <Field label="通知方式">
                <div className="flex flex-wrap gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                  {['browser', 'email'].map((channel) => {
                    const active = form.notificationChannels.includes(channel);
                    return (
                      <button
                        key={channel}
                        type="button"
                        onClick={() =>
                          onFormChange((current) => ({
                            ...current,
                            notificationChannels: active
                              ? current.notificationChannels.filter((item) => item !== channel)
                              : [...current.notificationChannels, channel]
                          }))
                        }
                        className={cn(
                          'rounded-full px-4 py-2 text-sm transition',
                          active
                            ? 'bg-[linear-gradient(135deg,#4fe8bf,#d6ff54)] text-[#08110d]'
                            : 'bg-white/6 text-white/68 hover:bg-white/10 hover:text-white'
                        )}
                      >
                        {channel === 'browser' ? '浏览器推送' : '邮件通知'}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>

            <Field label="绑定信息源">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                <div className="flex flex-wrap gap-2">
                  {querySources.length ? (
                    querySources.map((source) => {
                      const active = form.sourceIds.includes(source.id);
                      return (
                        <button
                          key={source.id}
                          type="button"
                          onClick={() =>
                            onFormChange((current) => ({
                              ...current,
                              sourceIds: active
                                ? current.sourceIds.filter((item) => item !== source.id)
                                : [...current.sourceIds, source.id]
                            }))
                          }
                          className={cn(
                            'rounded-full border px-3 py-2 text-sm transition',
                            active
                              ? 'border-[#61efbd]/30 bg-[#61efbd]/12 text-[#ddffe9]'
                              : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                          )}
                        >
                          {source.name}
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-sm text-white/55">当前没有可绑定的查询型信息源。</div>
                  )}
                </div>
                <p className="mt-3 text-xs leading-6 text-white/42">
                  不选择时，系统默认使用所有已启用且支持关键词查询的信息源。
                </p>
              </div>
            </Field>

            <div className="flex flex-wrap gap-3">
              <ActionButton icon={Radar} type="submit">
                {form.id ? '更新并立即扫描' : '创建并立即扫描'}
              </ActionButton>
              <SecondaryActionButton
                icon={Workflow}
                type="button"
                onClick={() => onFormChange(INITIAL_WATCHER)}
              >
                清空表单
              </SecondaryActionButton>
            </div>
          </form>
        </Panel>

        <Panel>
          <FormTitle
            title="任务列表"
            hint="每页展示 10 条。点“查看结果”会直接跳到热点流，并锁定到该任务。"
          />
          <div className="space-y-4">
            {page.total ? (
              page.items.map((watcher) => (
                <WatcherCard
                  key={watcher.id}
                  active={watcher.id === activeWatcherId}
                  sourceSummary={formatWatcherSources(watcher, sourceById)}
                  watcher={watcher}
                  onDelete={() => onDelete(watcher.id)}
                  onEdit={() => onEdit(watcher)}
                  onFocus={() => onFocus(watcher.id)}
                  onToggle={() => onToggle(watcher)}
                />
              ))
            ) : (
              <EmptyState
                title="还没有监控任务"
                description="先创建一个任务，系统才会围绕你的关键词去抓取和核验热点。"
              />
            )}
          </div>
          <Pagination meta={{ ...page, pageSize: PAGE_SIZE }} onChange={onPageChange} />
        </Panel>
      </div>
    </PageShell>
  );
}

function SourcesPage({ form, page, onDelete, onEdit, onFormChange, onPageChange, onSubmit, onToggle }) {
  return (
    <PageShell
      kicker="Route /sources"
      title="信息源"
      description="这里控制系统到底从哪些地方抓热点。搜索型来源负责速度，RSS 和网页抓取负责补充，X 则用于追踪最新动态。"
    >
      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Panel>
          <FormTitle title="编辑信息源" hint="配置 JSON 会直接用于后端抓取逻辑，保存前请确认字段正确。" />
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="源名称">
                <input
                  className={INPUT_CLASS}
                  value={form.name}
                  onChange={(event) => onFormChange((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Bing Web Search"
                />
              </Field>
              <Field label="源类型">
                <select
                  className={INPUT_CLASS}
                  value={form.type}
                  onChange={(event) => onFormChange((current) => ({ ...current, type: event.target.value }))}
                >
                  <option value="rss">RSS</option>
                  <option value="bing_web">Bing 网页搜索</option>
                  <option value="baidu_web">百度搜索</option>
                  <option value="weibo_hot">微博热搜</option>
                  <option value="webpage">网页抓取</option>
                  <option value="twitterapi_io">twitterapi.io</option>
                </select>
              </Field>
            </div>

            <Field label="配置 JSON">
              <textarea
                className={TEXTAREA_CLASS}
                rows="8"
                value={form.config}
                onChange={(event) => onFormChange((current) => ({ ...current, config: event.target.value }))}
                placeholder='{"queryTemplate":"{query}","limit":8}'
              />
            </Field>

            <p className="text-xs leading-6 text-white/42">{getSourceConfigHint(form.type)}</p>

            <label className="inline-flex items-center gap-3 text-sm text-white/66">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => onFormChange((current) => ({ ...current, enabled: event.target.checked }))}
                className="h-4 w-4 accent-[#59ebc0]"
              />
              启用该信息源
            </label>

            <div className="flex flex-wrap gap-3">
              <ActionButton icon={Search} type="submit">
                {form.id ? '更新信息源' : '创建信息源'}
              </ActionButton>
              <SecondaryActionButton
                icon={Workflow}
                type="button"
                onClick={() => onFormChange(INITIAL_SOURCE)}
              >
                清空表单
              </SecondaryActionButton>
            </div>
          </form>
        </Panel>

        <Panel>
          <FormTitle title="源列表" hint="每页展示 10 条。所有操作都会直接影响后端实际抓取。" />
          <div className="space-y-4">
            {page.total ? (
              page.items.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  onDelete={() => onDelete(source.id)}
                  onEdit={() => onEdit(source)}
                  onToggle={() => onToggle(source)}
                />
              ))
            ) : (
              <EmptyState title="还没有信息源" description="没有信息源就没有热点流。至少保留一个搜索型源常开。" />
            )}
          </div>
          <Pagination meta={{ ...page, pageSize: PAGE_SIZE }} onChange={onPageChange} />
        </Panel>
      </div>
    </PageShell>
  );
}

function NotificationsPage({
  activeWatcher,
  findingById,
  page,
  watcherById,
  onCopyLink,
  onOpenFindingWatcher,
  onPageChange
}) {
  return (
    <PageShell
      kicker="Route /notifications"
      title="通知记录"
      description="浏览器推送和邮件发送结果都在这里。每条通知都能反查到对应热点，方便你确认链路和命中内容是否正常。"
      extra={
        <div className="flex flex-wrap items-center gap-2">
          <ScopeChip active>{activeWatcher ? `${activeWatcher.name} / ${activeWatcher.query}` : '全部任务'}</ScopeChip>
        </div>
      }
    >
      <Panel>
        <div className="space-y-4">
          {page.total ? (
            page.items.map((notification, index) => (
              <NotificationCard
                key={`${notification.id || notification.findingId}-${index}`}
                finding={findingById[notification.findingId]}
                notification={notification}
                watcher={watcherById[findingById[notification.findingId]?.watcherId]}
                onCopyLink={onCopyLink}
                onOpenFindingWatcher={onOpenFindingWatcher}
              />
            ))
          ) : (
            <EmptyState
              title="还没有通知记录"
              description="当热点满足通知条件后，这里会显示浏览器推送和邮件的发送结果。"
            />
          )}
        </div>
        <Pagination meta={{ ...page, pageSize: PAGE_SIZE }} onChange={onPageChange} />
      </Panel>
    </PageShell>
  );
}

function SettingsPage({
  browserPermission,
  envManaged,
  form,
  onFormChange,
  onRequestBrowserPermission,
  onSubmit,
  onTestEmail
}) {
  return (
    <PageShell
      kicker="Route /settings"
      title="运行设置"
      description=".env 继续管理敏感密钥，这里只配置可安全展示的运行参数。保存后会立即写入后端状态。"
    >
      <Panel className="max-w-4xl">
        <FormTitle
          title="运行参数"
          hint="如果某个字段由 .env 接管，页面里的值只用于展示当前生效状态，最终以服务端环境变量为准。"
        />
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="OpenRouter 模型">
              <input
                className={INPUT_CLASS}
                value={form.openRouterModel}
                onChange={(event) =>
                  onFormChange((current) => ({ ...current, openRouterModel: event.target.value }))
                }
                placeholder="openai/gpt-4.1-mini"
              />
              {envManaged.openRouterModel ? <FieldHint text=".env 已接管 OPENROUTER_MODEL" /> : null}
            </Field>

            <Field label="轮询间隔（毫秒）">
              <input
                className={INPUT_CLASS}
                min="1000"
                type="number"
                value={form.pollIntervalMs}
                onChange={(event) =>
                  onFormChange((current) => ({
                    ...current,
                    pollIntervalMs: Number(event.target.value || 60000)
                  }))
                }
              />
            </Field>

            <Field label="SMTP Host">
              <input
                className={INPUT_CLASS}
                value={form.smtpHost}
                onChange={(event) => onFormChange((current) => ({ ...current, smtpHost: event.target.value }))}
                placeholder="smtp.example.com"
              />
              {envManaged.smtpHost ? <FieldHint text=".env 已接管 SMTP_HOST" /> : null}
            </Field>

            <Field label="SMTP Port">
              <input
                className={INPUT_CLASS}
                type="number"
                value={form.smtpPort}
                onChange={(event) =>
                  onFormChange((current) => ({ ...current, smtpPort: Number(event.target.value || 587) }))
                }
              />
              {envManaged.smtpPort ? <FieldHint text=".env 已接管 SMTP_PORT" /> : null}
            </Field>

            <Field label="发件人">
              <input
                className={INPUT_CLASS}
                value={form.emailFrom}
                onChange={(event) => onFormChange((current) => ({ ...current, emailFrom: event.target.value }))}
                placeholder={'AI Hot Monitor <bot@example.com>'}
              />
              {envManaged.emailFrom ? <FieldHint text=".env 已接管 EMAIL_FROM" /> : null}
            </Field>

            <Field label="收件人">
              <input
                className={INPUT_CLASS}
                value={form.emailTo}
                onChange={(event) => onFormChange((current) => ({ ...current, emailTo: event.target.value }))}
                placeholder="you@example.com"
              />
              {envManaged.emailTo ? <FieldHint text=".env 已接管 EMAIL_TO" /> : null}
            </Field>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-white/65">
            <label className="inline-flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.smtpSecure}
                onChange={(event) => onFormChange((current) => ({ ...current, smtpSecure: event.target.checked }))}
                className="h-4 w-4 accent-[#59ebc0]"
              />
              SMTP 使用 TLS
            </label>

            <label className="inline-flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.browserNotificationsEnabled}
                onChange={(event) =>
                  onFormChange((current) => ({
                    ...current,
                    browserNotificationsEnabled: event.target.checked
                  }))
                }
                className="h-4 w-4 accent-[#59ebc0]"
              />
              开启浏览器原生通知
            </label>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-white/62">
            浏览器通知权限状态: <span className="text-white">{formatBrowserPermission(browserPermission)}</span>
          </div>

          <div className="flex flex-wrap gap-3">
            <ActionButton icon={Settings2} type="submit">
              保存设置
            </ActionButton>
            <SecondaryActionButton icon={Bell} type="button" onClick={onRequestBrowserPermission}>
              申请浏览器通知权限
            </SecondaryActionButton>
            <SecondaryActionButton icon={MailCheck} type="button" onClick={onTestEmail}>
              验证邮件配置
            </SecondaryActionButton>
          </div>
        </form>
      </Panel>
    </PageShell>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="mb-2 text-sm text-white/56">{label}</div>
      {children}
    </label>
  );
}

function FieldHint({ text }) {
  return <div className="mt-2 text-xs text-white/38">{text}</div>;
}

function FormTitle({ title, hint }) {
  return (
    <div className="mb-5">
      <h3 className="text-xl font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/52">{hint}</p>
    </div>
  );
}

function WatcherCard({ active, sourceSummary, watcher, onDelete, onEdit, onFocus, onToggle }) {
  return (
    <div
      className={cn(
        'rounded-[24px] border p-4 transition',
        active
          ? 'border-[#59ebc0]/28 bg-[linear-gradient(180deg,rgba(89,235,192,0.12),rgba(255,255,255,0.03))]'
          : 'border-white/8 bg-white/[0.03] hover:border-white/14'
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-medium text-white">{watcher.name}</h4>
            <StatusPill active={watcher.enabled}>{watcher.enabled ? '运行中' : '已停用'}</StatusPill>
          </div>
          <div className="text-sm text-[#cafedc]">{watcher.query}</div>
          <p className="line-clamp-2 max-w-2xl text-sm leading-6 text-white/50">
            {watcher.scope || '未设置范围说明'}
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-white/40">
            <span>执行间隔 {watcher.intervalMinutes} 分钟</span>
            <span>通知 {formatChannels(watcher.notificationChannels)}</span>
            <span>信息源 {sourceSummary}</span>
            <span>最近运行 {formatDate(watcher.lastRunAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <GhostButton onClick={onFocus}>{active ? '当前结果' : '查看结果'}</GhostButton>
          <GhostButton onClick={onEdit}>编辑</GhostButton>
          <GhostButton onClick={onToggle}>{watcher.enabled ? '停用' : '启用'}</GhostButton>
          <GhostButton danger onClick={onDelete}>
            删除
          </GhostButton>
        </div>
      </div>
    </div>
  );
}

function SourceCard({ source, onDelete, onEdit, onToggle }) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 transition hover:border-white/14">
      <div className="flex flex-col gap-4 md:flex-row md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-medium text-white">{source.name}</h4>
            <StatusPill>{formatSourceType(source.type)}</StatusPill>
            <StatusPill active={source.enabled}>{source.enabled ? '启用中' : '已停用'}</StatusPill>
          </div>
          <p className="line-clamp-2 max-w-2xl text-sm leading-6 text-white/50">
            {summarizeSourceConfig(source.config)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <GhostButton onClick={onEdit}>编辑</GhostButton>
          <GhostButton onClick={onToggle}>{source.enabled ? '停用' : '启用'}</GhostButton>
          <GhostButton danger onClick={onDelete}>
            删除
          </GhostButton>
        </div>
      </div>
    </div>
  );
}

function FindingCard({ finding, watcher, onCopyLink }) {
  return (
    <div className="group relative overflow-hidden rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5 transition hover:border-[#5cedc3]/22">
      <div className="absolute inset-y-5 left-0 w-px bg-[linear-gradient(180deg,transparent,rgba(89,235,192,0.65),transparent)]" />
      <div className="pl-3">
        <div className="mb-3 flex flex-wrap gap-2 text-xs text-white/42">
          <span>{finding.sourceName}</span>
          <span>热度 {finding.aiDecision?.heatScore ?? '--'}</span>
          <span>{formatCredibility(finding.aiDecision?.credibility)}</span>
          <span>{formatDate(finding.detectedAt || finding.publishedAt)}</span>
        </div>

        <h3 className="text-xl font-medium leading-8 text-white">{finding.title}</h3>

        <p className="mt-3 line-clamp-3 text-sm leading-7 text-white/56">
          {finding.aiDecision?.summary || finding.snippet || '暂无摘要'}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/40">
          <ScopeChip>{watcher?.name || '未知任务'}</ScopeChip>
          {finding.author ? <ScopeChip>{finding.author}</ScopeChip> : null}
          {finding.aiDecision?.isOfficial ? <ScopeChip active>官方信号</ScopeChip> : null}
          {finding.aiDecision?.suspectedImpersonation ? <ScopeChip>疑似冒充</ScopeChip> : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href={finding.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-[#5cedc3]/18 bg-[#5cedc3]/10 px-4 py-2 text-sm text-[#ddffe9] transition hover:bg-[#5cedc3]/14"
          >
            <ExternalLink className="h-4 w-4" />
            打开原文
          </a>
          <GhostButton onClick={() => onCopyLink(finding.url)}>
            <Copy className="mr-1 inline h-4 w-4" />
            复制链接
          </GhostButton>
        </div>
      </div>
    </div>
  );
}

function NotificationCard({ finding, notification, watcher, onCopyLink, onOpenFindingWatcher }) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
      <div className="mb-2 flex flex-wrap gap-2 text-xs text-white/42">
        <span>{formatNotificationChannel(notification.channel)}</span>
        <span>{formatNotificationStatus(notification.status)}</span>
        <span>{formatDate(notification.sentAt || notification.createdAt)}</span>
      </div>

      <div className="text-base font-medium text-white">
        {finding?.title || notification.findingId || '未知热点'}
      </div>

      <div className="mt-2 text-sm text-white/52">
        {notification.errorMessage || '发送成功'}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/40">
        {watcher ? <ScopeChip>{watcher.name}</ScopeChip> : null}
        {finding?.sourceName ? <ScopeChip>{finding.sourceName}</ScopeChip> : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {finding?.url ? (
          <a
            href={finding.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm text-white/78 transition hover:bg-white/10"
          >
            <ExternalLink className="h-4 w-4" />
            打开热点
          </a>
        ) : null}
        {finding?.url ? (
          <GhostButton onClick={() => onCopyLink(finding.url)}>
            <Copy className="mr-1 inline h-4 w-4" />
            复制链接
          </GhostButton>
        ) : null}
        {watcher ? (
          <GhostButton onClick={() => onOpenFindingWatcher(watcher.id)}>查看所属任务</GhostButton>
        ) : null}
      </div>
    </div>
  );
}

function ScopeChip({ active = false, children }) {
  return (
    <span
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs',
        active
          ? 'border-[#61efbd]/20 bg-[#61efbd]/10 text-[#ddffe9]'
          : 'border-white/10 bg-white/[0.04] text-white/62'
      )}
    >
      {children}
    </span>
  );
}

function InfoChip({ label, value }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70">
      {label}: <span className="text-white">{value}</span>
    </div>
  );
}

function StatusPill({ active = false, children }) {
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-1 text-xs',
        active
          ? 'border-[#63efbd]/20 bg-[#63efbd]/10 text-[#dcffe9]'
          : 'border-white/10 bg-white/[0.04] text-white/46'
      )}
    >
      {children}
    </span>
  );
}

function FilterButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-4 py-2 text-sm transition',
        active
          ? 'bg-[linear-gradient(135deg,#4fe8bf,#d6ff54)] text-[#08110d]'
          : 'border border-white/10 bg-white/5 text-white/72 hover:bg-white/10 hover:text-white'
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.025] px-5 py-6">
      <div className="text-lg font-medium text-white">{title}</div>
      <div className="mt-2 max-w-2xl text-sm leading-7 text-white/48">{description}</div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <Panel className="min-h-[320px]">
      <div className="flex min-h-[280px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-[#59ebc0]" />
          <div className="text-base text-white/70">正在同步热点状态...</div>
        </div>
      </div>
    </Panel>
  );
}

function ActionButton({ children, className, icon: Icon, ...props }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#4fe8bf,#d6ff54)] px-5 py-3 text-sm font-semibold text-[#09120d] shadow-[0_14px_35px_rgba(80,232,191,0.2)] transition hover:translate-y-[-1px]',
        className
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function SecondaryActionButton({ children, className, icon: Icon, ...props }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-medium text-white/82 transition hover:bg-white/[0.08]',
        className
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function GhostButton({ children, className, danger = false, ...props }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center rounded-full border px-3.5 py-2 text-sm transition',
        danger
          ? 'border-rose-400/18 bg-rose-400/6 text-rose-200 hover:bg-rose-400/10'
          : 'border-white/10 bg-white/5 text-white/76 hover:bg-white/10',
        className
      )}
    >
      {children}
    </button>
  );
}

function getRouteSection(pathname) {
  if (pathname.startsWith('/watchers')) {
    return 'watchers';
  }
  if (pathname.startsWith('/sources')) {
    return 'sources';
  }
  if (pathname.startsWith('/notifications')) {
    return 'notifications';
  }
  if (pathname.startsWith('/settings')) {
    return 'settings';
  }
  return 'findings';
}

function getSearchPlaceholder(section) {
  if (section === 'watchers') {
    return '搜索任务名、关键词、范围说明';
  }
  if (section === 'sources') {
    return '搜索源名称、类型、配置';
  }
  if (section === 'notifications') {
    return '搜索通知状态、渠道、热点标题';
  }
  if (section === 'settings') {
    return '设置页不提供搜索';
  }
  return '搜索标题、摘要、来源、作者';
}

function watcherToForm(watcher) {
  return {
    id: watcher.id,
    name: watcher.name || '',
    query: watcher.query || '',
    scope: watcher.scope || '',
    intervalMinutes: Number(watcher.intervalMinutes || 15),
    notificationChannels: Array.isArray(watcher.notificationChannels)
      ? watcher.notificationChannels
      : ['browser'],
    sourceIds: Array.isArray(watcher.sourceIds) ? watcher.sourceIds : []
  };
}

function sourceToForm(source) {
  return {
    id: source.id,
    name: source.name || '',
    type: source.type || 'rss',
    enabled: source.enabled !== false,
    config: JSON.stringify(source.config || {}, null, 2)
  };
}

function maybeBrowserNotify(payload, settings) {
  if (!settings?.browserNotificationsEnabled) {
    return;
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const notification = new Notification(payload.finding.title, {
    body: payload.finding.aiDecision?.summary || payload.finding.snippet || '',
    tag: payload.finding.id
  });

  notification.onclick = () => {
    if (payload.finding.url) {
      window.open(payload.finding.url, '_blank', 'noopener,noreferrer');
    }
  };
}

function isQueryCapableSource(source) {
  if (['bing_web', 'baidu_web', 'twitterapi_io'].includes(source.type)) {
    return true;
  }

  if (source.type === 'rss') {
    return Boolean(
      source.config?.queryTemplate || String(source.config?.feedUrl || '').includes('{query}')
    );
  }

  if (source.type === 'webpage') {
    return Boolean(source.config?.queryTemplate);
  }

  return false;
}

function formatFindingFilter(filter) {
  if (filter === 'today') {
    return '今日新增';
  }
  if (filter === 'urgent') {
    return '高优先级';
  }
  return '全部热点';
}

function formatChannels(channels = []) {
  if (!channels.length) {
    return '未配置';
  }

  return channels
    .map((channel) => (channel === 'browser' ? '浏览器' : channel === 'email' ? '邮件' : channel))
    .join(' / ');
}

function formatWatcherSources(watcher, sourceById) {
  if (!watcher.sourceIds?.length) {
    return '默认全部查询源';
  }

  return watcher.sourceIds.map((id) => sourceById[id]?.name || id).join('、');
}

function formatSourceType(type) {
  if (type === 'bing_web') {
    return 'Bing 搜索';
  }
  if (type === 'baidu_web') {
    return '百度搜索';
  }
  if (type === 'weibo_hot') {
    return '微博热搜';
  }
  if (type === 'webpage') {
    return '网页抓取';
  }
  if (type === 'twitterapi_io') {
    return 'X API';
  }
  return type === 'rss' ? 'RSS' : type;
}

function formatNotificationChannel(channel) {
  if (channel === 'browser') {
    return '浏览器推送';
  }
  if (channel === 'email') {
    return '邮件通知';
  }
  return channel || '通知';
}

function formatNotificationStatus(status) {
  if (status === 'sent') {
    return '发送成功';
  }
  if (status === 'failed') {
    return '发送失败';
  }
  return status || '未知状态';
}

function formatCredibility(credibility) {
  if (credibility === 'high') {
    return '可信度高';
  }
  if (credibility === 'medium') {
    return '可信度中';
  }
  if (credibility === 'low') {
    return '可信度低';
  }
  return '可信度未知';
}

function formatBrowserPermission(permission) {
  if (permission === 'granted') {
    return '已授权';
  }
  if (permission === 'denied') {
    return '已拒绝';
  }
  if (permission === 'default') {
    return '未选择';
  }
  return '当前浏览器不支持';
}

function getSourceConfigHint(type) {
  if (type === 'rss') {
    return 'RSS 建议填写 feedUrl，也可以用 queryTemplate 组合成按关键词查询的 RSS 地址。';
  }
  if (type === 'bing_web' || type === 'baidu_web') {
    return '搜索型源通常只需要 queryTemplate 和 limit，例如 {"queryTemplate":"{query}","limit":8}。';
  }
  if (type === 'weibo_hot') {
    return '微博热搜可只设置 limit，例如 {"limit":15}。';
  }
  if (type === 'webpage') {
    return '网页抓取可配置 urls，或配置 queryTemplate 让后端按关键词拼接抓取地址。';
  }
  if (type === 'twitterapi_io') {
    return 'twitterapi.io 通常配置 mode、queryTemplate 和 queryType，密钥仍然从 .env 读取。';
  }
  return '请根据后端抓取器要求填写配置 JSON。';
}

const INPUT_CLASS =
  'h-12 w-full rounded-2xl border border-white/8 bg-white/[0.03] px-4 text-white outline-none transition placeholder:text-white/24 focus:border-[#60ebc3]/28 focus:bg-white/[0.045]';

const TEXTAREA_CLASS =
  'w-full rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-white outline-none transition placeholder:text-white/24 focus:border-[#60ebc3]/28 focus:bg-white/[0.045]';

export default App;
