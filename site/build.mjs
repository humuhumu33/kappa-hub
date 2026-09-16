// Static build: site/data + site/src + vendored brand kit → site/dist. No dependencies.
//
//   node site/build.mjs            base /kappa-hub/ (GitHub Pages)
//   BASE=/ node site/build.mjs     local preview (Git Bash: prefix MSYS_NO_PATHCONV=1)

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
const models = R.prepare(data.models, data.snapshot);
const logomark = await readFile(join(KIT, "logos", "Hologram_Logomark_White.svg"), "utf8");
const dots = [...logomark.matchAll(/cx="([-\d.]+)" cy="([-\d.]+)" r="([-\d.]+)"/g)].map((m) => m.slice(1).map(Number));
if (dots.length !== 70) throw new Error(`expected 70 dots in the logomark, found ${dots.length}`);

const STYLES = ["kit/hologram-warm.css", "kit/hologram-gap-tokens.css", "tokens.css", "styles.css"];

const page = ({ title, description, body, search = false }) => `<!doctype html>
<html lang="en" class="dark" data-base="${base}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${R.esc(title)}</title>
<meta name="description" content="${R.esc(description)}">
<meta property="og:title" content="${R.esc(title)}">
<meta property="og:description" content="${R.esc(description)}">
<meta name="color-scheme" content="dark">
<link rel="icon" href="${base}logos/Hologram_Logomark_White.svg" type="image/svg+xml">
<link rel="preload" href="${base}fonts/Geist-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${base}fonts/GeistMono-Regular.woff2" as="font" type="font/woff2" crossorigin>
${STYLES.map((s) => `<link rel="stylesheet" href="${base}${s}">`).join("\n")}
<script type="module" src="${base}app.js"></script>
</head>
<body>
<div class="shell">
<header class="top">
  <a class="brand" href="${base}" aria-label="Hologram Hub"><img class="mark" src="${base}logos/Hologram_Logomark_White.svg" alt="" width="32" height="32"><img class="word" src="${base}logos/Hologram_Wordmark_White.svg" alt="Hologram" width="172" height="16"><span class="hub">Hub</span></a>
  <div class="top-end">
    ${search ? `<form class="field compact top-search" action="${base}" role="search">${R.icon.search}<input type="search" name="q" placeholder="Search models" aria-label="Search models" autocomplete="off"></form>` : ""}
    <a class="status" href="${INDEX}" title="Addresses refresh daily">Index ${R.day(data.snapshot)}</a>
    <a class="github" href="${REPO}" aria-label="GitHub" title="GitHub">${R.icon.github}</a>
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
  description: `The ${models.length} trending models on Hugging Face, every file named by its bytes.`,
  body: `<main class="browse" id="browse">
  <aside class="panel filters" aria-label="Filters">
    <button type="button" class="control square close-filters" id="close-filters" aria-label="Close filters">${R.icon.close}</button>
    <div id="filters-body">${R.filters(r, initial)}</div>
    <div class="sheet-footer"><button type="button" class="button primary" id="sheet-done">Show <span id="sheet-count">${r.results.length}</span> models</button></div>
  </aside>
  <section class="panel" id="results" aria-label="Models">
    <div class="head"><h1>Models</h1><span class="pill" id="total">${r.results.length}</span></div>
    <div class="bar">
      <label class="field search">${R.icon.search}<input id="q" type="search" placeholder="Search models" autocomplete="off" spellcheck="false" aria-label="Search models"></label>
      <button type="button" class="open-filters" id="open-filters">${R.icon.sliders}Filters</button>
      <div class="sort">
        <button type="button" id="sort" aria-haspopup="listbox" aria-expanded="false"><span id="sort-label">Trending</span>${R.icon.chevron}</button>
        <ul role="listbox" id="sort-list" aria-label="Sort" hidden>${sortMenu}</ul>
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
  const copy = (text, shown) => `<button type="button" class="copy" data-copy="${R.esc(text)}" aria-label="Copy ${R.esc(text)}">${R.esc(shown)}${R.icon.copy}</button>`;
  const facts = [
    fact("Status", `<span class="${m.state === "addressed" ? "ok" : "dim"}">${R.STATE_LABEL[m.state]}</span>`),
    fact("Trending", `#${m.rank}`),
    fact("Family", R.esc(m.family)),
    fact("Parameters", R.params(m.params)),
    fact("Context", R.context(m.context)),
    fact("Architecture", R.esc(m.arch)),
    fact("Library", R.esc(m.library)),
    fact("License", R.esc(m.license)),
    fact("Likes", R.count(m.likes)),
    fact("Downloads", R.count(m.downloads)),
    fact("Released", R.month(m.created)),
    m.weightBytes ? fact("Weights", R.bytes(m.weightBytes)) : "",
    m.revision ? fact("Revision", copy(m.revision, m.revision.slice(0, 12))) : "",
    m.manifest ? fact("Manifest", copy(m.manifest, R.shortAddress(m.manifest))) : "",
  ].join("");

  let filesPanel;
  if (files) {
    const rows = files.files.map(([path, size, address]) => `<tr data-path="${R.esc(path)}" data-size="${size ?? 0}"><td class="path" title="${R.esc(path)}">${R.esc(path)}</td><td class="size">${R.bytes(size)}</td><td class="addr">${copy(address, R.shortAddress(address))}</td></tr>`).join("\n");
    filesPanel = `<div class="section-head"><h2>Files</h2><span class="pill">${files.files.length}</span></div>
    <div class="scroll"><table id="files">
      <thead><tr><th><button type="button" data-col="path" aria-sort="ascending">Path${R.icon.chevron}</button></th><th class="size"><button type="button" data-col="size">Size${R.icon.chevron}</button></th><th>Address</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  } else {
    const note = m.state === "skipped"
      ? "This model is gated on Hugging Face. Addresses are recorded for public models only."
      : "This model is queued. Every file receives its address on the next daily index.";
    filesPanel = `<div class="section-head"><h2>Files</h2></div><p class="note">${note}</p>`;
  }

  return page({
    title: `${m.name} · Hologram Hub`,
    description: `${m.id}: every file of this model with the address that proves its bytes.`,
    search: true,
    body: `<a class="back" href="${base}">${R.icon.left}Models</a>
<section class="panel">
  <div class="hero">
    ${R.avatar(m, base)}
    <div class="who">
      <p class="org">${R.esc(m.org)}</p>
      <h1>${R.esc(m.name)}</h1>
      <div class="tags">${R.tags(m, { full: true })}</div>
    </div>
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
  search: true,
  body: `<section class="panel browse"><div class="empty"><p>This page does not exist.</p><a class="link" href="${base}">All models</a></div></section>`,
}));

for (const m of models) {
  const filesPath = join(SITE, "data", "files", m.org, `${m.name}.json`);
  const files = existsSync(filesPath) ? JSON.parse(await readFile(filesPath, "utf8")) : null;
  const dir = join(DIST, "models", m.org, m.name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), modelPage(m, files));
}

const slim = models.map(({ stateLabel, task, recency, isNew, ...m }) => m);
await writeFile(join(DIST, "data", "models.json"), JSON.stringify({ snapshot: data.snapshot, models: slim }));
await writeFile(join(DIST, "data", "dots.json"), JSON.stringify(dots));
for (const f of ["app.js", "render.mjs", "styles.css", "tokens.css"]) await cp(join(SITE, "src", f), join(DIST, f));
await mkdir(join(DIST, "kit"), { recursive: true });
for (const f of ["hologram-warm.css", "hologram-gap-tokens.css"]) await cp(join(KIT, f), join(DIST, "kit", f));
await cp(join(KIT, "fonts"), join(DIST, "fonts"), { recursive: true });
await cp(join(KIT, "logos"), join(DIST, "logos"), { recursive: true });
if (existsSync(join(SITE, "public"))) await cp(join(SITE, "public"), DIST, { recursive: true });
await writeFile(join(DIST, ".nojekyll"), "");

console.log(`built ${models.length} model pages + browse at base ${base} → ${DIST}`);
