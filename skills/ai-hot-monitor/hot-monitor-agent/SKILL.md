---
name: hot-monitor-agent
description: Independent multi-source hot-topic monitoring for AI news, tools, and community signals with local JSON state, source adapters, AI verification, deduplication, and scheduled sweeps. Use when Codex needs to create or run watcher-based monitoring without relying on an existing web server, especially for adding watchers, tuning sources, running one-off scans, or launching a local scheduler inside this skill folder.
---

# Hot Monitor Agent

## Overview

Operate a self-contained hot-topic monitoring skill from this directory.

Use the scripts in `scripts/` to manage settings, watchers, sources, and local state. Persist runtime data in `state/store.json`. Keep this skill independent from the existing web project: do not require `server/index.js`, SSE, or the frontend UI to use it.

## Core Workflow

1. Inspect or patch runtime settings with `scripts/manage-settings.mjs`.
2. Create or update watchers with `scripts/manage-watchers.mjs`.
3. Enable, disable, or add sources with `scripts/manage-sources.mjs`.
4. Run a single sweep with `scripts/run-once.mjs` or start recurring sweeps with `scripts/run-scheduler.mjs`.
5. Review findings and activity with `scripts/show-state.mjs`.

## Runtime Model

- Use `state/store.json` as the only persisted state file for settings, watchers, sources, findings, and activity.
- Load API keys from environment variables first. Support `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `TWITTERAPI_IO_KEY`, and `TWITTER_API_KEY`.
- Optionally load `.env` from the skill root. Also tolerate a repo-root `.env` when the skill is used inside this project.
- Treat watchers without `sourceIds` as using all enabled query-capable sources.
- Deduplicate findings by canonical URL and normalized title.
- Keep scheduled execution local and lightweight. Do not introduce external services.

## Scripts

### `scripts/manage-settings.mjs`

- `show`: print current effective settings
- `set --patch-json '{...}'`: patch settings in `state/store.json`

Use this for poll interval, model selection, or storing non-secret defaults.

### `scripts/manage-watchers.mjs`

- `list`
- `add --query "..." [--name "..."] [--scope "..."] [--interval 15] [--source-ids a,b]`
- `enable --watcher <id-or-name>`
- `disable --watcher <id-or-name>`
- `remove --watcher <id-or-name>`

Use this to control what topics the skill monitors.

### `scripts/manage-sources.mjs`

- `list`
- `enable --source <id-or-name>`
- `disable --source <id-or-name>`
- `set-config --source <id-or-name> --config-json '{...}'`
- `add-rss --name "..." --feed-url "..." [--limit 10]`
- `add-webpage --name "..." --urls https://a,https://b`
- `remove --source <id-or-name>`

Use this to tune source behavior without touching the original project code.

### `scripts/run-once.mjs`

- Run all enabled watchers once by default
- Use `--watcher <id-or-name>` to target a single watcher
- Use `--due-only` to only run watchers whose interval has elapsed

### `scripts/run-scheduler.mjs`

Launch a local polling loop that checks due watchers based on:

- `settings.pollIntervalMs`
- each watcher's `intervalMinutes`

Stop it with `Ctrl+C`.

### `scripts/show-state.mjs`

- `summary`
- `findings [--watcher <id-or-name>] [--limit 10]`
- `activity [--limit 20]`

Use this to inspect results after a run.

## Decision Rules

- Prefer running `manage-settings.mjs show` and `manage-watchers.mjs list` before changing runtime state.
- Prefer `run-once.mjs` before `run-scheduler.mjs` when validating a new watcher.
- Keep watcher queries concrete. Broader topics increase noise and fallback scoring.
- Treat AI verification as optional enrichment, not a hard dependency. When credits or API access are unavailable, the skill falls back to conservative heuristics.

## References

- Read `references/runtime-model.md` when you need the architecture and processing flow.
- Read `references/source-types.md` when you need per-source behavior and config expectations.
- Read `references/config-schema.md` when you need the store structure or editable settings/watcher/source fields.
