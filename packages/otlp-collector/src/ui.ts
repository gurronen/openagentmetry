import type { ResolvedCollectorConfig } from "./config";

export const renderAppHtml = (config: ResolvedCollectorConfig): string => {
  const now = Date.now();
  const start = new Date(now - config.defaultSearchLookbackMs).toISOString().slice(0, 16);
  const end = new Date(now).toISOString().slice(0, 16);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenAgentmetry Collector</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main class="layout">
      <section class="sidebar">
        <h1>OpenAgentmetry</h1>
        <p class="muted">Local OTLP collector on <code>${config.host}:${config.port}</code></p>
        <form id="search-form" class="panel">
          <label>Service <select id="service" name="service"><option value="">All services</option></select></label>
          <label>Operation <select id="operation" name="operation"><option value="">All operations</option></select></label>
          <label>Trace ID <input id="trace-id" name="traceId" placeholder="hex trace id" /></label>
          <label>Start <input id="start" name="start" type="datetime-local" value="${start}" /></label>
          <label>End <input id="end" name="end" type="datetime-local" value="${end}" /></label>
          <label>Min Duration (ms) <input id="min-duration" name="minDurationMs" type="number" min="0" step="1" /></label>
          <label>Max Duration (ms) <input id="max-duration" name="maxDurationMs" type="number" min="0" step="1" /></label>
          <label>Session ID <input id="attr-session" name="attr.ai.session.id" placeholder="optional" /></label>
          <label>Tool Name <input id="attr-tool" name="attr.ai.tool.name" placeholder="optional" /></label>
          <label>Model Name <input id="attr-model" name="attr.ai.model.name" placeholder="optional" /></label>
          <button type="submit">Search traces</button>
        </form>
      </section>

      <section class="content">
        <div class="split">
          <section class="panel list-panel">
            <div class="panel-header">
              <h2>Traces</h2>
              <span id="results-count" class="muted">0 results</span>
            </div>
            <div id="results" class="results"></div>
          </section>
          <section class="panel detail-panel">
            <div class="panel-header">
              <h2>Trace detail</h2>
              <span id="detail-summary" class="muted">Select a trace</span>
            </div>
            <div id="detail" class="detail-empty">No trace selected yet.</div>
          </section>
        </div>
      </section>
    </main>
    <script type="module" src="/app.js"></script>
  </body>
</html>`;
};

export const appStyles = `
:root {
  color-scheme: light;
  --bg: #f3efe6;
  --paper: rgba(255, 252, 246, 0.92);
  --ink: #1f2a2e;
  --muted: #647076;
  --line: rgba(31, 42, 46, 0.12);
  --accent: #0b7a75;
  --accent-soft: rgba(11, 122, 117, 0.12);
  --error: #bf3b3b;
  --shadow: 0 20px 50px rgba(68, 56, 35, 0.12);
}
* { box-sizing: border-box; }
body { margin: 0; font-family: Georgia, "Iowan Old Style", serif; color: var(--ink); background: radial-gradient(circle at top, #fff7ec 0, var(--bg) 45%, #e9e1d5 100%); }
.layout { display: grid; grid-template-columns: 340px 1fr; min-height: 100vh; gap: 20px; padding: 20px; }
.sidebar, .panel { background: var(--paper); border: 1px solid var(--line); border-radius: 22px; box-shadow: var(--shadow); backdrop-filter: blur(14px); }
.sidebar { padding: 22px; }
.panel { padding: 18px; }
.panel-header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.content { min-width: 0; }
.split { display: grid; grid-template-columns: minmax(320px, 420px) minmax(0, 1fr); gap: 20px; min-height: calc(100vh - 40px); }
h1, h2, h3 { margin: 0 0 8px; font-weight: 600; }
.muted, code { color: var(--muted); }
form { display: grid; gap: 12px; }
label { display: grid; gap: 6px; font-size: 0.95rem; }
input, select, button, textarea { font: inherit; }
input, select { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; background: #fffdf8; }
button { border: 0; border-radius: 999px; padding: 12px 16px; background: linear-gradient(135deg, var(--accent), #125f9f); color: white; cursor: pointer; }
.results { display: grid; gap: 10px; max-height: calc(100vh - 120px); overflow: auto; }
.result { border: 1px solid var(--line); border-radius: 16px; padding: 14px; background: rgba(255,255,255,0.7); cursor: pointer; }
.result.active { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: var(--accent-soft); }
.result-title { display: flex; justify-content: space-between; gap: 12px; font-weight: 600; }
.meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.chip { border-radius: 999px; padding: 4px 8px; background: rgba(31, 42, 46, 0.08); font-size: 0.82rem; }
.chip.error { background: rgba(191, 59, 59, 0.15); color: var(--error); }
.detail-empty { color: var(--muted); padding: 30px 0; }
.trace-layout { display: grid; gap: 16px; }
.trace-grid { display: grid; grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); gap: 16px; }
.span-tree, .waterfall { border: 1px solid var(--line); border-radius: 16px; overflow: auto; max-height: 60vh; background: rgba(255,255,255,0.62); }
.span-row { display: grid; grid-template-columns: 1fr auto; gap: 12px; padding: 8px 12px; border-bottom: 1px solid rgba(31,42,46,0.06); cursor: pointer; }
.span-row.active, .waterfall-row.active { background: var(--accent-soft); }
.waterfall-row { position: relative; height: 34px; border-bottom: 1px solid rgba(31,42,46,0.06); cursor: pointer; }
.bar { position: absolute; top: 8px; height: 18px; border-radius: 999px; background: linear-gradient(90deg, var(--accent), #125f9f); }
.span-details { border: 1px solid var(--line); border-radius: 16px; padding: 14px; background: rgba(255,255,255,0.62); }
.kv { display: grid; grid-template-columns: 180px 1fr; gap: 8px; font-size: 0.9rem; }
pre { white-space: pre-wrap; word-break: break-word; background: rgba(0,0,0,0.03); padding: 12px; border-radius: 12px; }
@media (max-width: 1100px) {
  .layout, .split, .trace-grid { grid-template-columns: 1fr; }
  .results { max-height: none; }
}
`;

export const appScript = `
const state = { services: [], selectedTraceId: null, selectedSpanId: null, results: [], detail: null };
const form = document.getElementById("search-form");
const serviceSelect = document.getElementById("service");
const operationSelect = document.getElementById("operation");
const resultsNode = document.getElementById("results");
const resultsCount = document.getElementById("results-count");
const detailNode = document.getElementById("detail");
const detailSummaryNode = document.getElementById("detail-summary");

const toIsoFromLocal = (value) => value ? new Date(value).toISOString() : "";
const formatDuration = (nanoString) => {
  const milliseconds = Number(BigInt(nanoString) / 1000000n);
  if (milliseconds < 1000) return milliseconds + " ms";
  return (milliseconds / 1000).toFixed(2) + " s";
};
const formatTime = (nanoString) => new Date(Number(BigInt(nanoString) / 1000000n)).toLocaleString();
const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const loadServices = async () => {
  const response = await fetch("/api/services");
  state.services = await response.json();
  serviceSelect.innerHTML = '<option value="">All services</option>' + state.services.map((service) => '<option value="' + escapeHtml(service) + '">' + escapeHtml(service) + '</option>').join("");
};

const loadOperations = async () => {
  if (!serviceSelect.value) {
    operationSelect.innerHTML = '<option value="">All operations</option>';
    return;
  }

  const response = await fetch('/api/operations?service=' + encodeURIComponent(serviceSelect.value));
  const operations = await response.json();
  operationSelect.innerHTML = '<option value="">All operations</option>' + operations.map((item) => '<option value="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + ' (' + escapeHtml(item.kind) + ')</option>').join("");
};

const buildQuery = () => {
  const params = new URLSearchParams();
  const data = new FormData(form);
  for (const [key, value] of data.entries()) {
    if (!value) continue;
    if (key === 'start' || key === 'end') {
      params.set(key, toIsoFromLocal(value));
      continue;
    }
    params.set(key, value);
  }
  params.set('limit', '50');
  return params.toString();
};

const renderResults = () => {
  resultsCount.textContent = state.results.length + ' results';
  resultsNode.innerHTML = state.results.map((trace) => {
    const active = state.selectedTraceId === trace.traceId ? ' active' : '';
    return '<article class="result' + active + '" data-trace-id="' + trace.traceId + '">' +
      '<div class="result-title"><span>' + escapeHtml(trace.rootServiceName || 'unknown service') + '</span><span>' + formatDuration(trace.durationNano) + '</span></div>' +
      '<div>' + escapeHtml(trace.rootSpanName || 'unknown root span') + '</div>' +
      '<div class="meta">' +
        '<span class="chip">' + escapeHtml(formatTime(trace.startTimeUnixNano)) + '</span>' +
        '<span class="chip">' + trace.spanCount + ' spans</span>' +
        '<span class="chip">' + trace.serviceCount + ' services</span>' +
        (trace.errorCount > 0 ? '<span class="chip error">' + trace.errorCount + ' errors</span>' : '') +
      '</div>' +
    '</article>';
  }).join('');
};

const buildTraceView = (detail) => {
  const spans = [...detail.spans].sort((a, b) => Number(BigInt(a.startTimeUnixNano) - BigInt(b.startTimeUnixNano)));
  const rootStart = BigInt(detail.summary.startTimeUnixNano);
  const traceDuration = BigInt(detail.summary.durationNano) || 1n;
  const children = new Map();
  for (const span of spans) {
    const key = span.parentSpanId || '__root__';
    const list = children.get(key) || [];
    list.push(span);
    children.set(key, list);
  }
  for (const list of children.values()) list.sort((a, b) => Number(BigInt(a.startTimeUnixNano) - BigInt(b.startTimeUnixNano)));
  const treeRows = [];
  const walk = (parentId, depth) => {
    for (const span of children.get(parentId) || []) {
      treeRows.push({ span, depth });
      walk(span.spanId, depth + 1);
    }
  };
  walk('__root__', 0);
  const selectedSpan = spans.find((span) => span.spanId === state.selectedSpanId) || spans[0] || null;
  if (selectedSpan) state.selectedSpanId = selectedSpan.spanId;
  return '<div class="trace-layout">' +
    '<div class="meta"><span class="chip">' + escapeHtml(detail.summary.traceId) + '</span><span class="chip">' + formatDuration(detail.summary.durationNano) + '</span><span class="chip">' + detail.summary.spanCount + ' spans</span></div>' +
    '<div class="trace-grid">' +
      '<div class="span-tree">' + treeRows.map(({ span, depth }) => '<div class="span-row' + (selectedSpan && selectedSpan.spanId === span.spanId ? ' active' : '') + '" data-span-id="' + span.spanId + '" style="padding-left:' + (12 + depth * 16) + 'px"><span>' + escapeHtml(span.spanName) + '<br /><small class="muted">' + escapeHtml(span.serviceName || 'unknown service') + ' · ' + escapeHtml(span.spanKind) + '</small></span><span>' + formatDuration(span.durationNano) + '</span></div>').join('') + '</div>' +
      '<div class="waterfall">' + spans.map((span) => {
        const offset = Number((BigInt(span.startTimeUnixNano) - rootStart) * 10000n / traceDuration) / 100;
        const width = Math.max(Number(BigInt(span.durationNano) * 10000n / traceDuration) / 100, 0.8);
        return '<div class="waterfall-row' + (selectedSpan && selectedSpan.spanId === span.spanId ? ' active' : '') + '" data-span-id="' + span.spanId + '"><div class="bar" style="left:' + offset + '%;width:' + width + '%"></div></div>';
      }).join('') + '</div>' +
    '</div>' +
    (selectedSpan ? '<section class="span-details"><h3>' + escapeHtml(selectedSpan.spanName) + '</h3><div class="kv"><strong>Service</strong><span>' + escapeHtml(selectedSpan.serviceName || 'unknown') + '</span><strong>Span ID</strong><span><code>' + escapeHtml(selectedSpan.spanId) + '</code></span><strong>Kind</strong><span>' + escapeHtml(selectedSpan.spanKind) + '</span><strong>Status</strong><span>' + escapeHtml(selectedSpan.statusCode) + (selectedSpan.statusMessage ? ' - ' + escapeHtml(selectedSpan.statusMessage) : '') + '</span><strong>Duration</strong><span>' + formatDuration(selectedSpan.durationNano) + '</span><strong>Start</strong><span>' + escapeHtml(formatTime(selectedSpan.startTimeUnixNano)) + '</span></div><h3>Attributes</h3><pre>' + escapeHtml(JSON.stringify({ resource: selectedSpan.resourceAttributes, span: selectedSpan.spanAttributes }, null, 2)) + '</pre><h3>Events</h3><pre>' + escapeHtml(JSON.stringify(selectedSpan.events, null, 2)) + '</pre><h3>Links</h3><pre>' + escapeHtml(JSON.stringify(selectedSpan.links, null, 2)) + '</pre></section>' : '') +
  '</div>';
};

const loadTrace = async (traceId) => {
  state.selectedTraceId = traceId;
  const response = await fetch('/api/traces/' + encodeURIComponent(traceId));
  state.detail = response.ok ? await response.json() : null;
  detailSummaryNode.textContent = state.detail ? (state.detail.summary.rootServiceName || 'unknown service') + ' · ' + state.detail.summary.spanCount + ' spans' : 'Trace not found';
  if (state.detail) {
    if (!state.selectedSpanId || !state.detail.spans.some((span) => span.spanId === state.selectedSpanId)) {
      state.selectedSpanId = state.detail.spans[0]?.spanId || null;
    }
    detailNode.innerHTML = buildTraceView(state.detail);
  } else {
    detailNode.textContent = 'Trace not found.';
  }
  renderResults();
};

const runSearch = async () => {
  const response = await fetch('/api/traces?' + buildQuery());
  state.results = await response.json();
  renderResults();
  if (state.results[0]) {
    await loadTrace(state.selectedTraceId && state.results.some((item) => item.traceId === state.selectedTraceId) ? state.selectedTraceId : state.results[0].traceId);
  } else {
    state.selectedTraceId = null;
    state.selectedSpanId = null;
    state.detail = null;
    detailSummaryNode.textContent = 'No trace selected';
    detailNode.textContent = 'No traces match the current filters.';
  }
};

form.addEventListener('submit', async (event) => { event.preventDefault(); await runSearch(); });
serviceSelect.addEventListener('change', async () => { await loadOperations(); await runSearch(); });
operationSelect.addEventListener('change', async () => { await runSearch(); });
resultsNode.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-trace-id]');
  if (!target) return;
  await loadTrace(target.dataset.traceId);
});
detailNode.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-span-id]');
  if (!target || !state.detail) return;
  state.selectedSpanId = target.dataset.spanId;
  detailNode.innerHTML = buildTraceView(state.detail);
});

await loadServices();
await loadOperations();
await runSearch();
`;
