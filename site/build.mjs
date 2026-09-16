// Static build: site/data + site/src → site/dist. No dependencies.
//
//   node site/build.mjs            base /kappa-hub/ (GitHub Pages)
//   BASE=/ node site/build.mjs     local preview

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "./src/render.mjs";

const SITE = dirname(fileURLToPath(import.meta.url));
const DIST = join(SITE, "dist");
const KIT = join(SITE, "vendor", "hologram-brand-kit");
const base = process.env.BASE || "/kappa-hub/";
const REPO = "https://github.com/humuhumu33/kappa-hub";
const INDEX = "https://github.com/humuhumu33/hologram-api";

const data = JSON.parse(await readFile(join(SITE, "data", "models.json"), "utf8"));
const models = R.withLabels(data.models);
const logomark = await readFile(join(KIT, "logos", "Hologram_Logomark_White.svg"), "utf8");
const dots = [...logomark.matchAll(/cx="([-\d.]+)" cy="([-\d.]+)" r="([-\d.]+)"/g)].map((m) => m.slice(1).map(Number));
if (dots.length !== 70) throw new Error(`expected 70 dots in the logomark, found ${dots.length}`);

const page = ({ title, description, body }) => `<!doctype html>
<html lang="en" data-base="${base}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${R.esc(title)}</title>
<meta name="description" content="${R.esc(description)}">
<meta property="og:title" content="${R.esc(title)}">
<meta property="og:description" content="${R.esc(description)}">
<meta name="theme-color" content="#151312">
<link rel="icon" href="${base}logos/Hologram_Logomark_White.svg" type="image/svg+xml">
<link rel="preload" href="${base}fonts/Geist-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${base}fonts/GeistMono-Medium.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${base}styles.css">
<script type="module" src="${base}app.js"></script>
</head>
<body>
<div class="shell">
<header class="top">
  <a class="brand" href="${base}" aria-label="Hologram Hub, all models"><img src="${base}logos/Hologram_Lockup_White.svg" alt="Hologram" width="177" height="34"><span class="hub">Hub</span></a>
  <div class="top-end">
    <a class="status" href="${INDEX}" title="Addresses refresh daily">Index ${R.day(data.snapshot)}</a>
    <a href="${REPO}">GitHub</a>
  </div>
</header>
${body}
</div>
</body>
</html>
`;

// ---- browse
const initial = R.parseState("");
const r = R.query(models, initial);
const sortMenu = R.SORTS.map(([k, label]) => `<li role="option" data-sort="${k}" aria-selected="${k === initial.sort}">${label}${R.icon.check}</li>`).join("");
const browse = page({
  title: R.title(initial),
  description: `The ${data.totals.models} trending models on Hugging Face, every file named by its bytes.`,
  body: `<main class="browse" id="browse">
  <aside class="panel filters" aria-label="Filters">
    <button type="button" class="close-filters" id="close-filters" aria-label="Close filters">${R.icon.close}</button>
    <div id="filters-body">${R.filters(r, initial)}</div>
  </aside>
  <section class="panel" id="results" aria-label="Models">
    <div class="head"><h1>Models</h1><span class="pill" id="total">${r.results.length}</span></div>
    <div class="bar">
      <label class="field">${R.icon.search}<input id="q" type="search" placeholder="Search models" autocomplete="off" spellcheck="false" aria-label="Search models"></label>
      <button type="button" class="open-filters" id="open-filters">${R.icon.sliders}Filters</button>
      <div class="sort">
        <button type="button" id="sort" aria-haspopup="listbox" aria-expanded="false"><span id="sort-label">Trending</span>${R.icon.chevron}</button>
        <ul role="listbox" id="sort-list" aria-label="Sort" hidden style="list-style:none;margin:0">${sortMenu}</ul>
      </div>
    </div>
    <div class="grid" id="grid">${R.grid(r, { base, dots })}</div>
    <nav class="pager" id="pager" aria-label="Pages">${R.pager(r, initial)}</nav>
  </section>
</main>`,
});

// ---- model pages
function modelPage(m, files) {
  const fact = (label, value) => (value ? `<div><dt>${label}</dt><dd>${value}</dd></div>` : "");
  const copy = (text, shown) => `<button type="button" class="copy" data-copy="${R.esc(text)}" title="Copy">${R.esc(shown)}${R.icon.copy}</button>`;
  const facts = [
    fact("Status", `<span style="color:${m.state === "addressed" ? "var(--success)" : "var(--muted-foreground)"}">${R.STATE_LABEL[m.state]}</span>`),
    fact("Trending", `#${m.rank}`),
    fact("Parameters", R.params(m.params)),
    fact("Context", R.context(m.context)),
    fact("Modality", m.modality !== "Other" ? R.esc(m.modality) : null),
    fact("Architecture", R.esc(m.arch)),
    fact("Format", m.format !== "Other" ? R.esc(m.format) : null),
    fact("License", R.esc(m.license)),
    fact("Downloads", R.count(m.downloads)),
    fact("Likes", R.count(m.likes)),
    fact("Created", R.month(m.created)),
    m.weightBytes ? fact("Weights", R.bytes(m.weightBytes)) : "",
    m.revision ? fact("Revision", copy(m.revision, m.revision.slice(0, 12))) : "",
    m.manifest ? fact("Manifest", copy(m.manifest, R.shortAddress(m.manifest))) : "",
  ].join("");

  let filesPanel;
  if (files) {
    const rows = files.files.map(([path, size, address]) => `<tr data-path="${R.esc(path)}" data-size="${size ?? 0}">
  <td class="path" title="${R.esc(path)}">${R.esc(path)}</td><td class="size">${R.bytes(size)}</td><td class="addr">${copy(address, R.shortAddress(address))}</td></tr>`).join("");
    filesPanel = `<h2 class="title">Files<span class="pill">${files.files.length}</span></h2>
    <div class="scroll"><table id="files">
      <thead><tr><th><button type="button" data-col="path" aria-sort="ascending">Path</button></th><th class="size"><button type="button" data-col="size">Size</button></th><th>Address</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  } else {
    const note = m.state === "skipped"
      ? "This model is gated on Hugging Face. Addresses are recorded for public models only."
      : "This model is queued. Every file receives its address on the next daily index.";
    filesPanel = `<h2 class="title">Files</h2><p class="pending-note">${note}</p>`;
  }

  return page({
    title: `${m.name} · Hologram Hub`,
    description: `${m.id}: every file of this model with the address that proves its bytes.`,
    body: `<nav class="crumbs"><a href="${base}">${R.icon.left}Models</a></nav>
<section class="panel">
  <div class="hero">
    ${R.avatar(m, base)}
    <div class="who"><p class="org">${R.esc(m.org)}</p><h1>${R.esc(m.name)}</h1></div>
    <div class="actions">
      <a class="button" href="https://huggingface.co/${R.esc(m.id)}">Hugging Face${R.icon.external}</a>
      ${m.manifest ? `<button type="button" class="button primary" data-verify="${R.esc(m.id)}" data-manifest="${R.esc(m.manifest)}">${R.icon.check}Verify</button>` : ""}
    </div>
  </div>
  <p class="verdict" id="verdict" role="status" hidden></p>
</section>
<main class="detail">
  <section class="panel"><dl class="facts">${facts}</dl></section>
  <section class="panel">${filesPanel}</section>
</main>`,
  });
}

await rm(DIST, { recursive: true, force: true });
await mkdir(join(DIST, "data"), { recursive: true });
await writeFile(join(DIST, "index.html"), browse);
await writeFile(join(DIST, "404.html"), page({
  title: "Not found · Hologram Hub",
  description: "Page not found.",
  body: `<section class="panel" style="margin-top:var(--s6)"><div class="empty"><p>This page does not exist.</p><a class="link" href="${base}">All models</a></div></section>`,
}));

for (const m of models) {
  const filesPath = join(SITE, "data", "files", m.org, `${m.name}.json`);
  const files = existsSync(filesPath) ? JSON.parse(await readFile(filesPath, "utf8")) : null;
  const dir = join(DIST, "models", m.org, m.name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), modelPage(m, files));
}

const slim = models.map(({ stateLabel, task, ...m }) => m);
await writeFile(join(DIST, "data", "models.json"), JSON.stringify({ snapshot: data.snapshot, models: slim }));
await writeFile(join(DIST, "data", "dots.json"), JSON.stringify(dots));
for (const f of ["app.js", "render.mjs", "styles.css"]) await cp(join(SITE, "src", f), join(DIST, f));
await cp(join(KIT, "fonts"), join(DIST, "fonts"), { recursive: true });
await cp(join(KIT, "logos"), join(DIST, "logos"), { recursive: true });
if (existsSync(join(SITE, "public"))) await cp(join(SITE, "public"), DIST, { recursive: true });
await writeFile(join(DIST, ".nojekyll"), "");

console.log(`built ${models.length} model pages + browse at base ${base} → ${DIST}`);
