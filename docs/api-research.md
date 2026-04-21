# 外部 API 与技术实现调研

## 1. 调研目的

本文件用于固化开发前确认过的外部接口与技术实现基线，避免使用过时接口或旧版用法。

## 2. MCP 调研结果

本项目使用 `Context7 MCP` 查询最新文档，当前已核对以下库与实现方式：

### 2.1 OpenAI Node SDK

- MCP 库标识：`/openai/openai-node/v6_1_0`
- 用途：通过 `baseURL` 指向 OpenRouter，实现统一的 AI 调用层
- 已确认模式：
  - `new OpenAI({ apiKey, baseURL })`
  - `client.chat.completions.create(...)`
  - 结构化输出可使用 `response_format`

从 MCP 获取到的当前推荐实现重点：

1. 使用官方 `openai` Node SDK 初始化客户端。
2. 调用 `chat.completions.create` 进行聊天补全。
3. 如果需要严格 JSON 输出，可使用结构化响应格式。

说明：

- MCP 文档来源是 OpenAI Node SDK 官方仓库文档。
- 实际对接 OpenRouter 时，需要把 `baseURL` 改为 OpenRouter 的接口地址。

### 2.2 Nodemailer

- MCP 库标识：`/nodemailer/nodemailer-homepage`
- 用途：SMTP 邮件发送
- 已确认模式：
  - `createTransport({ host, port, secure, auth })`
  - `await transporter.verify()`
  - `await transporter.sendMail({...})`

从 MCP 获取到的当前推荐实现重点：

1. 使用 SMTP 创建 transporter。
2. 在保存邮件配置时优先执行 `verify()` 验证配置有效性。
3. 发送通知时使用 `sendMail()`。

### 2.3 Node.js 22

- MCP 库标识：`/nodejs/node/v22_20_0`
- 用途：
  - HTTP 服务
  - SSE 推送
  - JSON 文件持久化

从 MCP 获取到的当前推荐实现重点：

1. 使用 `node:http` 创建原生 HTTP 服务。
2. 使用标准响应头实现 `SSE` 长连接。
3. 使用内置文件系统模块管理本地 JSON 持久化。

## 3. 官方站点调研结果

以下信息不在 MCP 中或 MCP 覆盖不足，因此通过官方站点补充确认。

### 3.1 OpenRouter

官方文档确认：

- OpenRouter 支持兼容 OpenAI 风格的 API 调用。
- 可通过 `baseURL = https://openrouter.ai/api/v1` 方式接入。
- 支持结构化输出能力。

用途：

- 统一接入 AI 判别模型
- 实现相关性判定、真假识别、热度评分、摘要生成

参考：

- https://openrouter.ai/docs
- https://openrouter.ai/docs/api-reference/chat-completion
- https://openrouter.ai/docs/features/structured-outputs

### 3.2 twitterapi.io

官方文档确认：

- 该服务提供 Twitter(X) 相关 API 文档与认证方式。
- 计划在项目中接入：
  - 关键词搜索
  - 用户时间线
  - 趋势类能力

用途：

- 作为高时效信息源之一，补强网页抓取与 RSS 的不足

参考：

- https://docs.twitterapi.io/
- https://docs.twitterapi.io/authentication
- https://docs.twitterapi.io/api-reference/endpoint/get_trends

### 3.3 Bing Search API 退役

官方文档检索结果表明：

- `Bing Search APIs` 已于 `2025-08-11` 退役

结论：

- 当前项目不能再以退役的 `Bing Search API` 作为主接入方案
- 将改为：
  - Bing 搜索页面抓取
  - 或后续扩展 Azure `Grounding with Bing Search`

参考：

- Microsoft Learn 关于 Bing Search API 退役说明

## 4. 最终技术基线

当前确认的实现基线如下：

1. AI：`OpenAI Node SDK + OpenRouter baseURL`
2. 邮件：`Nodemailer + SMTP`
3. Web 推送：`Node HTTP + SSE`
4. 本地持久化：`JSON 文件`
5. Twitter(X)：`twitterapi.io`
6. RSS：直接拉取并解析 XML
7. 搜索引擎源：以网页抓取适配器实现
8. 敏感配置：通过项目根目录 `.env` 管理并在服务启动时加载

## 5. 明确不采用的旧方案

以下方案明确不采用：

1. 退役后的 `Bing Search API`
2. 仅依赖单一搜索源
3. 只做关键词匹配、不做 AI 二次识别
4. 只做手动刷新、不做后台自动巡检
