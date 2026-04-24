# Config Schema

## Store File

Path:

- `state/store.json`

## `settings`

Common fields:

- `openRouterApiKey`
- `openRouterModel`
- `twitterApiKey`
- `pollIntervalMs`
- `maxCandidatesPerWatcher`

Notes:

- environment variables override stored API keys and model values
- `pollIntervalMs` controls scheduler wake-up frequency
- `maxCandidatesPerWatcher` caps persisted findings per watcher run

## `watchers`

Fields:

- `id`
- `name`
- `query`
- `scope`
- `enabled`
- `intervalMinutes`
- `sourceIds`
- `createdAt`
- `updatedAt`
- `lastRunAt`

Rules:

- `query` is required
- `name` falls back to `query`
- `intervalMinutes` has a minimum effective value of 1 minute at runtime

## `sources`

Fields:

- `id`
- `name`
- `type`
- `enabled`
- `config`
- `createdAt`
- `updatedAt`

Rules:

- `type` is required
- `config` must be a JSON object

## `findings`

Fields:

- `id`
- `watcherId`
- `sourceId`
- `sourceIds`
- `title`
- `url`
- `snippet`
- `publishedAt`
- `detectedAt`
- `sourceType`
- `sourceName`
- `sourceMatches`
- `author`
- `metrics`
- `quality`
- `aiDecision`
- `dedupeKey`

## `activity`

Fields:

- `id`
- `level`
- `type`
- `message`
- `meta`
- `createdAt`
