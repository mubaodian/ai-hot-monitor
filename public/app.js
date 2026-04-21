const ROUTES = new Set(['/findings', '/watchers', '/sources', '/notifications', '/settings']);
const PAGE_SIZE = 10;

const state = {
  data: null,
  activeWatcherId: null,
  currentRoute: normalizeRoute(window.location.pathname),
  pages: {
    watchers: 1,
    sources: 1,
    findings: 1,
    notifications: 1
  }
};

const els = {
  settingsForm: document.querySelector('#settings-form'),
  watcherForm: document.querySelector('#watcher-form'),
  sourceForm: document.querySelector('#source-form'),
  runNow: document.querySelector('#run-now'),
  testEmail: document.querySelector('#test-email'),
  watchersList: document.querySelector('#watchers-list'),
  watchersPagination: document.querySelector('#watchers-pagination'),
  sourcesList: document.querySelector('#sources-list'),
  sourcesPagination: document.querySelector('#sources-pagination'),
  findingsList: document.querySelector('#findings-list'),
  findingsPagination: document.querySelector('#findings-pagination'),
  notificationsList: document.querySelector('#notifications-list'),
  notificationsPagination: document.querySelector('#notifications-pagination'),
  watcherKpi: document.querySelector('#kpi-watchers'),
  sourceKpi: document.querySelector('#kpi-sources'),
  findingsKpi: document.querySelector('#kpi-findings'),
  activeWatcherBadge: document.querySelector('#active-watcher-badge'),
  routeLinks: [...document.querySelectorAll('.module-nav-link')],
  routePages: [...document.querySelectorAll('.route-page')]
};

function normalizeRoute(pathname = '/') {
  const cleaned = pathname === '/' ? '/findings' : pathname.replace(/\/+$/, '') || '/findings';
  return ROUTES.has(cleaned) ? cleaned : '/findings';
}

function navigateTo(route, { replace = false } = {}) {
  const nextRoute = normalizeRoute(route);
  if (nextRoute !== window.location.pathname) {
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({}, '', nextRoute);
  }
  state.currentRoute = nextRoute;
  renderRoute();
}

function selectedOptions(select) {
  return [...select.selectedOptions].map((option) => option.value);
}

function formatDate(value) {
  if (!value) {
    return '未知时间';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未知时间';
  }

  return date.toLocaleString();
}

function fillForm(form, values) {
  for (const [key, value] of Object.entries(values)) {
    const field = form.elements.namedItem(key);
    if (!field) {
      continue;
    }

    if (field.type === 'checkbox') {
      field.checked = Boolean(value);
      continue;
    }

    if (field.multiple) {
      [...field.options].forEach((option) => {
        option.selected = Array.isArray(value) && value.includes(option.value);
      });
      continue;
    }

    if (field.type === 'password' && String(value || '').includes('***')) {
      field.value = '';
      continue;
    }

    field.value = value ?? '';
  }
}

function emptyState(text) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.textContent = text;
  return div;
}

function resolveActiveWatcher(data) {
  if (!data.watchers.length) {
    state.activeWatcherId = null;
    return null;
  }

  const current = data.watchers.find((watcher) => watcher.id === state.activeWatcherId);
  if (current) {
    return current;
  }

  const latest = [...data.watchers].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )[0];
  state.activeWatcherId = latest.id;
  return latest;
}

function summarizeSource(source) {
  const config = source.config || {};
  const parts = [];

  if (config.queryTemplate) parts.push(`查询模板: ${config.queryTemplate}`);
  if (config.feedUrl) parts.push(`RSS: ${config.feedUrl}`);
  if (Array.isArray(config.urls) && config.urls.length) parts.push(`网页: ${config.urls.length} 个`);
  if (config.queryType) parts.push(`模式: ${config.queryType}`);
  if (config.limit !== undefined) parts.push(`上限: ${config.limit}`);

  return parts.length ? parts.join(' / ') : '未配置额外参数';
}

function createFeedCard() {
  return document
    .querySelector('#feed-card-template')
    .content.firstElementChild.cloneNode(true);
}

function findingCard(finding) {
  const node = createFeedCard();
  node.querySelector('.feed-meta').textContent = [
    finding.sourceName,
    `热度 ${finding.aiDecision?.heatScore ?? '--'}`,
    finding.aiDecision?.credibility || 'unknown',
    formatDate(finding.detectedAt)
  ].join(' / ');
  node.querySelector('h3').textContent = finding.title;
  node.querySelector('.feed-summary').textContent =
    finding.aiDecision?.summary || finding.snippet || '暂无摘要';
  node.querySelector('.feed-link').href = finding.url;
  return node;
}

function notificationCard(item) {
  const node = createFeedCard();
  node.querySelector('.feed-meta').textContent = [
    item.channel || 'notification',
    item.status || 'unknown',
    formatDate(item.sentAt || item.createdAt)
  ].join(' / ');
  node.querySelector('h3').textContent = item.message || item.findingId || '通知记录';
  node.querySelector('.feed-summary').textContent = item.errorMessage || '发送成功';
  node.querySelector('.feed-link').remove();
  return node;
}

function clampPage(key, totalItems) {
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  state.pages[key] = Math.min(Math.max(state.pages[key] || 1, 1), totalPages);
  return totalPages;
}

function getPageItems(key, items) {
  const totalPages = clampPage(key, items.length);
  const page = state.pages[key];
  const start = (page - 1) * PAGE_SIZE;
  return {
    items: items.slice(start, start + PAGE_SIZE),
    page,
    totalPages,
    totalItems: items.length,
    start: items.length ? start + 1 : 0,
    end: Math.min(start + PAGE_SIZE, items.length)
  };
}

function renderPagination(container, key, meta) {
  container.innerHTML = '';

  if (meta.totalItems <= PAGE_SIZE) {
    return;
  }

  const summary = document.createElement('div');
  summary.className = 'pagination-summary';
  summary.textContent = `第 ${meta.start}-${meta.end} 条，共 ${meta.totalItems} 条`;

  const controls = document.createElement('div');
  controls.className = 'pagination-controls';

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'ghost-button';
  prev.textContent = '上一页';
  prev.disabled = meta.page === 1;
  prev.addEventListener('click', () => {
    state.pages[key] = Math.max(1, meta.page - 1);
    renderAll(state.data);
  });

  const current = document.createElement('span');
  current.className = 'pagination-current';
  current.textContent = `${meta.page} / ${meta.totalPages}`;

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'ghost-button';
  next.textContent = '下一页';
  next.disabled = meta.page === meta.totalPages;
  next.addEventListener('click', () => {
    state.pages[key] = Math.min(meta.totalPages, meta.page + 1);
    renderAll(state.data);
  });

  controls.append(prev, current, next);
  container.append(summary, controls);
}

function renderCollection(target, paginationTarget, key, items, builder, emptyText) {
  target.innerHTML = '';
  paginationTarget.innerHTML = '';

  if (!items.length) {
    target.append(emptyState(emptyText));
    return;
  }

  const meta = getPageItems(key, items);
  for (const item of meta.items) {
    target.append(builder(item));
  }

  renderPagination(paginationTarget, key, meta);
}

function watcherCard(watcher) {
  const focused = watcher.id === state.activeWatcherId;
  const item = document.createElement('div');
  item.className = `watcher-chip${focused ? ' watcher-chip-active' : ''}`;
  item.innerHTML = `
    <div class="watcher-copy">
      <strong>${watcher.name}</strong>
      <p>${watcher.query}</p>
      <p>${watcher.scope || '未设置范围说明'}</p>
    </div>
    <div class="watcher-actions">
      <button class="ghost-button" data-action="focus" type="button">${focused ? '当前查看中' : '查看结果'}</button>
      <button class="ghost-button" data-action="run" type="button">立即查询</button>
      <button class="ghost-button" data-action="edit" type="button">编辑</button>
      <button class="ghost-button" data-action="toggle" type="button">${watcher.enabled ? '停用' : '启用'}</button>
      <button class="ghost-button danger" data-action="delete" type="button">删除</button>
    </div>
  `;

  item.querySelector('[data-action="focus"]').addEventListener('click', () => {
    state.activeWatcherId = watcher.id;
    renderAll(state.data);
    navigateTo('/findings');
  });

  item.querySelector('[data-action="run"]').addEventListener('click', async () => {
    await handleAction('运行监控任务失败', () => runWatcherNow(watcher.id));
  });

  item.querySelector('[data-action="edit"]').addEventListener('click', () => {
    fillForm(els.watcherForm, watcher);
    state.activeWatcherId = watcher.id;
    navigateTo('/watchers');
  });

  item.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
    await handleAction('更新监控任务失败', async () => {
      await requestJson(`/api/watchers/${watcher.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !watcher.enabled })
      });
      await loadState();
    });
  });

  item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    await handleAction('删除监控任务失败', async () => {
      await requestJson(`/api/watchers/${watcher.id}`, { method: 'DELETE' });
      if (state.activeWatcherId === watcher.id) {
        state.activeWatcherId = null;
      }
      await loadState();
    });
  });

  return item;
}

function sourceCard(source) {
  const item = document.createElement('div');
  item.className = 'source-card';
  item.innerHTML = `
    <div class="feed-meta">${source.type} / ${source.enabled ? 'enabled' : 'disabled'}</div>
    <h3>${source.name}</h3>
    <p class="feed-summary">${summarizeSource(source)}</p>
    <div class="source-actions">
      <button class="ghost-button" data-action="edit" type="button">编辑</button>
      <button class="ghost-button" data-action="toggle" type="button">${source.enabled ? '停用' : '启用'}</button>
      <button class="ghost-button danger" data-action="delete" type="button">删除</button>
    </div>
  `;

  item.querySelector('[data-action="edit"]').addEventListener('click', () => {
    fillForm(els.sourceForm, {
      id: source.id,
      name: source.name,
      type: source.type,
      enabled: source.enabled,
      config: JSON.stringify(source.config, null, 2)
    });
    navigateTo('/sources');
  });

  item.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
    await handleAction('更新信息源失败', async () => {
      await requestJson(`/api/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !source.enabled })
      });
      await loadState();
    });
  });

  item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    await handleAction('删除信息源失败', async () => {
      await requestJson(`/api/sources/${source.id}`, { method: 'DELETE' });
      await loadState();
    });
  });

  return item;
}

async function runWatcherNow(watcherId) {
  await requestJson(`/api/watchers/${watcherId}/run`, {
    method: 'POST'
  });
  state.activeWatcherId = watcherId;
  state.pages.findings = 1;
  state.pages.notifications = 1;
  await loadState();
  navigateTo('/findings');
}

function renderAll(data) {
  state.data = data;
  const activeWatcher = resolveActiveWatcher(data);
  const watcherFindings = activeWatcher
    ? data.findings
        .filter((finding) => finding.watcherId === activeWatcher.id)
        .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
    : [];
  const relevantFindings = watcherFindings.filter((finding) => finding.aiDecision?.relevant !== false);
  const displayedFindings = relevantFindings.length ? relevantFindings : watcherFindings;
  const visibleFindingIds = new Set(displayedFindings.map((finding) => finding.id));
  const watcherNotifications = activeWatcher
    ? data.notifications.filter((notification) => visibleFindingIds.has(notification.findingId))
    : [];

  els.watcherKpi.textContent = String(data.watchers.length);
  els.sourceKpi.textContent = String(data.sources.filter((source) => source.enabled).length);
  els.findingsKpi.textContent = String(displayedFindings.length);
  els.activeWatcherBadge.textContent = activeWatcher
    ? `当前任务：${activeWatcher.name} / ${activeWatcher.query}`
    : '当前任务：未选择';

  renderCollection(
    els.watchersList,
    els.watchersPagination,
    'watchers',
    data.watchers,
    watcherCard,
    '还没有监控任务。'
  );
  renderCollection(
    els.sourcesList,
    els.sourcesPagination,
    'sources',
    data.sources,
    sourceCard,
    '还没有信息源。'
  );
  renderCollection(
    els.findingsList,
    els.findingsPagination,
    'findings',
    displayedFindings,
    findingCard,
    activeWatcher ? `关键词“${activeWatcher.query}”当前还没有新的结果。` : '请先创建一个监控任务。'
  );
  renderCollection(
    els.notificationsList,
    els.notificationsPagination,
    'notifications',
    watcherNotifications,
    notificationCard,
    '当前任务还没有通知记录。'
  );

  fillForm(els.settingsForm, data.settings);
  renderRoute();
}

function renderRoute() {
  els.routeLinks.forEach((link) => {
    link.classList.toggle('is-active', link.dataset.route === state.currentRoute);
  });

  els.routePages.forEach((page) => {
    const visible = page.dataset.route === state.currentRoute;
    page.classList.toggle('is-visible', visible);
    page.setAttribute('aria-hidden', String(!visible));
  });
}

function connectRoutes() {
  els.routeLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      navigateTo(link.dataset.route);
    });
  });

  window.addEventListener('popstate', () => {
    state.currentRoute = normalizeRoute(window.location.pathname);
    renderRoute();
  });

  if (window.location.pathname !== state.currentRoute) {
    navigateTo(state.currentRoute, { replace: true });
  } else {
    renderRoute();
  }
}

async function loadState() {
  const response = await fetch('/api/state');
  const data = await response.json();
  renderAll(data);
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

async function handleAction(message, action) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    alert(`${message}: ${error.message}`);
  }
}

els.settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await handleAction('保存设置失败', async () => {
    const form = new FormData(els.settingsForm);
    const payload = {
      openRouterModel: form.get('openRouterModel'),
      pollIntervalMs: Number(form.get('pollIntervalMs') || 60000),
      smtpHost: form.get('smtpHost'),
      smtpPort: Number(form.get('smtpPort') || 587),
      smtpSecure: form.get('smtpSecure') === 'on',
      emailFrom: form.get('emailFrom'),
      emailTo: form.get('emailTo'),
      browserNotificationsEnabled: form.get('browserNotificationsEnabled') === 'on'
    };

    await requestJson('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await loadState();
  });
});

els.watcherForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await handleAction('保存监控任务失败', async () => {
    const form = new FormData(els.watcherForm);
    const payload = {
      name: form.get('name'),
      query: form.get('query'),
      scope: form.get('scope'),
      intervalMinutes: Number(form.get('intervalMinutes') || 15),
      notificationChannels: selectedOptions(els.watcherForm.elements.namedItem('notificationChannels'))
    };
    const id = form.get('id');
    let watcherId = id;

    if (id) {
      const response = await requestJson(`/api/watchers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      watcherId = response.watcher.id;
    } else {
      const response = await requestJson('/api/watchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      watcherId = response.watcher.id;
    }

    els.watcherForm.reset();
    state.pages.watchers = 1;
    if (watcherId) {
      await runWatcherNow(watcherId);
    } else {
      await loadState();
    }
  });
});

els.sourceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await handleAction('保存信息源失败', async () => {
    const form = new FormData(els.sourceForm);
    const rawConfig = form.get('config');
    const payload = {
      name: form.get('name'),
      type: form.get('type'),
      enabled: form.get('enabled') === 'on',
      config: rawConfig ? JSON.parse(rawConfig) : {}
    };
    const id = form.get('id');

    if (id) {
      await requestJson(`/api/sources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      await requestJson('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    els.sourceForm.reset();
    state.pages.sources = 1;
    await loadState();
  });
});

els.runNow.addEventListener('click', async () => {
  await handleAction('执行全量巡检失败', async () => {
    state.pages.findings = 1;
    state.pages.notifications = 1;
    await requestJson('/api/run-now', { method: 'POST' });
    await loadState();
    navigateTo('/findings');
  });
});

els.testEmail.addEventListener('click', async () => {
  await handleAction('验证邮件失败', async () => {
    await requestJson('/api/test-email', { method: 'POST' });
    alert('SMTP 验证通过。');
  });
});

function maybeBrowserNotify(payload) {
  if (!state.data?.settings?.browserNotificationsEnabled) {
    return;
  }

  if (!('Notification' in window)) {
    return;
  }

  if (Notification.permission === 'default') {
    Notification.requestPermission();
    return;
  }

  if (Notification.permission === 'granted') {
    new Notification(payload.finding.title, {
      body: payload.finding.aiDecision?.summary || payload.finding.snippet || '',
      tag: payload.finding.id
    });
  }
}

function connectEvents() {
  const stream = new EventSource('/api/events');
  stream.addEventListener('state', async () => {
    await loadState();
  });
  stream.addEventListener('finding', async (event) => {
    const payload = JSON.parse(event.data);
    state.activeWatcherId = payload.watcher?.id || state.activeWatcherId;
    state.pages.findings = 1;
    state.pages.notifications = 1;
    maybeBrowserNotify(payload);
    await loadState();
  });
}

connectRoutes();
await loadState();
connectEvents();
