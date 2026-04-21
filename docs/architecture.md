# AI Hot Monitor 技术方案

## 1. 总体设计

项目采用轻量单体结构：

- 前端：原生响应式 Web 页面
- 后端：Node.js 22 原生 HTTP 服务
- 通知：SSE 浏览器推送 + SMTP 邮件
- AI：OpenRouter
- 存储：本地 JSON 文件

设计目标：

1. 先快速做出可用产品
2. 控制依赖规模
3. 方便后续封装成 Agent Skill

## 2. 系统模块

### 2.1 前端模块

职责：

- 展示监控任务
- 展示热点流
- 展示命中记录与通知记录
- 配置信息源和 AI/邮件参数
- 接收 SSE 实时事件

页面风格：

- 不使用常规后台模板
- 采用“情报信号台”视觉方向
- 支持桌面和移动端

### 2.2 后端 API 模块

职责：

- 配置读写
- 监控任务管理
- 信息源管理
- 手动触发巡检
- SSE 事件流输出

### 2.3 调度模块

职责：

- 定时执行巡检任务
- 根据任务间隔决定是否运行
- 控制抓取频率与重试

### 2.4 信息源适配器

统一输出标准化条目：

- `id`
- `title`
- `url`
- `snippet`
- `publishedAt`
- `sourceType`
- `sourceName`
- `author`
- `raw`

第一阶段适配器：

1. `rss`
2. `bing_web`
3. `baidu_web`
4. `weibo_hot`
5. `webpage`
6. `twitterapi_io`

### 2.5 AI 判别模块

职责：

- 判断是否与用户监控主题真实相关
- 判断是否疑似假冒、误导、蹭热点
- 判断来源可信度
- 计算热度评分
- 生成用户可读摘要

输出统一结构：

- `relevant`
- `relevanceScore`
- `suspectedImpersonation`
- `credibility`
- `isOfficial`
- `heatScore`
- `summary`
- `reason`
- `tags`

### 2.6 通知模块

#### 浏览器实时推送

- 使用 `SSE`
- 当出现新命中热点时向已连接浏览器推送事件

#### 邮件通知

- 使用 `SMTP`
- 支持测试连接
- 支持发送热点摘要邮件

## 3. 数据模型

## 3.1 settings

- `openRouterApiKey`
- `openRouterModel`
- `smtpHost`
- `smtpPort`
- `smtpSecure`
- `smtpUser`
- `smtpPass`
- `emailFrom`
- `emailTo`
- `pollIntervalMs`

## 3.2 watchers

- `id`
- `name`
- `query`
- `scope`
- `enabled`
- `intervalMinutes`
- `notificationChannels`
- `sourceIds`
- `createdAt`
- `updatedAt`
- `lastRunAt`

## 3.3 sources

- `id`
- `name`
- `type`
- `enabled`
- `config`
- `createdAt`
- `updatedAt`

## 3.4 findings

- `id`
- `watcherId`
- `sourceId`
- `title`
- `url`
- `snippet`
- `publishedAt`
- `detectedAt`
- `aiDecision`
- `dedupeKey`

## 3.5 notifications

- `id`
- `findingId`
- `channel`
- `status`
- `sentAt`
- `errorMessage`

## 4. 后端流程

### 4.1 巡检流程

1. 选择启用中的监控任务
2. 找到该任务可用的信息源
3. 并行抓取多个信息源
4. 标准化与去重
5. 调用 OpenRouter 做 AI 判别
6. 对命中结果进行存储
7. 触发 SSE 与邮件通知
8. 更新任务运行时间

### 4.2 去重策略

综合以下字段生成去重键：

- 规范化 URL
- 标题归一化
- 来源名称

### 4.3 失败处理

- 抓取失败写入日志
- 单源失败不影响其他源执行
- AI 失败时保留原始条目并标记状态
- 邮件发送失败不影响页面展示与 SSE 推送

## 5. 安全与频率控制

### 5.1 密钥管理

- 敏感信息统一放入项目根目录 `.env`
- 当前约定通过 `.env` 管理的字段：
  - `OPENROUTER_API_KEY`
  - `TWITTERAPI_IO_KEY`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_SECURE`
  - `EMAIL_FROM`
  - `EMAIL_TO`
- 服务端启动时优先读取 `.env`
- 如果 `.env` 中存在同名字段，运行时以 `.env` 为准
- UI 中返回的敏感字段只做脱敏展示，不允许通过表单覆盖 `.env`

### 5.2 频率限制

- 每类网页抓取器有最小抓取间隔
- 对搜索型源增加随机抖动
- 单轮巡检设置超时

### 5.3 反爬防护

- 使用合理 User-Agent
- 控制并发
- 记录失败并降级

## 6. 开发顺序

### 阶段一：文档与脚手架

1. 沉淀需求与技术方案
2. 初始化目录结构
3. 建立基础 HTTP 服务

### 阶段二：核心链路

1. 监控任务管理接口
2. 信息源管理接口
3. 调度器
4. OpenRouter AI 判别
5. SSE 实时通知
6. 邮件通知

### 阶段三：前端体验

1. 响应式页面
2. 信息流可视化
3. 配置表单
4. 实时状态反馈

### 阶段四：验证与收尾

1. 单元测试
2. 手工联调
3. 验收准备
4. Web 版通过后进入 Agent Skill 封装
