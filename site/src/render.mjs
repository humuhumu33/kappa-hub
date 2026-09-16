// Shared by the static build (Node) and the browser. Pure functions: data in, HTML out.

export const PAGE_SIZE = 42;

export const SORTS = [
  ["trending", "Trending"],
  ["downloads", "Downloads"],
  ["likes", "Likes"],
  ["newest", "Newest"],
  ["size", "Parameters"],
];

export const FACETS = [
  { key: "modality", param: "modality", label: "Modality", tab: "main" },
  { key: "bucket", param: "size", label: "Parameters", tab: "main", order: ["Under 1B", "1 to 3B", "4 to 9B", "10 to 20B", "21 to 40B", "41 to 100B", "101 to 300B", "Over 300B"] },
  { key: "stateLabel", param: "status", label: "Status", tab: "main", order: ["Addressed", "Queued", "Gated"] },
  { key: "format", param: "format", label: "Format", tab: "format" },
  { key: "arch", param: "arch", label: "Architecture", tab: "arch", search: true },
  { key: "license", param: "license", label: "License", tab: "license", search: true },
];

export const TABS = [["main", "Main"], ["format", "Format"], ["arch", "Architecture"], ["license", "License"]];

export const STATE_LABEL = { addressed: "Addressed", pending: "Queued", skipped: "Gated" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const trim = (n) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ""));

export function count(n) {
  if (n >= 1e6) return `${trim(n / 1e6)}M`;
  if (n >= 1e3) return `${trim(n / 1e3)}k`;
  return String(n);
}

export function params(n) {
  if (!n) return null;
  if (n >= 1e12) return `${trim(n / 1e12)}T`;
  if (n >= 1e9) return `${trim(n / 1e9)}B`;
  if (n >= 1e6) return `${Math.round(n / 1e6)}M`;
  return `${Math.round(n / 1e3)}K`;
}

export function context(n) {
  if (!n) return null;
  if (n >= 1048576 * 0.95) return `${trim(n / 1048576)}M`;
  return `${Math.round(n / 1024)}K`;
}

export function bytes(n) {
  if (n == null) return "";
  const u = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return `${i ? trim(n) : n} ${u[i]}`;
}

export function month(iso) {
  if (!iso) return "";
  const [y, m] = iso.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

export function day(iso) {
  const [y, m, d] = iso.split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

export const shortAddress = (a) => {
  const [alg, hex] = String(a).split(":");
  return `${alg}:${hex.slice(0, 8)}…${hex.slice(-6)}`;
};

// Icons: 1.5px strokes on a 24 grid, sized by CSS.
const I = (d, extra = "") => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"${extra}>${d}</svg>`;
export const icon = {
  heart: I('<path d="M19.5 12.6 12 20l-7.5-7.4A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 7.5 6Z"/>'),
  down: I('<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
  chevron: I('<path d="m6 9 6 6 6-6"/>'),
  left: I('<path d="m15 6-6 6 6 6"/>'),
  right: I('<path d="m9 6 6 6-6 6"/>'),
  copy: I('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  check: I('<path d="m5 12 5 5 9-10"/>'),
  sliders: I('<path d="M4 7h10m4 0h2M4 17h2m4 0h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
  reset: I('<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/>'),
  close: I('<path d="m6 6 12 12M18 6 6 18"/>'),
  external: I('<path d="M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
};

// The Hologram mark's 70 dots, lit by the model's own address: same bytes, same pattern.
export function art(dots, seed, lit) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
  const circles = dots.map(([x, y, r]) => {
    const o = lit ? (0.03 + rand() * 0.11).toFixed(2) : "0.05";
    return `<circle cx="${x}" cy="${y}" r="${lit ? r : 2.6}" opacity="${o}"/>`;
  }).join("");
  return `<svg class="art" viewBox="-104 -104 208 208" aria-hidden="true">${circles}</svg>`;
}

export function avatar(m, base) {
  const letter = esc(m.org[0].toUpperCase());
  return m.avatar
    ? `<img class="avatar" src="${base}avatars/${esc(m.avatar)}" alt="" loading="lazy" width="55" height="55">`
    : `<span class="avatar mono" aria-hidden="true">${letter}</span>`;
}

export function card(m, { base, dots }) {
  const tags = [
    `<span class="tag state ${m.state}">${STATE_LABEL[m.state]}</span>`,
    m.params ? `<span class="tag">${params(m.params)}</span>` : "",
    m.modality !== "Other" ? `<span class="tag">${esc(m.modality)}</span>` : "",
  ].join("");
  return `<a class="card" href="${base}models/${esc(m.id)}/">
  ${art(dots, m.manifest || m.id, m.state === "addressed")}
  <span class="org">${esc(m.org)}</span>
  <span class="name">${esc(m.name)}</span>
  <span class="row"><span class="tags">${tags}</span><span class="meta">${icon.down}${count(m.downloads)}<span class="gap"></span>${icon.heart}${count(m.likes)}</span></span>
  ${avatar(m, base)}
</a>`;
}

// ---- Filtering, shared so the static first page equals the hydrated page.

export function withLabels(models) {
  for (const m of models) m.stateLabel = STATE_LABEL[m.state];
  return models;
}

export function parseState(search) {
  const p = new URLSearchParams(search);
  const state = { q: p.get("q") || "", sort: p.get("sort") || "trending", page: Math.max(1, Number(p.get("page")) || 1), tab: p.get("tab") || "main", f: {} };
  if (!SORTS.some(([k]) => k === state.sort)) state.sort = "trending";
  for (const f of FACETS) {
    const v = p.get(f.param);
    if (v) state.f[f.key] = v.split(",").filter(Boolean);
  }
  return state;
}

export function stateToSearch(state) {
  const p = new URLSearchParams();
  if (state.q) p.set("q", state.q);
  if (state.sort !== "trending") p.set("sort", state.sort);
  for (const f of FACETS) if (state.f[f.key]?.length) p.set(f.param, state.f[f.key].join(","));
  if (state.tab !== "main") p.set("tab", state.tab);
  if (state.page > 1) p.set("page", state.page);
  const s = p.toString().replace(/%2C/g, ",");
  return s ? `?${s}` : "";
}

function matches(m, state, skip) {
  if (state.q) {
    const hay = `${m.id} ${m.arch || ""}`.toLowerCase();
    if (!state.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  for (const f of FACETS) {
    if (f.key === skip) continue;
    const want = state.f[f.key];
    if (want?.length && !want.includes(String(m[f.key]))) return false;
  }
  return true;
}

const SORTERS = {
  trending: (a, b) => a.rank - b.rank,
  downloads: (a, b) => b.downloads - a.downloads,
  likes: (a, b) => b.likes - a.likes,
  newest: (a, b) => (b.created || "").localeCompare(a.created || ""),
  size: (a, b) => (b.params || 0) - (a.params || 0),
};

export function query(models, state) {
  const results = models.filter((m) => matches(m, state)).sort(SORTERS[state.sort]);
  const facets = FACETS.map((f) => {
    const counts = new Map();
    for (const m of models) {
      const v = m[f.key];
      if (v == null || v === "Other" && f.key === "modality") continue;
      if (!matches(m, state, f.key)) { if (!counts.has(String(v))) counts.set(String(v), 0); continue; }
      counts.set(String(v), (counts.get(String(v)) || 0) + 1);
    }
    const values = [...counts].filter(([v, n]) => n > 0 || state.f[f.key]?.includes(v));
    values.sort(f.order ? (a, b) => f.order.indexOf(a[0]) - f.order.indexOf(b[0]) : (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { ...f, values };
  });
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const page = Math.min(state.page, pages);
  return { results, facets, pages, page, slice: results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) };
}

// ---- Browser panels

export function filters(r, state) {
  const tabs = TABS.map(([k, label]) => `<button type="button" class="tab" role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${label}</button>`).join("");
  const sections = r.facets.filter((f) => f.tab === state.tab).map((f) => {
    const active = state.f[f.key] || [];
    const chips = f.values.map(([v, n]) => {
      const on = active.includes(v);
      return `<button type="button" class="chip" data-facet="${f.key}" data-value="${esc(v)}" aria-pressed="${on}">${esc(v)}<span class="n">${count(n)}</span></button>`;
    }).join("");
    return `<section class="facet${f.search ? " searchable" : ""}" data-key="${f.key}">
  <header><h2>${f.label}</h2><button type="button" class="reset" data-reset="${f.key}"${active.length ? "" : " hidden"}>${icon.reset}Reset</button></header>
  ${f.search ? `<label class="field small">${icon.search}<input type="search" placeholder="Filter ${f.label.toLowerCase()}" data-facet-search="${f.key}" autocomplete="off"></label>` : ""}
  <div class="chips">${chips || '<p class="none">No values</p>'}</div>
  <button type="button" class="more" hidden></button>
</section>`;
  }).join("");
  return `<div class="tabs" role="tablist">${tabs}</div>${sections}`;
}

export function grid(r, { base, dots }) {
  if (!r.results.length) return `<div class="empty"><p>No models match these filters.</p><button type="button" class="link" data-clear>Clear filters</button></div>`;
  return r.slice.map((m) => card(m, { base, dots })).join("");
}

export function pager(r, state) {
  if (r.pages < 2) return "";
  const link = (p, label, extra = "") => `<a href="${stateToSearch({ ...state, page: p }) || "?"}" data-page="${p}"${extra}>${label}</a>`;
  const nums = [];
  for (let p = 1; p <= r.pages; p++) {
    if (p === 1 || p === r.pages || Math.abs(p - r.page) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return [
    r.page > 1 ? link(r.page - 1, icon.left, ' class="step" aria-label="Previous page"') : `<span class="step off">${icon.left}</span>`,
    ...nums.map((p) => (p === "…" ? `<span class="dots">…</span>` : p === r.page ? `<span class="now" aria-current="page">${p}</span>` : link(p, p))),
    r.page < r.pages ? link(r.page + 1, icon.right, ' class="step" aria-label="Next page"') : `<span class="step off">${icon.right}</span>`,
  ].join("");
}

export function title(state) {
  const parts = FACETS.flatMap((f) => state.f[f.key] || []);
  let t = parts.length ? `${parts.slice(0, 3).join(", ")}${parts.length > 3 ? ` +${parts.length - 3}` : ""} models` : "Models";
  if (state.page > 1) t += `, page ${state.page}`;
  return `${t} · Hologram Hub`;
}
