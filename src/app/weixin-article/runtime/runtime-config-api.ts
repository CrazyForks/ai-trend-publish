import type {
  CapabilityKind,
  CapabilityProfile,
  JsonObject,
  JsonValue,
  RuntimeArticleSourceInput,
  RuntimeConfigStore,
} from "@src/core/ports/runtime-config-store.ts";
import type {
  FetchProviderName,
  ResolvedTrendPublishConfig,
} from "@src/utils/config/define-config.ts";
import {
  createArticleRuntimeProfile,
  getArticleRuntimeProfileDetail,
  listArticleRuntimeProfiles,
  parseSourcesForRuntime,
  saveArticleProfileConfig,
  seedArticleRuntimeConfig,
} from "@src/app/weixin-article/runtime/article-runtime-config.service.ts";
import { ARTICLE_FEATURE_KEY } from "@src/app/weixin-article/runtime/article-runtime-config.ts";
import { isCronDue } from "@src/core/storage/runtime-config-utils.ts";

export async function handleRuntimeConfigApi(
  request: Request,
  pathname: string,
  store: RuntimeConfigStore,
  baseConfig: ResolvedTrendPublishConfig,
): Promise<Response | null> {
  await seedArticleRuntimeConfig(store, baseConfig);

  if (pathname === "/api/config/providers" && request.method === "GET") {
    return jsonResponse({ providers: createProviderStatus(baseConfig) });
  }

  if (pathname === "/api/config/capabilities") {
    if (request.method === "GET") {
      const kind = new URL(request.url).searchParams.get("kind");
      const capabilities = await store.listCapabilityProfiles(
        isCapabilityKind(kind) ? kind : undefined,
      );
      return jsonResponse({ capabilities });
    }
    if (request.method === "POST") {
      const body = await requestJson<JsonObject>(request);
      const capabilityIssues = validateCapabilityBody(body);
      if (capabilityIssues.length > 0) {
        return validationResponse(capabilityIssues);
      }
      const input = capabilityFromBody(body);
      const issues = validateCapability(input);
      if (issues.length > 0) return validationResponse(issues);
      const capability = await store.saveCapabilityProfile(input);
      return jsonResponse({ capability }, 201);
    }
  }

  const capabilityMatch = pathname.match(
    /^\/api\/config\/capabilities\/([^/]+)$/,
  );
  if (capabilityMatch) {
    const id = decodeURIComponent(capabilityMatch[1]);
    if (request.method === "GET") {
      const capability = await store.getCapabilityProfile(id);
      return capability
        ? jsonResponse({ capability })
        : jsonResponse({ error: "能力 Profile 不存在" }, 404);
    }
    if (request.method === "PATCH") {
      const existing = await store.getCapabilityProfile(id);
      if (!existing) return jsonResponse({ error: "能力 Profile 不存在" }, 404);
      const body = await requestJson<JsonObject>(request);
      const input = {
        ...existing,
        ...capabilityPatchFromBody(existing, body),
      };
      const issues = validateCapability(input);
      if (issues.length > 0) return validationResponse(issues);
      const capability = await store.saveCapabilityProfile(input);
      return jsonResponse({ capability });
    }
    if (request.method === "DELETE") {
      return jsonResponse({ deleted: await store.deleteCapabilityProfile(id) });
    }
  }

  if (pathname === "/api/config/features/article/profiles") {
    if (request.method === "GET") {
      const profiles = await listArticleRuntimeProfiles(store, baseConfig);
      return jsonResponse({ profiles });
    }
    if (request.method === "POST") {
      const body = await requestJson<JsonObject>(request);
      const profile = await createArticleRuntimeProfile(store, baseConfig, {
        name: stringValue(body.name),
        copyFromProfileId: stringValue(body.copyFromProfileId),
      });
      return jsonResponse({ profile }, 201);
    }
  }

  const profileMatch = pathname.match(
    /^\/api\/config\/features\/article\/profiles\/([^/]+)(?:\/([^/]+))?$/,
  );
  if (!profileMatch) return null;

  const profileId = decodeURIComponent(profileMatch[1]);
  const section = profileMatch[2];

  if (!section) {
    if (request.method === "GET") {
      return jsonResponse({
        profile: await getArticleRuntimeProfileDetail(
          store,
          baseConfig,
          profileId,
        ),
      });
    }
    if (request.method === "PATCH") {
      const current = await getArticleRuntimeProfileDetail(
        store,
        baseConfig,
        profileId,
      );
      const body = await requestJson<JsonObject>(request);
      if (
        current.profile.isDefault && booleanValue(body.isDefault) === false
      ) {
        return jsonResponse({
          error: "默认 Profile 不能直接取消；请把另一个 Profile 设为默认",
        }, 400);
      }
      const nextProfile = await store.saveFeatureProfile({
        ...current.profile,
        name: stringValue(body.name) ?? current.profile.name,
        enabled: booleanValue(body.enabled) ?? current.profile.enabled,
        isDefault: booleanValue(body.isDefault) ?? current.profile.isDefault,
      });
      const articlePatch = objectValue(body.article) ??
        objectValue(body.config);
      if (articlePatch) {
        const issues = await validateArticlePatch(store, articlePatch);
        if (issues.length > 0) return validationResponse(issues);
        return jsonResponse({
          profile: await saveArticleProfileConfig(
            store,
            baseConfig,
            nextProfile.id,
            articlePatch,
          ),
        });
      }
      return jsonResponse({
        profile: await getArticleRuntimeProfileDetail(
          store,
          baseConfig,
          nextProfile.id,
        ),
      });
    }
    if (request.method === "DELETE") {
      const current = await getArticleRuntimeProfileDetail(
        store,
        baseConfig,
        profileId,
      );
      const profiles = await store.listFeatureProfiles(ARTICLE_FEATURE_KEY);
      if (current.profile.isDefault) {
        return jsonResponse({ error: "默认 Profile 不能删除" }, 400);
      }
      if (profiles.length <= 1) {
        return jsonResponse({ error: "至少需要保留一个 Profile" }, 400);
      }
      return jsonResponse({
        deleted: await store.deleteFeatureProfile(
          ARTICLE_FEATURE_KEY,
          profileId,
        ),
      });
    }
  }

  if (section === "sources" && request.method === "PUT") {
    const body = await requestJson<JsonObject>(request);
    const issues = validateSourcesInput(body.sources);
    if (issues.length > 0) return validationResponse(issues);
    const sources = normalizeSourceInput(body.sources);
    await store.replaceArticleSources(profileId, sources);
    return jsonResponse({
      profile: await getArticleRuntimeProfileDetail(
        store,
        baseConfig,
        profileId,
      ),
    });
  }

  if (section === "fetch-groups" && request.method === "PUT") {
    const body = await requestJson<JsonObject>(request);
    const fetchGroups = objectValue(body.fetchGroups) ??
      objectValue(body.groups) ?? {};
    const issues = validateFetchGroupsInput(fetchGroups);
    if (issues.length > 0) return validationResponse(issues);
    await store.replaceArticleFetchGroups(
      profileId,
      normalizeFetchGroupsInput(fetchGroups),
    );
    return jsonResponse({
      profile: await getArticleRuntimeProfileDetail(
        store,
        baseConfig,
        profileId,
      ),
    });
  }

  if (section === "schedule" && request.method === "PUT") {
    const current = await getArticleRuntimeProfileDetail(
      store,
      baseConfig,
      profileId,
    );
    const body = await requestJson<JsonObject>(request);
    const issues = validateScheduleInput(body, current.schedule?.cron);
    if (issues.length > 0) return validationResponse(issues);
    await store.saveSchedule({
      id: current.schedule?.id,
      featureKey: ARTICLE_FEATURE_KEY,
      profileId,
      name: stringValue(body.name) ?? current.schedule?.name ??
        `${current.profile.name} 定时`,
      enabled: booleanValue(body.enabled) ?? current.schedule?.enabled ?? true,
      cron: stringValue(body.cron) ?? current.schedule?.cron ?? "0 3 * * *",
      timezone: stringValue(body.timezone) ?? current.schedule?.timezone ??
        "Asia/Shanghai",
      dryRun: booleanValue(body.dryRun) ?? current.schedule?.dryRun ??
        current.article.dryRun,
    });
    return jsonResponse({
      profile: await getArticleRuntimeProfileDetail(
        store,
        baseConfig,
        profileId,
      ),
    });
  }

  return jsonResponse({ error: "无效的运行时配置 API" }, 404);
}

export function createProviderStatus(config: ResolvedTrendPublishConfig) {
  return {
    ai: {
      configured: Boolean(
        config.providers.ai.baseUrl && config.providers.ai.apiKey,
      ),
      model: config.providers.ai.model,
    },
    fetch: {
      firecrawl: Boolean(config.providers.fetch.firecrawl.apiKey),
      jina: Boolean(config.providers.fetch.jina.apiKey),
      twitter: Boolean(
        config.providers.fetch.twitter.bearerToken ||
          config.providers.fetch.twitter.xquikApiKey,
      ),
      rss: Boolean(config.providers.fetch.rss.baseUrl),
    },
    image: {
      dashscope: Boolean(config.providers.image.dashscope.apiKey),
      minimax: Boolean(config.providers.image.minimax.apiKey),
    },
    publish: {
      weixin: Boolean(
        config.providers.publish.weixin.appId &&
          config.providers.publish.weixin.appSecret,
      ),
      weixinRelay: Boolean(
        config.providers.publish.weixinRelay.url &&
          config.providers.publish.weixinRelay.token,
      ),
    },
    notify: {
      bark: Boolean(config.providers.notify.bark.url),
      dingtalk: Boolean(config.providers.notify.dingtalk.webhook),
      feishu: Boolean(config.providers.notify.feishu.webhookUrl),
    },
    vector: {
      embedding: Boolean(config.providers.vector.embedding.apiKey),
      store: config.storage.vector.provider,
    },
  };
}

function capabilityFromBody(
  body: JsonObject,
): Omit<CapabilityProfile, "createdAt" | "updatedAt"> {
  const kind = stringValue(body.kind);
  return {
    id: stringValue(body.id) ?? `cap-${crypto.randomUUID()}`,
    kind: kind as CapabilityKind,
    name: stringValue(body.name) ?? "未命名能力",
    enabled: booleanValue(body.enabled) ?? true,
    provider: stringValue(body.provider) ?? "",
    config: objectValue(body.config) ?? {},
    version: numberValue(body.version) ?? 1,
    isDefault: booleanValue(body.isDefault) ?? false,
  };
}

function capabilityPatchFromBody(
  existing: CapabilityProfile,
  body: JsonObject,
): Partial<CapabilityProfile> {
  return {
    kind: isCapabilityKind(stringValue(body.kind))
      ? stringValue(body.kind) as CapabilityKind
      : existing.kind,
    name: stringValue(body.name) ?? existing.name,
    enabled: booleanValue(body.enabled) ?? existing.enabled,
    provider: stringValue(body.provider) ?? existing.provider,
    config: objectValue(body.config) ?? existing.config,
    version: numberValue(body.version) ?? existing.version,
    isDefault: booleanValue(body.isDefault) ?? existing.isDefault,
  };
}

interface ValidationIssue {
  path: string;
  message: string;
}

function validationResponse(issues: ValidationIssue[]): Response {
  return jsonResponse({ error: "运行时配置校验失败", issues }, 400);
}

function validateCapability(
  profile: Partial<CapabilityProfile>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!stringValue(profile.id)) {
    issues.push({ path: "id", message: "能力 Profile id 不能为空" });
  }
  if (!isCapabilityKind(profile.kind)) {
    issues.push({ path: "kind", message: "kind 必须是有效的能力类型" });
  }
  if (!stringValue(profile.name)) {
    issues.push({ path: "name", message: "能力名称不能为空" });
  }
  if (!stringValue(profile.provider)) {
    issues.push({ path: "provider", message: "provider 不能为空" });
  }
  if (!objectValue(profile.config)) {
    issues.push({ path: "config", message: "config 必须是对象" });
  }

  const provider = stringValue(profile.provider);
  switch (profile.kind) {
    case "llm":
      if (provider && provider !== "openai-compatible") {
        issues.push({
          path: "provider",
          message: "LLM 当前只支持 openai-compatible",
        });
      }
      break;
    case "image-generation":
      if (provider && provider !== "dashscope" && provider !== "minimax") {
        issues.push({
          path: "provider",
          message: "图片生成当前支持 dashscope 或 minimax",
        });
      }
      validateImageConfig(profile.config, "config", issues);
      break;
    case "notification":
      if (provider && provider !== "multi-channel") {
        issues.push({
          path: "provider",
          message: "通知能力当前只支持 multi-channel",
        });
      }
      validateNotificationConfig(profile.config, "config", issues);
      break;
    case "fetch-strategy":
      if (provider && provider !== "configured-fetch-groups") {
        issues.push({
          path: "provider",
          message: "抓取策略当前只支持 configured-fetch-groups",
        });
      }
      break;
    case "embedding":
      if (provider && provider !== "dashscope") {
        issues.push({
          path: "provider",
          message: "Embedding 当前只支持 dashscope",
        });
      }
      break;
  }
  return issues;
}

function validateCapabilityBody(body: JsonObject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isCapabilityKind(stringValue(body.kind))) {
    issues.push({ path: "kind", message: "kind 必须是有效的能力类型" });
  }
  const config = body.config;
  if (config !== undefined && !objectValue(config)) {
    issues.push({ path: "config", message: "config 必须是对象" });
  }
  return issues;
}

async function validateArticlePatch(
  store: RuntimeConfigStore,
  patch: JsonObject,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  if (patch.count !== undefined) {
    const count = numberValue(patch.count);
    if (!count || count < 1 || count > 50 || !Number.isInteger(count)) {
      issues.push({
        path: "article.count",
        message: "文章数量必须是 1-50 的整数",
      });
    }
  }

  const renderer = objectValue(patch.renderer);
  if (renderer) {
    validateStringEnum(
      renderer.template,
      "article.renderer.template",
      [
        "default",
        "minimal",
        "modern",
        "tech",
        "mianpro",
        "longform",
        "product",
        "darktech",
        "dynamic",
        "random",
      ],
      issues,
    );
    validateStringEnum(
      renderer.promptProfile,
      "article.renderer.promptProfile",
      ["technology", "general", "business", "product", "developer", "research"],
      issues,
    );
    await validateCapabilityReference(
      store,
      renderer.llmProfileId,
      "llm",
      "article.renderer.llmProfileId",
      issues,
    );
  }

  const publisher = objectValue(patch.publisher);
  if (publisher) {
    validateStringEnum(
      publisher.provider,
      "article.publisher.provider",
      ["weixin", "weixin-relay"],
      issues,
    );
  }

  const cover = objectValue(patch.cover);
  if (cover) {
    await validateCapabilityReference(
      store,
      cover.imageProfileId,
      "image-generation",
      "article.cover.imageProfileId",
      issues,
    );
  }

  const bodyImages = objectValue(patch.bodyImages);
  if (bodyImages) {
    validateStringEnum(
      bodyImages.mode,
      "article.bodyImages.mode",
      ["off", "missing", "all"],
      issues,
    );
    await validateCapabilityReference(
      store,
      bodyImages.imageProfileId,
      "image-generation",
      "article.bodyImages.imageProfileId",
      issues,
    );
    validateImageConfig(
      objectValue(bodyImages.overrides),
      "article.bodyImages.overrides",
      issues,
    );
  }

  const deduplication = objectValue(patch.deduplication);
  if (deduplication) {
    await validateCapabilityReference(
      store,
      deduplication.embeddingProfileId,
      "embedding",
      "article.deduplication.embeddingProfileId",
      issues,
    );
    validateStringEnum(
      deduplication.vectorStore,
      "article.deduplication.vectorStore",
      ["sqlite", "d1"],
      issues,
    );
  }

  const notifications = objectValue(patch.notifications);
  if (notifications) {
    await validateCapabilityReference(
      store,
      notifications.profileId,
      "notification",
      "article.notifications.profileId",
      issues,
      true,
    );
  }
  return issues;
}

async function validateCapabilityReference(
  store: RuntimeConfigStore,
  value: JsonValue | undefined,
  expectedKind: CapabilityKind,
  path: string,
  issues: ValidationIssue[],
  optional = false,
): Promise<void> {
  const id = stringValue(value);
  if (!id) {
    if (!optional && value !== undefined) {
      issues.push({ path, message: "能力 Profile id 不能为空" });
    }
    return;
  }
  const profile = await store.getCapabilityProfile(id);
  if (!profile) {
    issues.push({ path, message: `能力 Profile 不存在: ${id}` });
    return;
  }
  if (profile.kind !== expectedKind) {
    issues.push({
      path,
      message: `能力 Profile 类型应为 ${expectedKind}，实际为 ${profile.kind}`,
    });
  }
}

function validateSourcesInput(value: unknown): ValidationIssue[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [{ path: "sources", message: "数据源不能为空" }];
  }
  if (value.every((item) => typeof item === "string")) {
    try {
      parseSourcesForRuntime(value);
      return [];
    } catch (error) {
      return [{
        path: "sources",
        message: error instanceof Error ? error.message : String(error),
      }];
    }
  }

  const issues: ValidationIssue[] = [];
  value.forEach((item, index) => {
    const source = objectValue(item);
    if (!source) {
      issues.push({
        path: `sources.${index}`,
        message: "数据源必须是字符串或对象",
      });
      return;
    }
    const url = stringValue(source.url);
    if (!url || !isHttpUrl(url)) {
      issues.push({
        path: `sources.${index}.url`,
        message: "数据源 URL 必须是 http/https",
      });
    }
    const group = stringValue(source.group) ?? "default";
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(group)) {
      issues.push({
        path: `sources.${index}.group`,
        message: "数据源分组名无效",
      });
    }
  });
  return issues;
}

function validateFetchGroupsInput(value: JsonObject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [name, providers] of Object.entries(value)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
      issues.push({ path: `fetchGroups.${name}`, message: "抓取分组名无效" });
    }
    if (!Array.isArray(providers) || providers.length === 0) {
      issues.push({
        path: `fetchGroups.${name}`,
        message: "抓取分组至少需要一个 provider",
      });
      continue;
    }
    providers.forEach((provider, index) => {
      if (!isFetchProviderName(provider)) {
        issues.push({
          path: `fetchGroups.${name}.${index}`,
          message: "未知抓取 provider",
        });
      }
    });
  }
  return issues;
}

function validateScheduleInput(
  body: JsonObject,
  fallbackCron?: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cron = stringValue(body.cron) ?? fallbackCron ?? "0 3 * * *";
  const timezone = stringValue(body.timezone) ?? "Asia/Shanghai";
  try {
    isCronDue(cron, new Date(), timezone);
  } catch (error) {
    issues.push({
      path: error instanceof RangeError ? "timezone" : "cron",
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return issues;
}

function validateImageConfig(
  config: JsonObject | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!config) return;
  if (config.count !== undefined) {
    const count = numberValue(config.count);
    if (!count || count < 1 || count > 4 || !Number.isInteger(count)) {
      issues.push({
        path: `${path}.count`,
        message: "图片数量必须是 1-4 的整数",
      });
    }
  }
  if (config.size !== undefined && !isImageSize(config.size)) {
    issues.push({
      path: `${path}.size`,
      message: "图片尺寸格式应为 1024*1024",
    });
  }
}

function validateNotificationConfig(
  config: JsonObject | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!config?.channels) return;
  if (!Array.isArray(config.channels)) {
    issues.push({
      path: `${path}.channels`,
      message: "通知 channels 必须是数组",
    });
    return;
  }
  config.channels.forEach((channel, index) => {
    if (channel !== "bark" && channel !== "dingtalk" && channel !== "feishu") {
      issues.push({
        path: `${path}.channels.${index}`,
        message: "未知通知渠道",
      });
    }
  });
}

function validateStringEnum(
  value: JsonValue | undefined,
  path: string,
  allowed: string[],
  issues: ValidationIssue[],
): void {
  if (value === undefined) return;
  if (typeof value !== "string" || !allowed.includes(value)) {
    issues.push({ path, message: `必须是以下值之一: ${allowed.join(", ")}` });
  }
}

function isFetchProviderName(value: unknown): value is FetchProviderName {
  return value === "auto" || value === "firecrawl" || value === "jina" ||
    value === "twitter" || value === "rss";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isImageSize(value: unknown): boolean {
  return typeof value === "string" && /^\d{2,5}\*\d{2,5}$/.test(value);
}

function normalizeSourceInput(value: unknown): RuntimeArticleSourceInput[] {
  if (!Array.isArray(value)) return [];
  if (value.every((item) => typeof item === "string")) {
    return parseSourcesForRuntime(value);
  }
  return value
    .filter((item): item is JsonObject =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
    )
    .map((item, index) => ({
      raw: stringValue(item.raw) ?? stringValue(item.url) ?? "",
      url: stringValue(item.url) ?? "",
      group: stringValue(item.group) ?? "default",
      enabled: booleanValue(item.enabled) ?? true,
      position: numberValue(item.position) ?? index,
    }))
    .filter((item) => item.raw && item.url);
}

function normalizeFetchGroupsInput(
  value: JsonObject,
): Record<string, FetchProviderName[]> {
  const result: Record<string, FetchProviderName[]> = {};
  for (const [name, providers] of Object.entries(value)) {
    if (!Array.isArray(providers)) continue;
    result[name] = providers
      .filter((item): item is FetchProviderName =>
        item === "auto" || item === "firecrawl" || item === "jina" ||
        item === "twitter" || item === "rss"
      );
  }
  return result;
}

async function requestJson<T>(request: Request): Promise<T> {
  return await request.json().catch(() => ({})) as T;
}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function isCapabilityKind(value: unknown): value is CapabilityKind {
  return value === "llm" || value === "image-generation" ||
    value === "notification" || value === "fetch-strategy" ||
    value === "embedding";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function objectValue(value: unknown): JsonObject | undefined {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}
