import { type ReactNode, useState } from "react";
import { ListChecks, Newspaper, Route, ShieldCheck } from "lucide-react";

export type ArticleQualityTab = "review" | "topics" | "decision" | "plan";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function statusTone(status?: string) {
  if (status === "succeeded") {
    return "border-[#bbf7d0] bg-[#ecfdf5] text-[#047857]";
  }
  if (status === "failed" || status === "cancelled") {
    return "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]";
  }
  if (status === "running" || status === "queued") {
    return "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]";
  }
  return "border-[#e2e8f0] bg-[#f8fafc] text-[#475569]";
}

export function ArticleQualityShell(
  {
    runStatus,
    renderTab,
  }: {
    runStatus?: string;
    renderTab: (tab: ArticleQualityTab) => ReactNode;
  },
) {
  const [activeTab, setActiveTab] = useState<ArticleQualityTab>("review");
  const tabs: Array<{
    id: ArticleQualityTab;
    label: string;
    description: string;
    icon: ReactNode;
  }> = [
    {
      id: "review",
      label: "审稿",
      description: "质量分、问题和发布门禁",
      icon: <ShieldCheck className="size-4" />,
    },
    {
      id: "topics",
      label: "选题",
      description: "主题聚类和候选主线",
      icon: <Newspaper className="size-4" />,
    },
    {
      id: "decision",
      label: "决策",
      description: "为什么写、为什么跳过",
      icon: <Route className="size-4" />,
    },
    {
      id: "plan",
      label: "计划",
      description: "章节、标题和风险边界",
      icon: <ListChecks className="size-4" />,
    },
  ];

  return (
    <div className="space-y-4">
      <section className="tp-command rounded-lg border p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck className="size-4 text-[#2563eb]" />
              <h2 className="tp-title text-base font-semibold">
                文章质量工作区
              </h2>
            </div>
            <p className="tp-muted text-sm leading-6">
              默认先看审稿结果；需要追溯原因时，再查看选题、编辑决策和文章计划。
              这里展示的是同一次运行的产物，不影响已经生成的草稿。
            </p>
          </div>
          <span
            className={cx(
              "inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium",
              statusTone(runStatus),
            )}
          >
            {runStatus ?? "no run"}
          </span>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cx(
                "rounded-md border p-3 text-left transition",
                activeTab === tab.id
                  ? "border-[#2563eb] bg-[#2563eb] text-white"
                  : "border-[#e2e8f0] bg-white text-[#334155] hover:bg-[#f8fafc]",
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={cx(
                    "grid size-7 place-items-center rounded-md",
                    activeTab === tab.id
                      ? "bg-white/15"
                      : "bg-[#eff6ff] text-[#2563eb]",
                  )}
                >
                  {tab.icon}
                </span>
                <span className="text-sm font-semibold">{tab.label}</span>
              </div>
              <div
                className={cx(
                  "text-xs leading-5",
                  activeTab === tab.id ? "text-[#dbeafe]" : "text-[#64748b]",
                )}
              >
                {tab.description}
              </div>
            </button>
          ))}
        </div>
      </section>

      {renderTab(activeTab)}
    </div>
  );
}
