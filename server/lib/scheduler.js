export function createScheduler({ store, runWatcher }) {
  let timer = null;
  const running = new Set();

  async function tick() {
    const state = store.getState();
    const now = Date.now();

    for (const watcher of state.watchers) {
      if (!watcher.enabled) {
        continue;
      }

      const intervalMs = Math.max(Number(watcher.intervalMinutes || 15) * 60 * 1000, 60 * 1000);
      const lastRunAt = watcher.lastRunAt ? new Date(watcher.lastRunAt).getTime() : 0;
      const due = now - lastRunAt >= intervalMs;

      if (!due || running.has(watcher.id)) {
        continue;
      }

      running.add(watcher.id);
      runWatcher(watcher.id, 'scheduled')
        .catch(() => {})
        .finally(() => {
          running.delete(watcher.id);
        });
    }
  }

  function scheduleNext() {
    const pollInterval = Math.max(Number(store.getState().settings.pollIntervalMs || 60000), 10000);
    timer = setTimeout(async () => {
      await tick();
      scheduleNext();
    }, pollInterval);
  }

  return {
    start() {
      if (timer) {
        return;
      }
      void tick();
      scheduleNext();
    },
    stop() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }
  };
}
