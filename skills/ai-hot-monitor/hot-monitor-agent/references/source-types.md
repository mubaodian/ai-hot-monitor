# Source Types

## Default Source Set

The skill initializes these source types:

- `rss`
- `bing_web`
- `baidu_web`
- `sogou_web`
- `so360_web`
- `bilibili_web`
- `weibo_hot`
- `twitterapi_io`
- `webpage`

## Query-Aware Sources

These sources naturally accept the watcher query:

- `bing_web`
- `baidu_web`
- `sogou_web`
- `so360_web`
- `bilibili_web`
- `twitterapi_io`

`rss` and `webpage` become query-aware only when their config can interpolate `{query}`.

## Config Expectations

### `rss`

Typical config:

```json
{
  "feedUrl": "https://hnrss.org/newest?q=AI",
  "limit": 12
}
```

Optional query-aware config:

```json
{
  "feedUrl": "https://example.com/rss?q={query}",
  "queryTemplate": "{query}",
  "limit": 10
}
```

### Search engines

Typical config:

```json
{
  "queryTemplate": "{query}",
  "limit": 8
}
```

Supported search engine types:

- `bing_web`
- `baidu_web`
- `sogou_web`
- `so360_web`

### `bilibili_web`

Typical config:

```json
{
  "limit": 6,
  "userLimit": 2,
  "videoLimit": 6,
  "accountFirst": true
}
```

### `weibo_hot`

Typical config:

```json
{
  "limit": 15
}
```

### `twitterapi_io`

Typical config:

```json
{
  "mode": "search",
  "queryTemplate": "{query}",
  "queryType": "Latest"
}
```

For trends mode:

```json
{
  "mode": "trends",
  "woeid": 1,
  "count": 30
}
```

### `webpage`

Typical config:

```json
{
  "urls": ["https://openai.com/news/"]
}
```

## Selection Rules

- A watcher with explicit `sourceIds` uses only those enabled sources.
- A watcher without `sourceIds` uses enabled query-capable sources first.
- If no query-capable enabled sources remain, the watcher falls back to all enabled sources.
