export function renderDashboardHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TrendPublish 运行看板</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
    body { margin: 0; background: #f6f7f9; color: #172033; }
    header { padding: 20px 28px; background: #ffffff; border-bottom: 1px solid #dde2ea; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    h1 { font-size: 20px; margin: 0; }
    main { display: grid; grid-template-columns: 360px 1fr; gap: 16px; padding: 16px; }
    input, button { font: inherit; }
    input { min-width: 280px; padding: 8px 10px; border: 1px solid #cbd3df; border-radius: 6px; }
    button { border: 1px solid #23324d; background: #23324d; color: white; padding: 8px 12px; border-radius: 6px; cursor: pointer; }
    button.secondary { background: #fff; color: #23324d; }
    .panel { background: #fff; border: 1px solid #dde2ea; border-radius: 8px; min-height: 160px; overflow: hidden; }
    .panel h2 { margin: 0; padding: 12px 14px; font-size: 15px; border-bottom: 1px solid #edf0f5; }
    .list { display: grid; }
    .run { padding: 12px 14px; border-bottom: 1px solid #edf0f5; cursor: pointer; }
    .run:hover, .run.active { background: #f1f5fb; }
    .meta { color: #627086; font-size: 12px; margin-top: 4px; line-height: 1.6; }
    .status { display: inline-flex; align-items: center; border-radius: 999px; padding: 2px 8px; font-size: 12px; background: #e9edf5; }
    .status.succeeded { background: #e5f6ec; color: #18713a; }
    .status.failed { background: #fdeaea; color: #a32626; }
    .status.running { background: #e8f1ff; color: #1e5aa8; }
    .content { padding: 14px; display: grid; gap: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; border-bottom: 1px solid #edf0f5; padding: 8px; vertical-align: top; }
    th { color: #627086; font-weight: 600; }
    pre { white-space: pre-wrap; background: #f6f7f9; padding: 12px; border-radius: 6px; overflow: auto; }
    a { color: #1d5fbf; text-decoration: none; }
    a:hover { text-decoration: underline; }
    @media (max-width: 860px) { main { grid-template-columns: 1fr; } header { display: block; } input { width: calc(100% - 24px); min-width: 0; margin-top: 12px; } }
  </style>
</head>
<body>
  <header>
    <h1>TrendPublish 运行看板</h1>
    <div>
      <input id="apiKey" type="password" placeholder="输入 server.apiKey">
      <button id="saveKey">保存</button>
      <button id="runDry" class="secondary">Dry-run</button>
      <button id="refresh" class="secondary">刷新</button>
    </div>
  </header>
  <main>
    <section class="panel">
      <h2>运行记录</h2>
      <div id="runs" class="list"></div>
    </section>
    <section class="panel">
      <h2>运行详情</h2>
      <div id="detail" class="content">请选择一条运行记录。</div>
    </section>
  </main>
  <script>
    const apiKeyInput = document.querySelector("#apiKey");
    const runsEl = document.querySelector("#runs");
    const detailEl = document.querySelector("#detail");
    let selectedRunId = "";
    apiKeyInput.value = sessionStorage.getItem("trendpublish_api_key") || "";
    document.querySelector("#saveKey").onclick = () => {
      sessionStorage.setItem("trendpublish_api_key", apiKeyInput.value.trim());
      loadRuns();
    };
    document.querySelector("#refresh").onclick = () => loadRuns();
    document.querySelector("#runDry").onclick = async () => {
      await api("/api/runs", { method: "POST", body: JSON.stringify({ dryRun: true }) });
      await loadRuns();
    };
    function authHeaders() {
      return {
        "Authorization": "Bearer " + (sessionStorage.getItem("trendpublish_api_key") || apiKeyInput.value.trim()),
        "Content-Type": "application/json",
      };
    }
    async function api(path, options = {}) {
      const res = await fetch(path, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
      if (!res.ok) throw new Error(await res.text());
      return await res.json();
    }
    async function loadRuns() {
      try {
        const data = await api("/api/runs");
        runsEl.innerHTML = data.runs.map(run => '<div class="run ' + (run.runId === selectedRunId ? 'active' : '') + '" data-id="' + run.runId + '"><strong>' + run.runId + '</strong><div><span class="status ' + run.status + '">' + run.status + '</span></div><div class="meta">' + run.mode + ' · ' + run.trigger + ' · ' + run.createdAt + '</div></div>').join("") || '<div class="run">暂无运行记录</div>';
        runsEl.querySelectorAll(".run[data-id]").forEach(item => item.onclick = () => loadDetail(item.dataset.id));
        if (!selectedRunId && data.runs[0]) await loadDetail(data.runs[0].runId);
      } catch (error) {
        runsEl.innerHTML = '<div class="run">加载失败：' + escapeHtml(error.message) + '</div>';
      }
    }
    async function loadDetail(runId) {
      selectedRunId = runId;
      const data = await api("/api/runs/" + encodeURIComponent(runId));
      const run = data.run;
      const artifactRows = (run.artifacts || []).map(artifact => '<tr><td>' + escapeHtml(artifact.label || artifact.key) + '</td><td>' + escapeHtml(artifact.contentType) + '</td><td><a href="/api/artifacts?key=' + encodeURIComponent(artifact.key) + '" target="_blank">' + escapeHtml(artifact.key) + '</a></td></tr>').join("");
      const stepRows = (run.steps || []).map(step => '<tr><td>' + escapeHtml(step.name) + '</td><td><span class="status ' + step.status + '">' + step.status + '</span></td><td>' + (step.durationMs ?? "") + '</td><td>' + escapeHtml(step.error || "") + '</td></tr>').join("");
      detailEl.innerHTML = '<div><span class="status ' + run.status + '">' + run.status + '</span><div class="meta">' + run.createdAt + ' / ' + (run.finishedAt || '-') + '</div></div>' +
        (run.summary ? '<pre>' + escapeHtml(run.summary) + '</pre>' : '') +
        (run.error ? '<pre>' + escapeHtml(run.error) + '</pre>' : '') +
        '<h3>步骤</h3><table><thead><tr><th>名称</th><th>状态</th><th>耗时(ms)</th><th>错误</th></tr></thead><tbody>' + stepRows + '</tbody></table>' +
        '<h3>产物</h3><table><thead><tr><th>名称</th><th>类型</th><th>Key</th></tr></thead><tbody>' + artifactRows + '</tbody></table>';
      await loadRuns();
    }
    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    }
    loadRuns();
  </script>
</body>
</html>`;
}
