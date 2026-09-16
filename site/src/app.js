import * as R from "./render.mjs";

const base = document.documentElement.dataset.base;
const $ = (s, el = document) => el.querySelector(s);

if ($("#browse")) browse();
if ($("[data-verify]")) model();
copyButtons();

async function browse() {
  const [data, dots] = await Promise.all([
    fetch(`${base}data/models.json`).then((r) => r.json()),
    fetch(`${base}data/dots.json`).then((r) => r.json()),
  ]);
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
    grid.innerHTML = R.grid(r, { base, dots });
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
  button.addEventListener("click", async () => {
    button.disabled = true;
    out.hidden = false;
    out.className = "verdict";
    out.textContent = "Checking the bytes in your browser.";
    const started = performance.now();
    try {
      const api = await import("https://humuhumu33.github.io/hologram-api/hologram.js");
      const doc = await api.resolve(id, { manifest: pinned });
      const small = doc.files.filter((f) => !f.weights && f.size && f.size < 4e6).sort((a, b) => a.size - b.size).pop();
      let fileLine = "";
      if (small) {
        await api.fetchVerified(small.url, small.address);
        fileLine = ` and ${small.path}`;
      }
      const ms = Math.round(performance.now() - started);
      out.className = "verdict ok";
      out.textContent = `Verified in ${ms} ms. The manifest of ${doc.files.length} files${fileLine} match their addresses.`;
    } catch (error) {
      out.className = "verdict bad";
      out.textContent = error.code === "ADDRESS_MISMATCH" ? "These bytes do not match their address." : `Could not verify: ${error.message}`;
    } finally {
      button.disabled = false;
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
