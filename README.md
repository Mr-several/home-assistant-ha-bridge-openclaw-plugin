# HA Bridge OpenClaw Plugin

## 中文说明

将 Home Assistant WebSocket 事件桥接到 OpenClaw 的消息发送与 Agent 投递流程。

### 功能概览
- 订阅 HA 事件并按事件类型路由：
  - `directEventType` -> `openclaw message send`
  - `agentEventType` -> `openclaw agent --deliver`
- 内置防护：去重、限流、队列削峰、断线重连。
- 支持模板化消息与提示词渲染。

### 安装

#### 方式 1：本地目录开发安装
```bash
openclaw plugins install -l /path/to/ha-bridge-openclaw-plugin
openclaw plugins enable ha-bridge
```

#### 方式 2：npm 安装（发布后）
```bash
openclaw plugins install ha-bridge-openclaw-plugin
openclaw plugins enable ha-bridge
```

### 配置方式
在 OpenClaw 配置中的 `plugins.entries.ha-bridge.config` 下设置参数。

```yaml
plugins:
  entries:
    ha-bridge:
      enabled: true
      config:
        haWsUrl: ws://homeassistant.local:8123/api/websocket
        haToken: YOUR_HA_LONG_LIVED_TOKEN
        defaultChannel: discord
        defaultTarget: channel:1234567890
        directEventType: notify_openclaw_direct
        agentEventType: notify_openclaw_agent
```

### 配置项说明

#### 必填
- `haWsUrl`: HA WebSocket 地址，必须以 `/api/websocket` 结尾。
- `haToken`: HA Long-Lived Access Token。

#### 路由相关（成对出现）
- `defaultChannel` / `defaultTarget`: 默认投递路由。
- `directChannel` / `directTarget`: direct 模式覆盖路由。
- `agentChannel` / `agentTarget`: agent 模式覆盖路由。

每组 `channel/target` 要么都填，要么都不填；某模式未配置路由时会尝试回退到最近会话路由（last route）。

#### 事件与模板
- `directEventType` (默认 `notify_openclaw_direct`)
- `agentEventType` (默认 `notify_openclaw_agent`)
- `directMessageTemplate` (默认 `[HA] {{event_type}}: {{message}}`)
- `agentPromptTemplate`（默认中文改写提示）

模板变量：`{{event_type}}` `{{time_fired}}` `{{message}}` `{{title}}` `{{severity}}` `{{data_json}}`

#### Agent 参数
- `agentId`: 指定 Agent；不填时自动检测默认 Agent，失败回退 `main`。
- `agentSessionId` (默认 `ha-bridge`)
- `thinking` (默认 `low`，可选：`off|minimal|low|medium|high|xhigh`)

#### 稳定性与性能
- `dedupeWindowMs` (默认 `5000`)
- `maxMessagesPerMinute` (默认 `30`)
- `queueMax` (默认 `200`)
- `commandTimeoutMs` (默认 `45000`)
- `reconnectInitialMs` (默认 `2000`)
- `reconnectMaxMs` (默认 `60000`)
- `reconnectJitterRatio` (默认 `0.2`)
- `logLevel` (默认 `info`，可选：`error|warn|info|debug`)

### Home Assistant 自动化示例
```yaml
alias: 插座开启欢迎播报
description: 插座打开时通过小米音箱播报，并触发 OpenClaw V1/V2
triggers:
  - trigger: state
    entity_id: switch.cuco_cn_2028625295_v3_on_p_2_1
    to: "on"
actions:
  - event: notify_openclaw_direct
    event_data:
      message: 欢迎回家，祝你生活愉快（V1）
      source: ha_automation
      automation: 插座开启欢迎播报
  - event: notify_openclaw_agent
    event_data:
      message: 主人已回家，请生成一句更自然的欢迎提醒（V2）
      source: ha_automation
      automation: 插座开启欢迎播报
mode: single
```

### 调试与开发
```bash
npm install
npm test
npm run check
openclaw ha-bridge status --json
openclaw ha-bridge dry-run --mode direct --message "test" --json
openclaw ha-bridge dry-run --mode agent --message "test" --json
```

### 行为说明
- direct 和 agent 两条链路互不降级：agent 失败不会自动改成 direct。
- 事件 payload 不会覆盖路由；路由由插件配置（或 last-route 回退）决定。

---

## English Guide

This plugin bridges Home Assistant WebSocket events into OpenClaw message delivery and agent delivery flows.

### Features
- Subscribe to HA events and route by event type:
  - `directEventType` -> `openclaw message send`
  - `agentEventType` -> `openclaw agent --deliver`
- Built-in protections: dedupe, rate limiting, bounded queue, reconnect backoff.
- Template-based direct messages and agent prompts.

### Installation

#### Option 1: Local development path
```bash
openclaw plugins install -l /path/to/ha-bridge-openclaw-plugin
openclaw plugins enable ha-bridge
```

#### Option 2: From npm (after publish)
```bash
openclaw plugins install ha-bridge-openclaw-plugin
openclaw plugins enable ha-bridge
```

### Configuration
Set values under `plugins.entries.ha-bridge.config` in your OpenClaw config.

```yaml
plugins:
  entries:
    ha-bridge:
      enabled: true
      config:
        haWsUrl: ws://homeassistant.local:8123/api/websocket
        haToken: YOUR_HA_LONG_LIVED_TOKEN
        defaultChannel: discord
        defaultTarget: channel:1234567890
        directEventType: notify_openclaw_direct
        agentEventType: notify_openclaw_agent
```

### Config Reference

#### Required
- `haWsUrl`: HA WebSocket URL, must end with `/api/websocket`.
- `haToken`: HA long-lived access token.

#### Routing (must be paired)
- `defaultChannel` / `defaultTarget`: default delivery route.
- `directChannel` / `directTarget`: route override for direct mode.
- `agentChannel` / `agentTarget`: route override for agent mode.

Each `channel/target` pair must be both set or both omitted. If omitted for a mode, the plugin tries last-route fallback.

#### Event and templates
- `directEventType` (default `notify_openclaw_direct`)
- `agentEventType` (default `notify_openclaw_agent`)
- `directMessageTemplate` (default `[HA] {{event_type}}: {{message}}`)
- `agentPromptTemplate` (default Chinese rewrite prompt)

Template variables: `{{event_type}}` `{{time_fired}}` `{{message}}` `{{title}}` `{{severity}}` `{{data_json}}`

#### Agent parameters
- `agentId`: target agent. If omitted, plugin auto-detects default agent and falls back to `main`.
- `agentSessionId` (default `ha-bridge`)
- `thinking` (default `low`, one of `off|minimal|low|medium|high|xhigh`)

#### Reliability and performance
- `dedupeWindowMs` (default `5000`)
- `maxMessagesPerMinute` (default `30`)
- `queueMax` (default `200`)
- `commandTimeoutMs` (default `45000`)
- `reconnectInitialMs` (default `2000`)
- `reconnectMaxMs` (default `60000`)
- `reconnectJitterRatio` (default `0.2`)
- `logLevel` (default `info`, one of `error|warn|info|debug`)

### HA Automation Example
```yaml
alias: 插座开启欢迎播报
description: 插座打开时通过小米音箱播报，并触发 OpenClaw V1/V2
triggers:
  - trigger: state
    entity_id: switch.cuco_cn_2028625295_v3_on_p_2_1
    to: "on"
actions:
  - event: notify_openclaw_direct
    event_data:
      message: 欢迎回家，祝你生活愉快（V1）
      source: ha_automation
      automation: 插座开启欢迎播报
  - event: notify_openclaw_agent
    event_data:
      message: 主人已回家，请生成一句更自然的欢迎提醒（V2）
      source: ha_automation
      automation: 插座开启欢迎播报
mode: single
```

### Debug and Development
```bash
npm install
npm test
npm run check
openclaw ha-bridge status --json
openclaw ha-bridge dry-run --mode direct --message "test" --json
openclaw ha-bridge dry-run --mode agent --message "test" --json
```

### Behavior Notes
- Direct and agent flows are independent; agent failure does not downgrade to direct.
- Event payload does not override routing; routes come from plugin config (or last-route fallback).
