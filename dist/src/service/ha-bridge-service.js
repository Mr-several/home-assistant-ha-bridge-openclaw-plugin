import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getMissingRequired, parseHaBridgeConfig } from "../config.js";
import { CommandDispatcher, } from "../dispatch/command-dispatcher.js";
import { HaWsClient } from "../ha/ws-client.js";
import { EventDeduper } from "../pipeline/dedupe.js";
import { BoundedAsyncQueue } from "../pipeline/queue.js";
import { SlidingWindowRateLimiter } from "../pipeline/rate-limit.js";
import { RuntimeState } from "../state/runtime-state.js";
import { buildTemplateContext, extractEventMessage, renderTemplate } from "../template/render.js";
const MAX_DIRECT_MESSAGE_CHARS = 4000;
const MAX_AGENT_PROMPT_CHARS = 8000;
export class HaBridgeService {
    deps;
    config = null;
    effectiveAgentId = "main";
    state = new RuntimeState();
    deduper = null;
    limiter = null;
    queue = null;
    dispatcher = null;
    wsClient = null;
    constructor(deps) {
        this.deps = deps;
    }
    async start() {
        if (this.config) {
            return;
        }
        const missingRequired = getMissingRequired(this.deps.rawConfig);
        if (missingRequired.length > 0) {
            const missingSummary = missingRequired.join(", ");
            this.state = new RuntimeState({
                running: false,
                connected: false,
                configured: false,
                missingRequired,
                queueDepth: 0,
                reconnectAttempts: 0,
                subscribedEventTypes: [],
                lastError: `not configured: missing required config: ${missingSummary}`,
            });
            this.deps.logger.warn?.(`ha-bridge not configured; missing required config: ${missingSummary}`);
            return;
        }
        let config;
        try {
            config = parseHaBridgeConfig(this.deps.rawConfig);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.state = new RuntimeState({
                running: false,
                connected: false,
                configured: false,
                missingRequired: [],
                queueDepth: 0,
                reconnectAttempts: 0,
                subscribedEventTypes: [],
                lastError: `not configured: ${message}`,
            });
            this.deps.logger.warn?.(`ha-bridge not configured; invalid config: ${message}`);
            return;
        }
        this.config = config;
        const effectiveAgent = this.resolveEffectiveAgent(config);
        this.effectiveAgentId = effectiveAgent.agentId;
        if (effectiveAgent.source === "detected") {
            this.deps.logger.info?.(`ha-bridge using detected default agentId: ${this.effectiveAgentId}`);
        }
        else if (effectiveAgent.source === "fallback") {
            this.deps.logger.warn?.('ha-bridge default agent detection failed; fallback agentId="main"');
        }
        this.state = new RuntimeState({
            running: true,
            connected: false,
            configured: true,
            missingRequired: [],
            haWsUrl: config.haWsUrl,
            subscribedEventTypes: [config.directEventType, config.agentEventType],
            queueDepth: 0,
            reconnectAttempts: 0,
        });
        this.deduper = new EventDeduper(config.dedupeWindowMs);
        this.limiter = new SlidingWindowRateLimiter(config.maxMessagesPerMinute);
        this.dispatcher = new CommandDispatcher(this.deps.runCommand, config.commandTimeoutMs);
        this.queue = new BoundedAsyncQueue(config.queueMax, (error) => {
            this.state.setLastError(error instanceof Error ? error.message : String(error));
            this.deps.logger.error?.(`ha-bridge queue consumer failed: ${String(error)}`);
        });
        this.queue.start(async (event) => {
            await this.consumeEvent(event);
            this.state.setQueueDepth(this.queue?.size ?? 0);
        });
        this.wsClient = new HaWsClient({
            url: config.haWsUrl,
            token: config.haToken,
            eventTypes: [config.directEventType, config.agentEventType],
            reconnectInitialMs: config.reconnectInitialMs,
            reconnectMaxMs: config.reconnectMaxMs,
            reconnectJitterRatio: config.reconnectJitterRatio,
            logger: this.deps.logger,
            random: this.deps.random,
            onEvent: async (event) => {
                await this.onInboundEvent(event);
            },
            onConnectionChange: (connected) => {
                this.state.setConnected(connected);
            },
            onReconnectAttempt: (attempts) => {
                this.state.setReconnectAttempts(attempts);
            },
            onError: (error) => {
                this.state.setLastError(error);
            },
        });
        await this.wsClient.start();
    }
    async stop() {
        await this.wsClient?.stop();
        this.wsClient = null;
        if (this.queue) {
            await this.queue.stop({ drain: false });
            this.queue = null;
        }
        this.state.setRunning(false);
        this.state.setConnected(false);
        this.state.setQueueDepth(0);
        this.config = null;
        this.effectiveAgentId = "main";
        this.deduper = null;
        this.limiter = null;
        this.dispatcher = null;
    }
    async reconnect() {
        if (!this.wsClient) {
            throw new Error("ha-bridge service is not running");
        }
        this.wsClient.reconnectNow();
    }
    getStatus() {
        return this.state.snapshot();
    }
    dryRun(params) {
        const config = this.requireConfig();
        const dispatcher = this.requireDispatcher();
        const event = this.buildDryRunEvent(params.mode, params.message);
        if (params.mode === "direct") {
            const route = this.resolveRoute("direct");
            const context = buildTemplateContext(event, MAX_DIRECT_MESSAGE_CHARS);
            const message = renderTemplate(config.directMessageTemplate, context);
            if (route.kind === "last") {
                const lastRoute = this.resolveLastDirectRoute();
                if (!lastRoute) {
                    throw new Error("ha-bridge direct route fallback has no previous channel/target; configure route or send one chat first");
                }
                return {
                    mode: "direct",
                    argv: dispatcher.buildDirectArgs({
                        channel: lastRoute.channel,
                        target: lastRoute.target,
                        message,
                    }),
                };
            }
            return {
                mode: "direct",
                argv: dispatcher.buildDirectArgs({
                    channel: route.channel,
                    target: route.target,
                    message,
                }),
            };
        }
        const route = this.resolveRoute("agent");
        const context = buildTemplateContext(event, MAX_AGENT_PROMPT_CHARS);
        const prompt = renderTemplate(config.agentPromptTemplate, context);
        return {
            mode: "agent",
            argv: dispatcher.buildAgentArgs({
                agentId: this.effectiveAgentId,
                sessionId: config.agentSessionId,
                prompt,
                channel: route.kind === "explicit" ? route.channel : undefined,
                target: route.kind === "explicit" ? route.target : undefined,
                thinking: config.thinking,
            }),
        };
    }
    async ingestEventForTest(event) {
        await this.onInboundEvent(event);
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    async onInboundEvent(event) {
        const config = this.requireConfig();
        const eventType = event.event_type;
        this.state.setLastEvent(eventType, event.time_fired);
        if (eventType !== config.directEventType && eventType !== config.agentEventType) {
            return;
        }
        const deduper = this.requireDeduper();
        const limiter = this.requireLimiter();
        const queue = this.requireQueue();
        const dedupeKey = `${eventType}|${extractEventMessage(event)}`;
        if (deduper.shouldDrop(dedupeKey)) {
            this.state.setLastDispatch(this.resolveDispatchMode(eventType), "dropped:dedupe");
            return;
        }
        if (!limiter.allow()) {
            this.state.setLastDispatch(this.resolveDispatchMode(eventType), "dropped:rate_limit");
            return;
        }
        if (!queue.enqueue(event)) {
            this.state.setLastDispatch(this.resolveDispatchMode(eventType), "dropped:queue_full");
            this.state.setQueueDepth(queue.size);
            return;
        }
        this.state.setQueueDepth(queue.size);
    }
    async consumeEvent(event) {
        const config = this.requireConfig();
        const dispatcher = this.requireDispatcher();
        if (event.event_type === config.directEventType) {
            const route = this.resolveRoute("direct");
            const context = buildTemplateContext(event, MAX_DIRECT_MESSAGE_CHARS);
            const message = renderTemplate(config.directMessageTemplate, context);
            const result = route.kind === "explicit"
                ? await dispatcher.dispatchDirect({
                    channel: route.channel,
                    target: route.target,
                    message,
                })
                : await this.dispatchDirectViaLastRoute(message);
            if (result.ok) {
                this.state.setLastDispatch("direct_message", route.kind === "explicit" ? "ok" : "ok:last_route");
                return;
            }
            this.state.setLastDispatch("direct_message", `failed:${result.code}`);
            this.state.setLastError(result.error);
            this.deps.logger.warn?.(`ha-bridge direct dispatch failed${route.kind === "last" ? " (last route fallback)" : ""}: ${result.error ?? "unknown"}`);
            return;
        }
        if (event.event_type === config.agentEventType) {
            const route = this.resolveRoute("agent");
            const context = buildTemplateContext(event, MAX_AGENT_PROMPT_CHARS);
            const prompt = renderTemplate(config.agentPromptTemplate, context);
            const result = await this.dispatchAgentWithFallback({
                agentId: this.effectiveAgentId,
                sessionId: config.agentSessionId,
                prompt,
                channel: route.kind === "explicit" ? route.channel : undefined,
                target: route.kind === "explicit" ? route.target : undefined,
                thinking: config.thinking,
            });
            if (result.ok) {
                this.state.setLastDispatch("agent_rewrite", route.kind === "explicit" ? "ok" : "ok:last_route");
                return;
            }
            this.state.setLastDispatch("agent_rewrite", `failed:${result.code}`);
            this.state.setLastError(result.error);
            this.deps.logger.warn?.(`ha-bridge agent dispatch failed: ${result.error ?? "unknown"}`);
        }
    }
    resolveRoute(mode) {
        const config = this.requireConfig();
        if (mode === "direct") {
            const channel = config.directChannel ?? config.defaultChannel;
            const target = config.directTarget ?? config.defaultTarget;
            return this.toRoute(channel, target, "direct");
        }
        const channel = config.agentChannel ?? config.defaultChannel;
        const target = config.agentTarget ?? config.defaultTarget;
        return this.toRoute(channel, target, "agent");
    }
    async dispatchDirectViaLastRoute(message) {
        const dispatcher = this.requireDispatcher();
        const lastRoute = this.resolveLastDirectRoute();
        if (!lastRoute) {
            return {
                ok: false,
                argv: [],
                code: null,
                stdout: "",
                stderr: "",
                error: "missing last route: no previous channel/target found for direct fallback; configure route or send one chat first",
            };
        }
        return await dispatcher.dispatchDirect({
            channel: lastRoute.channel,
            target: lastRoute.target,
            message,
        });
    }
    async dispatchAgentWithFallback(params) {
        const dispatcher = this.requireDispatcher();
        const first = await dispatcher.dispatchAgent(params);
        if (first.ok) {
            return first;
        }
        if (!params.agentId) {
            return first;
        }
        if (!this.isUnknownAgentError(first)) {
            return first;
        }
        this.deps.logger.warn?.(`ha-bridge agentId "${params.agentId}" is invalid; retrying with default agent`);
        return await dispatcher.dispatchAgent({
            ...params,
            agentId: undefined,
        });
    }
    isUnknownAgentError(result) {
        const haystack = `${result.stderr}\n${result.stdout}\n${result.error ?? ""}`;
        return haystack.includes("Unknown agent id");
    }
    resolveLastDirectRoute() {
        const sessionKey = buildMainSessionKey(this.deps.gatewayConfig, this.effectiveAgentId);
        const storePath = resolveSessionStorePath(this.deps.gatewayConfig, this.effectiveAgentId);
        const route = loadLastRouteFromStore(storePath, sessionKey);
        if (route) {
            return route;
        }
        const fallback = findLatestDirectRouteFromAllAgents(resolveStateDirFromEnv());
        if (fallback) {
            this.deps.logger.warn?.(`ha-bridge direct last-route fallback using agent "${fallback.agentId}" from recent session`);
            return {
                channel: fallback.channel,
                target: fallback.target,
            };
        }
        this.deps.logger.debug?.(`ha-bridge direct last-route lookup failed: sessionKey=${sessionKey}, storePath=${storePath}`);
        return null;
    }
    resolveEffectiveAgent(config) {
        if (config.agentId) {
            return { agentId: config.agentId, source: "configured" };
        }
        const detectedAgent = detectDefaultAgentId(this.deps.gatewayConfig);
        if (detectedAgent) {
            return { agentId: detectedAgent, source: "detected" };
        }
        return { agentId: "main", source: "fallback" };
    }
    toRoute(channel, target, mode) {
        if (channel && target) {
            return { kind: "explicit", channel, target };
        }
        if (!channel && !target) {
            this.deps.logger.debug?.(`ha-bridge ${mode} route not configured, fallback to last channel`);
            return { kind: "last" };
        }
        throw new Error(`ha-bridge ${mode} route is invalid: channel/target must be set together`);
    }
    buildDryRunEvent(mode, message) {
        const config = this.requireConfig();
        return {
            event_type: mode === "direct" ? config.directEventType : config.agentEventType,
            time_fired: new Date().toISOString(),
            data: {
                message: message.slice(0, MAX_DIRECT_MESSAGE_CHARS),
            },
        };
    }
    resolveDispatchMode(eventType) {
        const config = this.requireConfig();
        return eventType === config.directEventType ? "direct_message" : "agent_rewrite";
    }
    requireConfig() {
        if (!this.config) {
            throw new Error("ha-bridge service is not running");
        }
        return this.config;
    }
    requireDeduper() {
        if (!this.deduper) {
            throw new Error("ha-bridge deduper is not initialized");
        }
        return this.deduper;
    }
    requireLimiter() {
        if (!this.limiter) {
            throw new Error("ha-bridge limiter is not initialized");
        }
        return this.limiter;
    }
    requireQueue() {
        if (!this.queue) {
            throw new Error("ha-bridge queue is not initialized");
        }
        return this.queue;
    }
    requireDispatcher() {
        if (!this.dispatcher) {
            throw new Error("ha-bridge dispatcher is not initialized");
        }
        return this.dispatcher;
    }
}
function asRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    return value;
}
function readAgentId(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed || undefined;
}
function detectDefaultAgentId(gatewayConfig) {
    const root = asRecord(gatewayConfig);
    const agents = asRecord(root.agents);
    const list = agents.list;
    if (!Array.isArray(list)) {
        return undefined;
    }
    for (const item of list) {
        const record = asRecord(item);
        if (record.default === true) {
            const id = readAgentId(record.id);
            if (id) {
                return id;
            }
        }
    }
    for (const item of list) {
        const id = readAgentId(asRecord(item).id);
        if (id) {
            return id;
        }
    }
    return undefined;
}
function readString(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed || undefined;
}
function normalizeAgentId(value) {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
        return "main";
    }
    const normalized = trimmed
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+/g, "")
        .replace(/-+$/g, "")
        .slice(0, 64);
    return normalized || "main";
}
function normalizeMainKey(value) {
    const normalized = value?.trim().toLowerCase();
    return normalized || "main";
}
function buildMainSessionKey(gatewayConfig, agentId) {
    const root = asRecord(gatewayConfig);
    const session = asRecord(root.session);
    const scope = readString(session.scope)?.toLowerCase();
    if (scope === "global") {
        return "global";
    }
    const mainKey = normalizeMainKey(readString(session.mainKey));
    return `agent:${normalizeAgentId(agentId)}:${mainKey}`;
}
function resolveStateDirFromEnv(env = process.env) {
    const override = env.OPENCLAW_STATE_DIR?.trim() || env.CLAWDBOT_STATE_DIR?.trim();
    if (override) {
        return resolveUserPath(override, env);
    }
    return path.join(resolveHomeDir(env), ".openclaw");
}
function resolveHomeDir(env = process.env) {
    const override = env.OPENCLAW_HOME?.trim() || env.HOME?.trim();
    if (override) {
        return path.resolve(override);
    }
    return os.homedir();
}
function resolveUserPath(input, env = process.env) {
    const trimmed = input.trim();
    if (!trimmed) {
        return "";
    }
    if (trimmed.startsWith("~")) {
        const suffix = trimmed.slice(1).replace(/^[/\\]+/, "");
        return path.resolve(path.join(resolveHomeDir(env), suffix));
    }
    return path.resolve(trimmed);
}
function resolveSessionStorePath(gatewayConfig, agentId) {
    const root = asRecord(gatewayConfig);
    const session = asRecord(root.session);
    const store = readString(session.store);
    const normalizedAgentId = normalizeAgentId(agentId);
    if (!store) {
        return path.join(resolveStateDirFromEnv(), "agents", normalizedAgentId, "sessions", "sessions.json");
    }
    if (store.includes("{agentId}")) {
        return resolveUserPath(store.replaceAll("{agentId}", normalizedAgentId));
    }
    return resolveUserPath(store);
}
function isDeliverableRoute(route) {
    const channel = route.channel.trim().toLowerCase();
    if (!channel) {
        return false;
    }
    if (channel === "last" || channel === "webchat" || channel === "none" || channel === "internal") {
        return false;
    }
    return Boolean(route.target.trim());
}
function pickRoute(channel, target) {
    const route = {
        channel: readString(channel) ?? "",
        target: readString(target) ?? "",
    };
    return isDeliverableRoute(route) ? route : null;
}
function loadLastRouteFromStore(storePath, sessionKey) {
    if (!storePath || !sessionKey) {
        return null;
    }
    let raw;
    try {
        raw = fs.readFileSync(storePath, "utf8");
    }
    catch {
        return null;
    }
    let store;
    try {
        store = JSON.parse(raw);
    }
    catch {
        return null;
    }
    const entry = asRecord(asRecord(store)[sessionKey]);
    if (!Object.keys(entry).length) {
        return null;
    }
    return firstRouteFromEntry(entry);
}
function loadJsonFile(filePath) {
    try {
        const raw = fs.readFileSync(filePath, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function pickRouteWithTimestamp(agentId, entry) {
    const route = firstRouteFromEntry(entry);
    if (!route) {
        return null;
    }
    const updatedAt = typeof entry.updatedAt === "number" ? entry.updatedAt : 0;
    return {
        agentId,
        channel: route.channel,
        target: route.target,
        updatedAt,
    };
}
function firstRouteFromEntry(entry) {
    const deliveryContext = asRecord(entry.deliveryContext);
    const candidates = [
        pickRoute(deliveryContext.channel, deliveryContext.to),
        pickRoute(entry.lastChannel, entry.lastTo),
        pickRoute(entry.channel, entry.lastTo),
        pickRoute(entry.channel, entry.to),
    ];
    for (const route of candidates) {
        if (route) {
            return route;
        }
    }
    return null;
}
function findLatestDirectRouteFromAllAgents(stateDir) {
    const agentsDir = path.join(stateDir, "agents");
    let entries;
    try {
        entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    }
    catch {
        return null;
    }
    let latest = null;
    for (const dirent of entries) {
        if (!dirent.isDirectory()) {
            continue;
        }
        const agentId = normalizeAgentId(dirent.name);
        const storePath = path.join(agentsDir, dirent.name, "sessions", "sessions.json");
        const store = asRecord(loadJsonFile(storePath));
        const key = `agent:${agentId}:main`;
        const entry = asRecord(store[key]);
        if (!Object.keys(entry).length) {
            continue;
        }
        const candidate = pickRouteWithTimestamp(agentId, entry);
        if (!candidate) {
            continue;
        }
        if (!latest || candidate.updatedAt > latest.updatedAt) {
            latest = candidate;
        }
    }
    return latest;
}
