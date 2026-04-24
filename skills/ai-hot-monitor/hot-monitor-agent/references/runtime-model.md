# Runtime Model

## Purpose

This skill packages the hot-monitoring pipeline as a standalone local runtime.

It is derived from the existing project requirements and backend implementation, but it does not depend on:

- the project's HTTP server
- the web frontend
- SSE
- SMTP notifications

## Processing Flow

1. Load environment variables and persisted state from `state/store.json`.
2. Select enabled watchers.
3. For each watcher, select enabled sources.
4. Fetch items from each source.
5. Prefilter non-query-aware sources with a rough relevance score.
6. Build merged candidates with quality scoring and cross-source consensus.
7. Run AI verification when an OpenRouter key and model are available.
8. Persist accepted findings and activity.
9. Update `lastRunAt` for completed watchers.

## Scheduling Model

- `settings.pollIntervalMs` controls how often the scheduler loop wakes up.
- each watcher uses `intervalMinutes` to decide whether it is due.
- `run-once.mjs` bypasses the loop and executes immediately.

## Storage Model

The skill stores everything in one file:

- `state/store.json`

Top-level sections:

- `settings`
- `watchers`
- `sources`
- `findings`
- `activity`

## Design Constraints

- keep the runtime lightweight
- avoid coupling to the existing web app
- use local JSON only
- tolerate missing AI credentials
- degrade gracefully when external sources fail
