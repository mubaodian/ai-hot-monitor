const state = {
  data: null,
  activeWatcherId: null
};

const els = {
  settingsForm: document.querySelector('#settings-form'),
  watcherForm: document.querySelector('#watcher-form'),
  sourceForm: document.querySelector('#source-form'),
  runNow: document.querySelector('#run-now'),
  testEmail: document.querySelector('#test-email'),
  watchersList: document.querySelector('#watchers-list'),
  sourcesList: document.querySelector('#sources-list'),
  findingsList: document.querySelector('#findings-list'),
  notificationsList: document.querySelector('#notifications-list'),
  activityList: document.querySelector('#activity-list'),
  watcherKpi: document.querySelector('#kpi-watchers'),
  sourceKpi: document.querySelector('#kpi-sources'),
  findingsKpi: document.querySelector('#kpi-findings')
};

function selectedOptions(select) {
  return [...select.selectedOptions].map((option) => option.value);
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

function renderWatchers(watchers = []) {
  els.watchersList.innerHTML = '';
  if (!watchers.length) {
    els.watchersList.append(emptyState('还没有监控任务。'));
    return;
  }

  for (const watcher of watchers) {
    const item = document.createElement('div');
    item.className = 'watcher-chip';
    item.innerHTML = `
      <div>
        <strong>${watcher.name}</strong>
        <p>${watcher.query}</p>
        <p>${watcher.scope || '未设置范围说明'}</p>
      </div>
      <div class="watcher-actions">
        <button class="ghost-button" data-action="run">立即查询</button>
        <button class="ghost-button" data-action="edit">编辑</button>
        <button class="ghost-button" data-action="toggle">${watcher.enabled ? '停用' : '启用'}</button>
        <button class="ghost-button danger" data-action="delete">删除</button>
      </div>
    `;

    item.querySelector('[data-action="run"]').addEventListener('click', async () => {
      await runWatcherNow(watcher.id);
    });

    item.querySelector('[data-action="edit"]').addEventListener('click', () => {
      fillForm(els.watcherForm, watcher);
      state.activeWatcherId = watcher.id;
    });

    item.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
      await fetch(`/api/watchers/${watcher.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !watcher.enabled })
      });
      await loadState();
    });

    item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      await fetch(`/api/watchers/${watcher.id}`, { method: 'DELETE' });
      await loadState();
    });

    els.watchersList.append(item);
  }
}

async function runWatcherNow(watcherId) {
  await requestJson(`/api/watchers/${watcherId}/run`, {
    method: 'POST'
  });
  state.activeWatcherId = watcherId;
  await loadState();
}

function renderSources(sources = []) {
  els.sourcesList.innerHTML = '';
  if (!sources.length) {
    els.sourcesList.append(emptyState('还没有信息源。'));
    return;
  }

  for (const source of sources) {
    const item = document.createElement('div');
    item.className = 'source-card';
    item.innerHTML = `
      <div class="feed-meta">${source.type} · ${source.enabled ? 'enabled' : 'disabled'}</div>
      <h3>${source.name}</h3>
      <p class="feed-summary">${JSON.stringify(source.config)}</p>
      <div class="source-actions">
        <button class="ghost-button" data-action="edit">编辑</button>
        <button class="ghost-button" data-action="toggle">${source.enabled ? '停用' : '启用'}</button>
        <button class="ghost-button danger" data-action="delete">删除</button>
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
    });

    item.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
      await fetch(`/api/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !source.enabled })
      });
      await loadState();
    });

    item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      await fetch(`/api/sources/${source.id}`, { method: 'DELETE' });
      await loadState();
    });

    els.sourcesList.append(item);
  }
}

function renderFeed(target, items, builder, emptyText) {
  target.innerHTML = '';
  if (!items.length) {
    target.append(emptyState(emptyText));
    return;
  }

  for (const item of items) {
    target.append(builder(item));
  }
}

function findingCard(finding) {
  const node = document.querySelector('#feed-card-template').content.firstElementChild.cloneNode(true);
  node.querySelector('.feed-meta').textContent = [
    finding.sourceName,
    `热度 ${finding.aiDecision?.heatScore ?? '--'}`,
    finding.aiDecision?.credibility || 'unknown',
    new Date(finding.detectedAt).toLocaleString()
  ].join(' · ');
  node.querySelector('h3').textContent = finding.title;
  node.querySelector('.feed-summary').textContent =
    finding.aiDecision?.summary || finding.snippet || '暂无摘要';
  node.querySelector('.feed-link').href = finding.url;
  return node;
}

function simpleCard(item) {
  const node = document.querySelector('#feed-card-template').content.firstElementChild.cloneNode(true);
  node.querySelector('.feed-meta').textContent = `${item.channel || item.type} · ${item.status || ''} · ${new Date(item.sentAt || item.createdAt).toLocaleString()}`;
  node.querySelector('h3').textContent = item.message || item.findingId || item.channel;
  node.querySelector('.feed-summary').textContent = item.errorMessage || JSON.stringify(item.meta || {});
  node.querySelector('.feed-link').remove();
  return node;
}

function activityCard(item) {
  const node = document.querySelector('#feed-card-template').content.firstElementChild.cloneNode(true);
  const meta = item.meta && Object.keys(item.meta).length
    ? JSON.stringify(item.meta, null, 2)
    : '';

  const metaEl = node.querySelector('.feed-meta');
  metaEl.textContent = '';
  metaEl.className = 'feed-meta-row';

  const badge = document.createElement('span');
  badge.className = `log-badge ${item.level || 'info'}`;
  badge.textContent = item.level || 'info';

  const text = document.createElement('span');
  text.className = 'feed-meta';
  text.textContent = `${item.type} · ${new Date(item.createdAt).toLocaleString()}`;

  metaEl.append(badge, text);
  node.querySelector('h3').textContent = item.message || item.type;
  node.querySelector('.feed-summary').textContent = meta ? '见下方调试详情' : '无附加调试字段';

  if (meta) {
    const block = document.createElement('pre');
    block.className = 'meta-block';
    block.textContent = meta;
    node.append(block);
  }

  node.querySelector('.feed-link').remove();
  return node;
}

function renderAll(data) {
  state.data = data;
  els.watcherKpi.textContent = String(data.watchers.length);
  els.sourceKpi.textContent = String(data.sources.filter((source) => source.enabled).length);
  els.findingsKpi.textContent = String(data.findings.length);
  renderWatchers(data.watchers);
  renderSources(data.sources);
  renderFeed(els.findingsList, data.findings, findingCard, '暂无新热点。');
  renderFeed(els.notificationsList, data.notifications, simpleCard, '暂无通知记录。');
  renderFeed(els.activityList, data.activity, activityCard, '暂无活动记录。');
  fillForm(els.settingsForm, data.settings);
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

els.settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
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

els.watcherForm.addEventListener('submit', async (event) => {
  event.preventDefault();
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
  if (watcherId) {
    await runWatcherNow(watcherId);
  } else {
    await loadState();
  }
});

els.sourceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
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
  await loadState();
});

els.runNow.addEventListener('click', async () => {
  await requestJson('/api/run-now', { method: 'POST' });
  await loadState();
});

els.testEmail.addEventListener('click', async () => {
  await requestJson('/api/test-email', { method: 'POST' });
  alert('SMTP 验证通过。');
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
    maybeBrowserNotify(payload);
    await loadState();
  });
}

await loadState();
connectEvents();
