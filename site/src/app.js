import * as R from "./render.mjs";
import * as B from "./braille.mjs";

const base = document.documentElement.dataset.base;
const $ = (s, el = document) => el.querySelector(s);

themeSwitch();
B.play();
if ($("#browse")) browse();
if ($("[data-verify]")) model();
copyButtons();

async function browse() {
  const data = await fetch(`${base}data/models.json`).then((r) => r.json());
  const models = R.prepare(data.models, data.snapshot);
  let state = R.parseState(location.search);
  const filters = $("#filters-body"), grid = $("#grid"), pager = $("#pager"), total = $("#total"), q = $("#q");
  const facetSearch = {}, openMore = new Set(), order = {};
  q.value = state.q;

  function render(push) {
    const r = R.query(models, state, order);
    state.page = r.page;
    const focus = document.activeElement?.dataset?.facetSearch;
    filters.innerHTML = R.filters(r, state, order);
    grid.innerHTML = R.grid(r, { base });
    B.play(grid);
    pager.innerHTML = R.pager(r, state);
    total.textContent = r.results.length.toLocaleString("en-US");
    $("#sheet-count").textContent = total.textContent;
    clampAll();
    for (const [key, text] of Object.entries(facetSearch)) {
      const input = filters.querySelector(`[data-facet-search="${key}"]`);
      if (input) { input.value = text; narrow(input); if (focus === key) { input.focus(); input.setSelectionRange(text.length, text.length); } }
    }
    syncSort();
    document.title = R.title(state);
    const url = `${location.pathname}${R.stateToSearch(state)}`;
    if (push === "push") history.pushState(null, "", url);
    else if (push === "replace") history.replaceState(null, "", url);
  }

  function clampAll() {
    for (const section of filters.querySelectorAll(".facet")) clamp(section, openMore.has(section.dataset.key));
  }

  function clamp(section, open) {
    const chips = section.querySelector(".chips"), more = section.querySelector(".more");
    chips.classList.add("clamped");
    const hidden = [...chips.children].filter((c) => c.offsetTop - chips.offsetTop >= chips.clientHeight).length;
    if (!hidden) { chips.classList.remove("clamped"); more.hidden = true; return; }
    more.hidden = false;
    more.textContent = open ? "Show less" : `+${hidden} more`;
    if (open) chips.classList.remove("clamped");
    more.onclick = () => {
      const next = chips.classList.contains("clamped");
      next ? openMore.add(section.dataset.key) : openMore.delete(section.dataset.key);
      clamp(section, next);
    };
  }

  function narrow(input) {
    const text = input.value.trim().toLowerCase();
    facetSearch[input.dataset.facetSearch] = input.value;
    const section = input.closest(".facet"), chips = section.querySelector(".chips");
    for (const chip of chips.children) if (chip.dataset.value) chip.hidden = !!text && !chip.dataset.value.toLowerCase().includes(text);
    if (text) { chips.classList.remove("clamped"); section.querySelector(".more").hidden = true; }
    else clamp(section, false);
  }

  const change = (fn) => { fn(); state.page = 1; render("push"); };

  // Verified only: the same filter as Status → Verified, one tap away.
  const verifiedOnly = $("#verified-only");
  const isVerifiedOnly = () => state.f.stateLabel?.length === 1 && state.f.stateLabel[0] === "Verified";
  verifiedOnly.addEventListener("click", () => change(() => {
    if (isVerifiedOnly()) delete state.f.stateLabel; else state.f.stateLabel = ["Verified"];
  }));

  filters.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip"), tab = e.target.closest(".tab"), reset = e.target.closest("[data-reset]"), sorter = e.target.closest("[data-order]");
    if (sorter) { const k = sorter.dataset.order; order[k] = order[k] === "az" ? "count" : "az"; render(); }
    if (chip) change(() => {
      const list = new Set(state.f[chip.dataset.facet] || []);
      list.has(chip.dataset.value) ? list.delete(chip.dataset.value) : list.add(chip.dataset.value);
      state.f[chip.dataset.facet] = [...list];
    });
    if (tab) { state.tab = tab.dataset.tab; render("replace"); }
    if (reset) change(() => { delete state.f[reset.dataset.reset]; });
  });
  filters.addEventListener("input", (e) => { if (e.target.dataset.facetSearch) narrow(e.target); });

  let typing;
  q.addEventListener("input", () => {
    clearTimeout(typing);
    typing = setTimeout(() => { state.q = q.value.trim(); state.page = 1; render("replace"); }, 144);
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-clear]")) change(() => { state.f = {}; state.q = ""; q.value = ""; });
    const page = e.target.closest("[data-page]");
    if (page && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      state.page = Number(page.dataset.page);
      render("push");
      $("#results").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  });

  // sort menu
  const sortButton = $("#sort"), list = $("#sort-list");
  function syncSort() {
    verifiedOnly.setAttribute("aria-checked", String(isVerifiedOnly()));
    $("#sort-label").textContent = R.SORTS.find(([k]) => k === state.sort)[1];
    for (const o of list.children) o.setAttribute("aria-selected", o.dataset.sort === state.sort);
  }
  const openMenu = (open) => {
    list.hidden = !open;
    sortButton.setAttribute("aria-expanded", open);
    if (open) [...list.children].forEach((o) => o.classList.toggle("hot", o.dataset.sort === state.sort));
  };
  sortButton.addEventListener("click", () => openMenu(list.hidden));
  list.addEventListener("click", (e) => {
    const o = e.target.closest("[data-sort]");
    if (o) { openMenu(false); change(() => { state.sort = o.dataset.sort; }); sortButton.focus(); }
  });
  sortButton.addEventListener("keydown", (e) => {
    if (list.hidden && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); openMenu(true); return; }
    if (list.hidden) return;
    const items = [...list.children], i = items.findIndex((o) => o.classList.contains("hot"));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = (i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
      items.forEach((o, k) => o.classList.toggle("hot", k === n));
    }
    if (e.key === "Enter") { e.preventDefault(); items[i]?.click(); }
    if (e.key === "Escape") openMenu(false);
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".sort")) openMenu(false); });

  // filters as a sheet on narrow screens
  $("#open-filters").addEventListener("click", () => { document.body.classList.add("sheet"); clampAll(); });
  $("#sheet-done").addEventListener("click", () => document.body.classList.remove("sheet"));
  $("#close-filters").addEventListener("click", () => document.body.classList.remove("sheet"));
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT") { e.preventDefault(); q.focus(); }
    if (e.key === "Escape") document.body.classList.remove("sheet");
  });

  window.addEventListener("popstate", () => { state = R.parseState(location.search); q.value = state.q; render(); });
  render("replace");
}

function model() {
  const button = $("[data-verify]"), out = $("#verdict");
  const id = button.dataset.verify, pinned = button.dataset.manifest;
  const glyph = [...document.querySelectorAll("#glyph .cell")];
  const sources = JSON.parse($("#sources")?.textContent || "[]");
  const mark = (kind, state) => {
    const li = document.querySelector(`.sources li[data-source="${kind}"]`);
    if (!li) return;
    li.dataset.state = state;
    if (state === "busy") B.play(li);
  };
  const pinnedBytes = B.hexToBytes(pinned.split(":")[1]);
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, calm ? 0 : ms));

  // While the browser fetches and hashes, the cells search. When the digest is known, each byte locks
  // left to right and is compared with the pinned address: every lit dot is a real bit of the result.
  let searching = false;
  function search() {
    if (!searching || calm) return;
    for (const svg of glyph) if (!svg.classList.contains("ok") && !svg.classList.contains("bad")) B.setCell(svg, (Math.random() * 256) | 0);
    setTimeout(search, 70);
  }
  async function lock(received) {
    for (let i = 0; i < glyph.length; i++) {
      const byte = received ? received[i] : pinnedBytes[i];
      B.setCell(glyph[i], byte, received && byte === pinnedBytes[i] ? "ok lock" : "bad");
      const svg = glyph[i];
      setTimeout(() => svg.classList.remove("lock"), 260);
      await wait(34);
    }
    searching = false;
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.classList.add("busy");
    B.play(button);
    out.hidden = false;
    out.className = "verdict";
    out.textContent = "Checking the bytes in your browser.";
    for (const svg of glyph) svg.setAttribute("class", "cell");
    for (const s of sources) mark(s.kind, "");
    searching = true;
    search();
    const started = performance.now();
    let received = null;
    try {
      const api = await import("https://humuhumu33.github.io/hologram-api/hologram.js");
      const doc = await api.resolve(id, { manifest: pinned });
      received = B.hexToBytes(doc.manifest.split(":")[1]);
      // The expected address comes from the index; each source only supplies bytes.
      const file = doc.files.find((f) => f.path === button.dataset.probe);
      const results = await Promise.all(sources.map(async (s) => {
        mark(s.kind, "busy");
        if (!file) { mark(s.kind, "ok"); return { s, ok: true }; }
        const url = s.resolve ? s.resolve + file.path.split("/").map(encodeURIComponent).join("/") : file.url;
        try { await api.fetchVerified(url, file.address); mark(s.kind, "ok"); return { s, ok: true }; }
        catch (e) { mark(s.kind, "bad"); return { s, ok: false, mismatch: e.code === "ADDRESS_MISMATCH" }; }
      }));
      const ms = Math.round(performance.now() - started);
      await lock(received);
      const good = results.filter((r) => r.ok).map((r) => r.s.name), bad = results.filter((r) => !r.ok);
      const list = (names) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]);
      if (bad.some((r) => r.mismatch)) {
        out.className = "verdict bad";
        out.textContent = `${list(bad.filter((r) => r.mismatch).map((r) => r.s.name))} served different bytes. Do not use that copy.`;
      } else if (bad.length) {
        out.className = good.length ? "verdict ok" : "verdict bad";
        out.textContent = good.length ? `Verified in ${ms} ms from ${list(good)}. ${list(bad.map((r) => r.s.name))} could not be reached.` : "No source could be reached.";
      } else {
        out.className = "verdict ok";
        out.textContent = good.length > 1 ? `Verified in ${ms} ms. Identical bytes from ${list(good)}.` : `Verified in ${ms} ms from ${good[0]}.`;
      }
    } catch (error) {
      await lock(received);
      out.className = "verdict bad";
      out.textContent = error.code === "ADDRESS_MISMATCH" ? "These bytes do not match their address." : `Could not verify: ${error.message}`;
    } finally {
      searching = false;
      button.disabled = false;
      button.classList.remove("busy");
    }
  });

  const table = $("#files");
  if (table) {
    const body = table.tBodies[0];
    table.addEventListener("click", (e) => {
      const th = e.target.closest("[data-col]");
      if (!th) return;
      const col = th.dataset.col, rows = [...body.rows];
      const dir = th.getAttribute("aria-sort") === "ascending" ? -1 : 1;
      rows.sort((a, b) => {
        const x = a.dataset[col], y = b.dataset[col];
        return (col === "size" ? Number(x) - Number(y) : x.localeCompare(y)) * dir;
      });
      for (const other of table.querySelectorAll("[data-col]")) other.removeAttribute("aria-sort");
      th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");
      body.append(...rows);
    });
  }
}

function copyButtons() {
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      const icon = b.querySelector(".i");
      const was = icon?.outerHTML;
      if (icon) icon.outerHTML = R.icon.check;
      setTimeout(() => { const now = b.querySelector(".i"); if (now && was) now.outerHTML = was; }, 1300);
    } catch {}
  });
}

// Dark, Light, Immersive. Dark for first visits; the choice is kept on this device.
function themeSwitch() {
  const KEY = "hologram-models-hub.theme";
  const root = document.documentElement, button = $("#theme-button"), menu = $("#theme-menu");
  if (!button) return;
  const walls = JSON.parse($("#wallpapers").textContent);
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  let warmed = false;

  function sync() {
    const mode = root.dataset.theme, wall = root.dataset.wallpaper;
    for (const b of menu.querySelectorAll("[data-theme-mode]")) b.setAttribute("aria-checked", String(b.dataset.themeMode === mode));
    for (const b of menu.querySelectorAll("button.wall")) b.setAttribute("aria-checked", String(mode === "immersive" && b.dataset.wallpaper === wall));
    const w = walls.find((x) => x.key === wall);
    $("#walls").classList.toggle("on", mode === "immersive");
    $("#wall-credit").innerHTML = w ? `${w.name}, photo by <a href="${w.url}" target="_blank" rel="noopener">${w.by}</a> on Unsplash` : "";
  }

  function apply(mode, wallpaper = root.dataset.wallpaper) {
    const run = () => {
      root.dataset.theme = mode;
      root.dataset.wallpaper = wallpaper;
      root.classList.toggle("dark", mode !== "light");
      try { localStorage.setItem(KEY, JSON.stringify({ mode, wallpaper })); } catch {}
      sync();
    };
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !calm && !document.hidden) {
      const t = document.startViewTransition(run);
      for (const p of [t.ready, t.finished, t.updateCallbackDone]) p?.catch(() => {});
    } else run();
  }

  // Full size wallpapers load the moment the menu opens, so Immersive appears instantly.
  function warm() {
    if (warmed) return;
    warmed = true;
    for (const w of walls) { const img = new Image(); img.decoding = "async"; img.src = `${base}wallpapers/${w.key}.jpg`; }
  }

  const items = () => [...menu.querySelectorAll('[role="menuitemradio"]')];
  function open(show, focusFirst) {
    menu.hidden = !show;
    button.setAttribute("aria-expanded", String(show));
    if (show) { warm(); sync(); if (focusFirst) (menu.querySelector('[aria-checked="true"]') || items()[0]).focus(); }
  }

  button.addEventListener("click", (e) => { e.stopPropagation(); open(menu.hidden, e.detail === 0); });
  button.addEventListener("pointerenter", warm, { once: true });
  menu.addEventListener("click", (e) => {
    const mode = e.target.closest("button[data-theme-mode]"), wall = e.target.closest("button.wall");
    if (mode) apply(mode.dataset.themeMode);
    else if (wall) apply("immersive", wall.dataset.wallpaper);
  });
  menu.addEventListener("keydown", (e) => {
    const list = items(), i = list.indexOf(document.activeElement);
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (step) { e.preventDefault(); list[(i + step + list.length) % list.length].focus(); }
    if (e.key === "Escape") { open(false); button.focus(); }
  });
  document.addEventListener("click", (e) => { if (!menu.hidden && !e.target.closest(".appearance")) open(false); });
  window.addEventListener("storage", (e) => { if (e.key === KEY) { const s = read(); if (s.mode) apply(s.mode, s.wallpaper || "alps"); } });
  sync();
}
