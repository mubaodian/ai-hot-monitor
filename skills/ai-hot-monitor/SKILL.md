---
name: ai-hot-monitor
description: Discover and monitor hot topics across multiple information sources. Use to create monitoring tasks, search for trending information, manage information sources, and retrieve detailed findings. Fully self-contained with local JSON storage.
---

# AI Hot Monitor Skills

Self-contained Python skills for discovering and monitoring hot topics across multiple information sources (RSS, web search, social media, etc.).

## Skills

### monitor-topic
Create a monitoring task for a specific topic or query.

**Parameters:**
- `name` (string): Topic name
- `query` (string): Search query
- `scope` (string, optional): Topic scope/category
- `notification_channels` (array, optional): Notification methods (email, browser, etc.)
- `source_ids` (array, optional): Specific sources to monitor
- `interval_minutes` (number, optional): Check interval in minutes (default: 15)

**Returns:** Watcher object with id, name, query, enabled status, and creation timestamp

### search-findings
Search for hot topics and findings across enabled information sources.

**Parameters:**
- `query` (string): Search query
- `source_types` (array, optional): Filter by source types (rss, bing_web, baidu_web, weibo_hot, etc.)
- `limit` (number, optional): Maximum results (default: 20)

**Returns:** Object with `findings` array and `total` count

### get-status
Get current monitoring status, active watchers, and recent findings.

**Parameters:**
- `watcher_id` (string, optional): Filter to specific watcher

**Returns:** Status object with watchers list, recent findings, and statistics

### configure-sources
Enable, disable, or configure information sources.

**Parameters:**
- `source_id` (string): Source ID to configure
- `enabled` (boolean, optional): Enable/disable the source
- `config` (object, optional): Configuration updates

**Returns:** Updated source object

### fetch-item-details
Get detailed information about a specific finding.

**Parameters:**
- `finding_id` (string): Finding ID

**Returns:** Detailed finding object with metrics, quality, and raw data

## Usage

```bash
# Create a monitoring task
python skills.py monitor-topic '{"name":"GPT-5","query":"GPT-5 release","notification_channels":["email"]}'

# Search findings
python skills.py search-findings '{"query":"Claude Code","source_types":["rss","bing_web"],"limit":10}'

# Get status
python skills.py get-status '{}'

# Configure a source
python skills.py configure-sources '{"source_id":"src_bing_web","enabled":true}'

# Fetch item details
python skills.py fetch-item-details '{"finding_id":"finding_abc123"}'
```

## Data Storage

Skills use local JSON file storage (`data/store.json`) for persistence. No external services required.

## Information Sources

Supported source types:
- `rss` - RSS feeds
- `bing_web` - Bing web search
- `baidu_web` - Baidu search
- `weibo_hot` - Weibo trending
- `bilibili_web` - Bilibili search
- `twitterapi_io` - Twitter API search
- `webpage` - Webpage monitoring
