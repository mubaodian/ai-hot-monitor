# AI Hot Monitor

自动发现并监控指定领域内的热点变化，通过 AI 智能判别和实时通知，帮助用户快速掌握感兴趣领域的最新动态。

## 🎯 核心功能

- **关键词监控** - 输入关键词或主题范围，系统自动从多个信息源持续搜索相关内容
- **热点发现** - 主动发现指定领域内的新热点，而不仅限于精确关键词匹配
- **AI 智能判别** - 利用 AI 识别真实相关内容，过滤假冒、蹭热点、标题党等低质内容
- **实时通知** - 通过浏览器 SSE 推送和邮件通知，在热点出现时第一时间提醒用户
- **可视化展示** - 响应式 Web 界面展示监控任务、热点流、可信度评分和通知记录

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                    React 19 + Vite                       │
│                    前端 Web 界面                          │
└────────────────────┬────────────────────────────────────┘
                     │ SSE 实时推送
┌────────────────────▼────────────────────────────────────┐
│              Node.js 22 原生 HTTP 服务                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 任务管理 API │  │ 信息源管理   │  │ 调度器       │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ AI 判别      │  │ SSE 推送     │  │ 邮件通知     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
    ┌───▼──┐    ┌───▼──┐    ┌───▼──┐
    │ JSON │    │ SMTP │    │ AI   │
    │ 存储 │    │ 邮件 │    │ API  │
    └──────┘    └──────┘    └──────┘
```

**核心技术栈：**
- 后端：Node.js 22 原生 HTTP
- 前端：React 19 + Vite + Tailwind CSS
- AI：OpenRouter API
- 邮件：Nodemailer SMTP
- 推送：Server-Sent Events (SSE)
- 存储：本地 JSON 文件

## 📊 支持的信息源

系统支持从多个信息源并行获取信息，确保数据多元化：

- **RSS 订阅源** - 支持任意 RSS/Atom 源
- **Bing 搜索** - 网页搜索结果抓取
- **百度搜索** - 百度搜索结果抓取
- **微博热搜** - 微博热搜话题抓取
- **Twitter/X** - 通过 twitterapi.io 获取推文
- **通用网页** - 支持自定义网页抓取

## 🚀 快速开始

### 前置要求

- Node.js 22+
- Python 3.8+ (用于 Agent Skills)
- 邮件服务 SMTP 配置 (可选)
- OpenRouter API Key

### 安装

```bash
# 克隆项目
git clone <repository-url>
cd ai-hot-monitor

# 安装依赖
npm install
```

### 配置

在项目根目录创建 `.env` 文件：

```env
# OpenRouter API
OPENROUTER_API_KEY=your_api_key_here

# SMTP 邮件配置
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_password
EMAIL_FROM=your_email@gmail.com
EMAIL_TO=recipient@example.com

# Twitter API (可选)
TWITTERAPI_IO_KEY=your_twitter_api_key
```

### 运行

```bash
# 开发模式 - 后端自动重启
npm run dev

# 前端开发服务器 (另一个终端)
npm run frontend:dev

# 生产模式
npm start

# 构建前端
npm run build
```

访问 `http://localhost:3000` 打开 Web 界面。

## 📋 使用示例

### 创建监控任务

```bash
# 通过 API 创建
curl -X POST http://localhost:3000/api/watchers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GPT-5 发布动态",
    "query": "GPT-5 release",
    "scope": "AI 大模型",
    "intervalMinutes": 30,
    "notificationChannels": ["browser", "email"],
    "sourceIds": ["src_bing_web", "src_rss"]
  }'
```

### 通过 Agent Skill 使用

```bash
# 创建监控任务
python skills/ai-hot-monitor/skills.py monitor-topic \
  '{"name":"Claude Code","query":"Claude Code features"}'

# 搜索热点
python skills/ai-hot-monitor/skills.py search-findings \
  '{"query":"Claude Code","limit":10}'

# 获取监控状态
python skills/ai-hot-monitor/skills.py get-status '{}'
```

## 🔧 Agent Skills

项目包含 5 个独立的 Python Skills，可直接在 Claude Code 中使用：

| Skill | 功能 | 输入 |
|-------|------|------|
| `monitor-topic` | 创建/管理监控任务 | name, query, scope, notificationChannels, sourceIds, intervalMinutes |
| `search-findings` | 搜索热点信息 | query, sourceTypes, limit |
| `get-status` | 获取监控状态 | watcherId (可选) |
| `configure-sources` | 配置信息源 | sourceId, enabled, config |
| `fetch-item-details` | 获取单条信息详情 | findingId |

详见 `skills/ai-hot-monitor/SKILL.md`

## 📁 项目结构

```
ai-hot-monitor/
├── server/                 # Node.js 后端
│   ├── index.js           # 主服务器
│   ├── api/               # API 路由
│   ├── scheduler/         # 定时调度器
│   ├── sources/           # 信息源适配器
│   ├── ai/                # AI 判别模块
│   └── utils/             # 工具函数
├── client/                # React 前端
│   ├── src/
│   │   ├── pages/         # 页面组件
│   │   ├── components/    # UI 组件
│   │   └── App.jsx
│   └── index.html
├── skills/                # Agent Skills
│   └── ai-hot-monitor/
│       ├── skills.py      # Skills 实现
│       ├── store.py       # 数据存储
│       └── SKILL.md       # Skills 文档
├── docs/                  # 项目文档
│   ├── architecture.md    # 技术方案
│   └── requirements.md    # 需求说明
├── data/                  # 本地数据存储
│   ├── settings.json
│   ├── watchers.json
│   ├── sources.json
│   ├── findings.json
│   └── notifications.json
└── package.json
```

## 🔐 安全性

- **密钥管理** - 敏感信息通过 `.env` 文件管理，不提交到版本控制
- **频率控制** - 内置请求频率限制和随机抖动，避免对源站造成压力
- **反爬防护** - 使用合理的 User-Agent 和并发控制
- **数据隐私** - 本地 JSON 存储，无云端数据上传

## 📊 数据模型

### 监控任务 (Watcher)
```json
{
  "id": "watcher_xxx",
  "name": "GPT-5 发布动态",
  "query": "GPT-5 release",
  "scope": "AI 大模型",
  "enabled": true,
  "intervalMinutes": 30,
  "notificationChannels": ["browser", "email"],
  "sourceIds": ["src_bing_web", "src_rss"],
  "createdAt": "2026-04-24T10:00:00Z",
  "lastRunAt": "2026-04-24T10:30:00Z"
}
```

### 热点发现 (Finding)
```json
{
  "id": "finding_xxx",
  "watcherId": "watcher_xxx",
  "sourceId": "src_bing_web",
  "title": "OpenAI 发布 GPT-5",
  "url": "https://example.com/gpt5",
  "snippet": "OpenAI 今日正式发布 GPT-5...",
  "publishedAt": "2026-04-24T09:00:00Z",
  "detectedAt": "2026-04-24T10:15:00Z",
  "aiDecision": {
    "relevant": true,
    "relevanceScore": 0.95,
    "credibility": 0.9,
    "heatScore": 8.5,
    "summary": "OpenAI 官方发布 GPT-5，性能提升显著"
  }
}
```

## 🧪 测试

```bash
# 运行测试
npm test

# 测试 Agent Skills
python skills/ai-hot-monitor/test.py
```

## 📝 API 文档

### 监控任务

- `GET /api/watchers` - 获取所有监控任务
- `POST /api/watchers` - 创建新监控任务
- `PUT /api/watchers/:id` - 更新监控任务
- `DELETE /api/watchers/:id` - 删除监控任务

### 热点发现

- `GET /api/findings` - 获取热点列表
- `GET /api/findings/:id` - 获取热点详情

### 信息源

- `GET /api/sources` - 获取所有信息源
- `PUT /api/sources/:id` - 更新信息源配置

### 系统

- `GET /api/status` - 获取系统状态
- `POST /api/trigger-scan` - 手动触发巡检
- `GET /api/events` - SSE 事件流

详见 `docs/api.md`

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 📞 联系方式

如有问题或建议，欢迎通过 GitHub Issues 联系我们。

---

**最后更新**: 2026-04-24
