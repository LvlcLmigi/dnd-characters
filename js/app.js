/* ------------------------------------------------------------
   Characters — page logic.
   Content comes from data/site.json and data/characters.json,
   which admin mode (admin.html) edits. In admin's live preview
   (index.html?preview) the data arrives by postMessage instead.
   ------------------------------------------------------------ */
(function () {
  "use strict";

  const D = window.DND;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
  const toSlug = (c, i) => c.id || String(c.name || "character-" + i).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("");
  const firstName = (n) => String(n || "").split(/\s+/)[0];

  const PREVIEW = new URLSearchParams(location.search).has("preview");
  let site = D.mergeSite({});
  let chars = [];
  let resolve = (p) => p;          // maps image paths to URLs (admin preview swaps in unpublished images)
  let siteTitle = "Characters";

  let activeFolder = "all";
  try { activeFolder = localStorage.getItem("dnd-folder") || "all"; } catch { /* storage unavailable */ }
  let navList = [];               // characters in the order shown on the page (for previous / next)

  const st = () => site.style;
  const cardPattern = (c) => c.cardPattern || st().pattern || "dots";
  const pagePattern = (c) => c.pagePattern || st().pagePattern || cardPattern(c);
  const cardBackdrop = (c) => c.cardBackdrop || st().cardBackdrop || "none";
  const colorOf = (c) => c.color || c.tone || D.PALETTE[c._n % D.PALETTE.length];
  const colorVars = (c) => `--c:${esc(colorOf(c))};--on-c:${D.inkFor(colorOf(c))}`;
  const imgOf = (c, key) => c[key] || (key === "backgroundImage" ? c.background_image : "") || "";

  /* ---------- rendering ---------- */
  function subline(c) { return [c.race, c.class].filter(has).join(" · "); }
  function art(c, where) {
    if (c.art) return `<img src="${esc(resolve(c.art))}" alt="${where === "detail" ? esc(c.name) : ""}" ${where === "card" ? 'loading="lazy"' : ""}>`;
    return `<div class="ph" aria-hidden="true">${esc(initials(c.name))}<small>Art coming soon</small></div>`;
  }

  function renderChrome() {
    siteTitle = site.title || "Characters";
    $("#logo-text").textContent = siteTitle;
    $("#footer-title").textContent = siteTitle + (site.subtitle ? " · " + site.subtitle : "");
    $("#intro").textContent = site.intro || site.subtitle || "";
    $("#hero-title").textContent = site.heroTitle || "Characters";
    $("#browse-heading").textContent = site.browseHeading || "Meet the party";
    D.applyStyle(site, document, resolve);
    if (!current) document.title = siteTitle;
  }

  const cardHTML = (c, i) => `
      <li style="--i:${i}">
        <a class="card${c.hidden ? " is-hidden" : ""}" href="#${esc(c._id)}" style="${colorVars(c)}" data-pattern="${esc(cardPattern(c))}" data-backdrop="${esc(cardBackdrop(c))}">
          <span class="card-box"><span class="card-backdrop"></span><span class="card-figure">${art(c, "card")}</span></span>
          <span class="card-name">${esc(c.name)}</span>
          <span class="card-sub">${esc(subline(c))}</span>
        </a>
      </li>`;

  function folderGroups() {
    const folders = site.folders || [];
    const known = new Set(folders.map((f) => f.id));
    const groups = folders.map((f) => ({ id: f.id, name: f.name || "Folder", list: chars.filter((c) => c.folder === f.id) }));
    const loose = chars.filter((c) => !c.folder || !known.has(c.folder));
    if (loose.length && folders.length) groups.push({ id: "_none", name: "Other", list: loose });
    return { folders, groups, loose };
  }

  function renderCards() {
    const { folders, groups } = folderGroups();
    const tabs = $("#folder-tabs");
    const box = $("#card-groups");
    const mode = st().folderDisplay === "sections" ? "sections" : "tabs";
    if (!folders.length) {
      tabs.hidden = true;
      navList = chars;
      box.innerHTML = `<ul class="cards">${chars.map(cardHTML).join("")}</ul>`;
      return;
    }
    if (mode === "sections") {
      tabs.hidden = true;
      const shown = groups.filter((g) => g.list.length);
      navList = shown.flatMap((g) => g.list);
      box.innerHTML = shown.map((g) => `
        <section class="folder-section">
          <h3 class="folder-title">${esc(g.name)}<small>${g.list.length} ${g.list.length === 1 ? "character" : "characters"}</small></h3>
          <ul class="cards">${g.list.map(cardHTML).join("")}</ul>
        </section>`).join("");
      return;
    }
    // tabs
    const valid = ["all", ...groups.map((g) => g.id)];
    if (!valid.includes(activeFolder)) activeFolder = "all";
    tabs.hidden = false;
    tabs.innerHTML = [{ id: "all", name: "All", list: chars }, ...groups].map((g) =>
      `<button class="folder-tab${g.id === activeFolder ? " on" : ""}" data-folder="${esc(g.id)}" aria-pressed="${g.id === activeFolder}">${esc(g.name)} <small>${g.list.length}</small></button>`).join("");
    const list = activeFolder === "all" ? chars : (groups.find((g) => g.id === activeFolder) || { list: [] }).list;
    navList = list;
    box.innerHTML = list.length ? `<ul class="cards">${list.map(cardHTML).join("")}</ul>` : `<p class="empty-folder">No characters in this folder yet.</p>`;
  }
  $("#folder-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-folder]");
    if (!b) return;
    activeFolder = b.dataset.folder;
    try { localStorage.setItem("dnd-folder", activeFolder); } catch { /* ignore */ }
    renderCards();
  });

  const mod = (n) => { const m = Math.floor((Number(n) - 10) / 2); return (m >= 0 ? "+" : "−") + Math.abs(m); };

  function detailHTML(c) {
    const head = [];
    if (has(c.player)) head.push(`<p class="d-player">Played by ${esc(c.player)}</p>`);
    head.push(`<h2 class="d-name" id="d-name">${esc(c.name)}</h2>`);
    if (has(c.epithet)) head.push(`<p class="d-epithet">${esc(c.epithet)}</p>`);
    const chips = [c.race, c.class, has(c.level) ? "Level " + c.level : ""].filter(has);
    if (chips.length) head.push(`<ul class="d-chips">${chips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`);

    const desc = [];
    if (has(c.quote)) desc.push(`<p class="d-quote">“${esc(c.quote)}”</p>`);
    const bio = Array.isArray(c.bio) ? c.bio : has(c.bio) ? [c.bio] : [];
    if (bio.filter(has).length) desc.push(`<div class="d-bio">${bio.filter(has).map((p) => `<p>${esc(p)}</p>`).join("")}</div>`);

    const facts = [
      ["Race", c.race], ["Subrace", c.subrace],
      ["Class", c.class], ["Subclass", c.subclass],
      ["Multiclass", c.multiclass], ["Level", c.level],
      ["Background", c.background], ["Alignment", c.alignment],
      ["Deity", c.deity], ["Age", c.age],
      ["Height", c.height], ["Pronouns", c.pronouns],
      ["Status", c.status],
      ...Object.entries(c.extra || {}),
    ].filter(([k, v]) => has(k) && has(v));

    const panel = [];
    if (facts.length) panel.push(`<h3>Details</h3><dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`);
    const stats = Object.entries(c.stats || {}).filter(([, v]) => has(v));
    if (stats.length) {
      const top = Math.max(...stats.map(([, v]) => Number(v)));
      panel.push(`<h3>Ability scores</h3><ul class="stats">${stats.map(([k, v]) =>
        `<li${Number(v) === top ? ' class="is-high"' : ""}><span class="ab">${esc(k)}</span><span class="score">${esc(v)}</span><span class="mod">${mod(v)}</span></li>`).join("")}</ul>`);
    }
    const traits = (c.traits || []).filter(has);
    if (traits.length) panel.push(`<h3>Quirks</h3><ul class="traits">${traits.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`);
    if (has(c.goals)) panel.push(`<h3>Goals</h3><p>${esc(c.goals)}</p>`);
    const panelHTML = panel.length ? `<div class="panel">${panel.join("")}</div>` : "";
    const descHTML = desc.length ? `<div class="d-desc">${desc.join("")}</div>` : "";
    const pos = detailsPos();
    const body = pos === "below" ? descHTML + panelHTML : panelHTML + descHTML;
    return `<div class="d-head">${head.join("")}</div>` + (body ? `<div class="d-body pos-${pos}">${body}</div>` : "");
  }
  const detailsPos = () => (["above", "below", "beside"].includes(st().detailsPosition) ? st().detailsPosition : "above");

  /* ---------- open / switch / close ---------- */
  const detail = $("#detail");
  let current = null, swapTimer = null;

  function fill(c) {
    detail.setAttribute("style", colorVars(c));
    detail.dataset.pattern = pagePattern(c);
    detail.dataset.pageBackdrop = st().backdropOnPage ? cardBackdrop(c) : "none";
    detail.classList.toggle("is-locked", st().lockHeader !== false);
    ["above", "below", "beside"].forEach((p) => detail.classList.toggle("pos-" + p, detailsPos() === p));
    const scene = $("#detail-scene");
    const bg = imgOf(c, "backgroundImage");
    scene.style.backgroundImage = bg ? `url("${resolve(bg)}")` : "none";
    scene.classList.toggle("has-img", !!bg);
    $("#detail-word").textContent = firstName(c.name);
    const text = $("#detail-text");
    text.innerHTML = detailHTML(c);
    $$(".d-head > *, .d-body > *", text).forEach((el, n) => el.style.setProperty("--d", n));
    $("#figure").innerHTML = art(c, "detail");
    $("#detail-scroll").scrollTop = 0;

    const list = navList.includes(c) ? navList : chars;
    const at = list.indexOf(c);
    const prev = list[(at - 1 + list.length) % list.length];
    const next = list[(at + 1) % list.length];
    $("#prev").href = "#" + prev._id; $("#prev b").textContent = prev.name;
    $("#next").href = "#" + next._id; $("#next b").textContent = next.name;
    $(".detail-nav").hidden = list.length < 2;
    document.title = `${c.name} · ${siteTitle}`;
  }

  function replay() {
    detail.classList.remove("is-open", "is-swapping");
    void detail.offsetWidth;
    detail.classList.add("is-open");
  }

  function open(c, quiet) {
    clearTimeout(swapTimer);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quiet && current && !detail.hidden) {          // live preview edit: refresh in place
      const y = $("#detail-scroll").scrollTop;
      fill(c); $("#detail-scroll").scrollTop = y;
      detail.classList.add("is-open");
    } else if (current && current !== c && !detail.hidden && !reduced) {
      detail.classList.add("is-swapping");
      swapTimer = setTimeout(() => { fill(c); replay(); }, 240);
    } else {
      const card = document.querySelector(`.card[href="#${CSS.escape(c._id)}"] .card-box`);
      fill(c);
      if (card) {
        const r = card.getBoundingClientRect();
        detail.style.setProperty("--ox", `${r.left + r.width / 2}px`);
        detail.style.setProperty("--oy", `${r.top + r.height / 2}px`);
      }
      detail.hidden = false;
      document.body.classList.add("is-locked");
      replay();
      if (!PREVIEW) $("#close-btn").focus({ preventScroll: true });
    }
    current = c;
  }

  function close() {
    detail.hidden = true;
    detail.classList.remove("is-open", "is-swapping");
    document.body.classList.remove("is-locked");
    document.title = siteTitle;
    if (current) {
      const card = document.querySelector(`.card[href="#${CSS.escape(current._id)}"]`);
      if (card && !PREVIEW) card.focus({ preventScroll: false });
    }
    current = null;
  }

  function route(quiet) {
    const id = decodeURIComponent(location.hash.slice(1));
    const c = chars.find((x) => x._id === id);
    if (c) open(c, quiet === true);
    else if (!detail.hidden) close();
  }

  function goHome() {
    history.pushState("", document.title, location.pathname + location.search);
    route();
  }

  function setData(newSite, newChars, opts) {
    site = D.mergeSite(newSite);
    chars = (newChars || [])
      .filter((c) => c && (PREVIEW || !c.hidden))
      .map((c, i) => ({ ...c, _id: toSlug(c, i), _n: i }));
    renderChrome();
    renderCards();
    if (current) {
      const again = chars.find((x) => x._id === current._id);
      if (again) { current = again; open(again, true); return; }
    }
    route(opts && opts.quiet);
  }

  /* ---------- events ---------- */
  detail.addEventListener("wheel", (e) => {
    if (!detail.classList.contains("is-locked")) return;
    const inScroller = e.target.closest(".d-desc, .panel");
    if (inScroller && inScroller.scrollHeight > inScroller.clientHeight) return;
    const desc = $(".d-desc", detail);
    if (desc && desc.scrollHeight > desc.clientHeight) { desc.scrollTop += e.deltaY; e.preventDefault(); }
  }, { passive: false });

  $("#close-btn").addEventListener("click", goHome);
  document.addEventListener("keydown", (e) => {
    if (detail.hidden) return;
    if (e.key === "Escape") goHome();
    if (e.key === "ArrowLeft") location.hash = $("#prev").getAttribute("href");
    if (e.key === "ArrowRight") location.hash = $("#next").getAttribute("href");
  });
  $("#logo").addEventListener("click", (e) => { e.preventDefault(); goHome(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  document.querySelector(".topnav a").addEventListener("click", (e) => { e.preventDefault(); goHome(); $("#browse").scrollIntoView({ behavior: "smooth" }); });
  $("#browse-btn").addEventListener("click", (e) => { e.preventDefault(); $("#browse").scrollIntoView({ behavior: "smooth" }); });
  window.addEventListener("hashchange", () => route());
  window.addEventListener("popstate", () => route());

  /* ---------- load ---------- */
  if (PREVIEW) {
    // Admin mode drives this copy of the page.
    const badge = document.createElement("div");
    badge.className = "preview-badge"; badge.textContent = "Preview · not published";
    document.body.appendChild(badge);
    const map = new Map();
    resolve = (p) => map.get(p) || p;
    window.addEventListener("message", (e) => {
      if (e.origin !== location.origin || !e.data || e.data.type !== "dnd-preview") return;
      map.clear();
      Object.entries(e.data.images || {}).forEach(([k, v]) => map.set(k, v));
      setData(e.data.site, e.data.characters, { quiet: true });
      if (e.data.show !== undefined) {
        const want = e.data.show ? "#" + e.data.show : "";
        if (location.hash !== want) {
          if (want) location.hash = want; else goHome();
        }
      }
    });
    window.parent.postMessage({ type: "dnd-preview-ready" }, location.origin);
  } else {
    const get = (p) => fetch(p, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([get("data/site.json"), get("data/characters.json")]).then(([s, c]) => {
      setData(s || {}, Array.isArray(c) ? c : []);
      const preload = (c || []).flatMap((x) => [x.art, x.backgroundImage]).filter(Boolean);
      preload.forEach((src) => { new Image().src = src; });
    });
  }
})();
