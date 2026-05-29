import { useEffect, useState } from "react";
import { Drawer, Group, Stack, Table, Textarea } from "@mantine/core";
import { Edit3, Plus, Save, Trash2 } from "lucide-react";
import { apiJson } from "../api/client.ts";
import type {
  ArticleRuntimeProfileDetail,
  WeixinAccountProfile,
} from "../api/types.ts";
import { Button, Card, Input, Select } from "../components/ui.tsx";

interface AccountDraft {
  id: string;
  name: string;
  enabled: boolean;
  defaultArticleProfileId: string;
  displayName: string;
  positioning: string;
  audience: string;
  tone: string;
  titleStyle: string;
  forbiddenTopics: string;
  template: string;
  promptProfile: string;
  count: string;
}

export function AccountsWorkspace(
  { apiKey, accounts, profiles, onReload }: {
    apiKey: string;
    accounts: WeixinAccountProfile[];
    profiles: ArticleRuntimeProfileDetail[];
    onReload: () => Promise<void>;
  },
) {
  const [editing, setEditing] = useState<WeixinAccountProfile | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<AccountDraft>(() =>
    toDraft(null, profiles)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(toDraft(editing, profiles));
  }, [editing, profiles]);

  const openCreate = () => {
    setEditing(null);
    setDraft(toDraft(null, profiles));
    setCreating(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = JSON.stringify(fromDraft(draft));
      if (creating) {
        await apiJson("/api/config/weixin/accounts", apiKey, {
          method: "POST",
          body,
        });
      } else if (editing) {
        await apiJson(
          `/api/config/weixin/accounts/${encodeURIComponent(editing.id)}`,
          apiKey,
          { method: "PATCH", body },
        );
      }
      setCreating(false);
      setEditing(null);
      await onReload();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (account: WeixinAccountProfile) => {
    if (!confirm(`删除公众号账号「${account.name}」？不会删除部署密钥。`)) {
      return;
    }
    await apiJson(
      `/api/config/weixin/accounts/${encodeURIComponent(account.id)}`,
      apiKey,
      { method: "DELETE" },
    );
    await onReload();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--tp-ink)]">
              公众号账号
            </h2>
            <p className="tp-muted text-sm">
              管理每个账号的定位、受众、语气和默认文章方案。密钥仍在部署配置中。
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            新增账号
          </Button>
        </div>

        <Table striped highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>账号</Table.Th>
              <Table.Th>定位</Table.Th>
              <Table.Th>默认方案</Table.Th>
              <Table.Th>微信连接</Table.Th>
              <Table.Th>状态</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {accounts.map((account) => (
              <Table.Tr key={account.id}>
                <Table.Td>
                  <div className="font-medium text-[var(--tp-ink)]">
                    {account.name}
                  </div>
                  <div className="tp-muted text-xs">{account.id}</div>
                </Table.Td>
                <Table.Td className="max-w-[360px]">
                  <div className="truncate text-sm">
                    {textValue(account.brand.positioning) || "未配置定位"}
                  </div>
                  <div className="tp-muted truncate text-xs">
                    {textValue(account.brand.audience) || "未配置受众"}
                  </div>
                </Table.Td>
                <Table.Td>
                  {profileName(profiles, account.defaultArticleProfileId) ??
                    "默认文章方案"}
                </Table.Td>
                <Table.Td>
                  <div className="text-sm">
                    {account.relay?.configured ? "已配置" : "未配置"}
                  </div>
                  <div className="tp-muted text-xs">
                    {account.relay?.appIdMasked ?? "无脱敏 appId"}
                  </div>
                </Table.Td>
                <Table.Td>
                  {account.enabled ? "启用" : "停用"}
                </Table.Td>
                <Table.Td>
                  <Group justify="flex-end" gap="xs">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setCreating(false);
                        setEditing(account);
                      }}
                    >
                      <Edit3 className="size-3.5" />
                      编辑
                    </Button>
                    <Button
                      size="icon"
                      variant="danger"
                      onClick={() => remove(account)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-[var(--tp-ink)]">
          设计原则
        </h3>
        <div className="tp-muted mt-3 space-y-2 text-sm">
          <p>账号负责品牌和风格，文章方案负责流程参数。</p>
          <p>矩阵运行会为每个账号创建独立 run，避免产物和错误互相污染。</p>
          <p>真实发布仍需逐账号确认，第一版矩阵默认只跑 dry-run。</p>
        </div>
      </Card>

      <Drawer
        opened={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        title={creating ? "新增公众号账号" : "编辑公众号账号"}
        position="right"
        size="lg"
      >
        <Stack gap="sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="tp-muted text-xs font-medium">账号 ID</span>
              <Input
                value={draft.id}
                disabled={!creating}
                onChange={(event) =>
                  setDraft({ ...draft, id: event.currentTarget.value })}
              />
            </label>
            <label className="space-y-1.5">
              <span className="tp-muted text-xs font-medium">展示名称</span>
              <Input
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.currentTarget.value })}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) =>
                setDraft({ ...draft, enabled: event.currentTarget.checked })}
            />
            启用账号
          </label>
          <label className="space-y-1.5">
            <span className="tp-muted text-xs font-medium">默认文章方案</span>
            <Select
              value={draft.defaultArticleProfileId}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  defaultArticleProfileId: event.currentTarget.value,
                })}
            >
              <option value="">使用默认方案</option>
              {profiles.map((item) => (
                <option key={item.profile.id} value={item.profile.id}>
                  {item.profile.name}
                </option>
              ))}
            </Select>
          </label>
          <TextareaField
            label="账号定位"
            value={draft.positioning}
            onChange={(value) => setDraft({ ...draft, positioning: value })}
          />
          <TextareaField
            label="目标读者"
            value={draft.audience}
            onChange={(value) => setDraft({ ...draft, audience: value })}
          />
          <TextareaField
            label="语气风格"
            value={draft.tone}
            onChange={(value) => setDraft({ ...draft, tone: value })}
          />
          <TextareaField
            label="标题风格"
            value={draft.titleStyle}
            onChange={(value) => setDraft({ ...draft, titleStyle: value })}
          />
          <TextareaField
            label="禁区主题"
            value={draft.forbiddenTopics}
            onChange={(value) => setDraft({ ...draft, forbiddenTopics: value })}
            placeholder="每行一个，不希望账号触碰的内容方向"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className="tp-muted text-xs font-medium">模板覆盖</span>
              <Input
                value={draft.template}
                placeholder="minimal / dynamic"
                onChange={(event) =>
                  setDraft({ ...draft, template: event.currentTarget.value })}
              />
            </label>
            <label className="space-y-1.5">
              <span className="tp-muted text-xs font-medium">提示词风格</span>
              <Input
                value={draft.promptProfile}
                placeholder="technology / business"
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    promptProfile: event.currentTarget.value,
                  })}
              />
            </label>
            <label className="space-y-1.5">
              <span className="tp-muted text-xs font-medium">文章数</span>
              <Input
                type="number"
                min="1"
                max="50"
                value={draft.count}
                onChange={(event) =>
                  setDraft({ ...draft, count: event.currentTarget.value })}
              />
            </label>
          </div>
          <Group justify="flex-end">
            <Button
              variant="secondary"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              取消
            </Button>
            <Button onClick={save} disabled={saving}>
              <Save className="size-4" />
              保存
            </Button>
          </Group>
        </Stack>
      </Drawer>
    </div>
  );
}

function TextareaField(
  { label, value, onChange, placeholder }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  },
) {
  return (
    <label className="space-y-1.5">
      <span className="tp-muted text-xs font-medium">{label}</span>
      <Textarea
        value={value}
        placeholder={placeholder}
        autosize
        minRows={2}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function toDraft(
  account: WeixinAccountProfile | null,
  profiles: ArticleRuntimeProfileDetail[],
): AccountDraft {
  const brand = account?.brand ?? {};
  const defaults = account?.defaults ?? {};
  const defaultProfileId = account?.defaultArticleProfileId ??
    textValue(defaults.articleProfileId) ??
    profiles.find((item) => item.profile.isDefault)?.profile.id ??
    "";
  return {
    id: account?.id ?? "",
    name: account?.name ?? "",
    enabled: account?.enabled ?? true,
    defaultArticleProfileId: defaultProfileId,
    displayName: textValue(brand.displayName) ?? account?.name ?? "",
    positioning: textValue(brand.positioning) ?? "",
    audience: textValue(brand.audience) ?? "",
    tone: textValue(brand.tone) ?? "",
    titleStyle: textValue(brand.titleStyle) ?? "",
    forbiddenTopics: Array.isArray(brand.forbiddenTopics)
      ? brand.forbiddenTopics.filter((item): item is string =>
        typeof item === "string"
      ).join("\n")
      : "",
    template: textValue(defaults.template) ?? "",
    promptProfile: textValue(defaults.promptProfile) ?? "",
    count: typeof defaults.count === "number" ? String(defaults.count) : "",
  };
}

function fromDraft(draft: AccountDraft) {
  const count = Number(draft.count);
  return {
    id: draft.id.trim(),
    name: draft.name.trim(),
    enabled: draft.enabled,
    defaultArticleProfileId: draft.defaultArticleProfileId || undefined,
    brand: {
      displayName: draft.displayName.trim() || draft.name.trim(),
      positioning: draft.positioning.trim(),
      audience: draft.audience.trim(),
      tone: draft.tone.trim(),
      titleStyle: draft.titleStyle.trim(),
      forbiddenTopics: draft.forbiddenTopics.split(/\n+/).map((item) =>
        item.trim()
      ).filter(Boolean),
    },
    defaults: {
      articleProfileId: draft.defaultArticleProfileId || undefined,
      template: draft.template.trim() || undefined,
      promptProfile: draft.promptProfile.trim() || undefined,
      count: Number.isFinite(count) && count > 0 ? count : undefined,
    },
  };
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function profileName(
  profiles: ArticleRuntimeProfileDetail[],
  profileId?: string,
) {
  return profiles.find((item) => item.profile.id === profileId)?.profile.name;
}
