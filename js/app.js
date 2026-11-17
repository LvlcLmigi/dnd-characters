/* ------------------------------------------------------------
   Characters — page logic.
   Characters are edited in js/characters.js, not here.
   ------------------------------------------------------------ */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
  const toSlug = (c, i) => c.id || String(c.name || "character-" + i).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("");
  const firstName = (n) => String(n || "").split(/\s+/)[0];

  const camp = typeof CAMPAIGN !== "undefined" ? CAMPAIGN : {};
  const chars = (typeof CHARACTERS !== "undefined" ? CHARACTERS : []).map((c, i) => ({ ...c, _id: toSlug(c, i), _n: i }));
  const FALLBACK = ["#d8274d", "#e0611a", "#1fa463", "#1a5cff", "#8e3fd6", "#e64fa0", "#12a5b8", "#e8b41b"];
  const colorOf = (c) => c.color || c.tone || FALLBACK[c._n % FALLBACK.length];

  // white text on dark colours, dark text on light ones
  function inkFor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return "#ffffff";
    const n = parseInt(m[1], 16), lin = (v) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
    const L = .2126 * lin(n >> 16) + .7152 * lin((n >> 8) & 255) + .0722 * lin(n & 255);
    return L > .4 ? "#141a2b" : "#ffffff";
  }
  const colorVars = (c) => `--c:${esc(colorOf(c))};--on-c:${inkFor(colorOf(c))}`;

  /* ---------- page chrome ---------- */
  const siteTitle = camp.title || "Characters";
  $("#logo-text").textContent = siteTitle;
  $("#footer-title").textContent = siteTitle + (camp.subtitle ? " · " + camp.subtitle : "");
  $("#intro").textContent = camp.intro || camp.subtitle || "";
  $("#browse-btn").addEventListener("click", (e) => { e.preventDefault(); $("#browse").scrollIntoView({ behavior: "smooth" }); });

  /* ---------- character cards ---------- */
  function subline(c) { return [c.race, c.class].filter(has).join(" · "); }
  function art(c, where) {
    if (c.art) return `<img src="${esc(c.art)}" alt="${where === "detail" ? esc(c.name) : ""}" ${where === "card" ? 'loading="lazy"' : ""}>`;
    return `<div class="ph" aria-hidden="true">${esc(initials(c.name))}<small>Art coming soon</small></div>`;
  }
  $("#cards").innerHTML = chars.map((c, i) => `
    <li style="--i:${i}">
      <a class="card" href="#${esc(c._id)}" style="${colorVars(c)}">
        <span class="card-box"><span class="card-figure">${art(c, "card")}</span></span>
        <span class="card-name">${esc(c.name)}</span>
        <span class="card-sub">${esc(subline(c))}</span>
      </a>
    </li>`).join("");

  /* ---------- detail content ---------- */
  const mod = (n) => { const m = Math.floor((Number(n) - 10) / 2); return (m >= 0 ? "+" : "−") + Math.abs(m); };

  function detailHTML(c) {
    const o = [];
    if (has(c.player)) o.push(`<p class="d-player">Played by ${esc(c.player)}</p>`);
    o.push(`<h2 class="d-name" id="d-name">${esc(c.name)}</h2>`);
    if (has(c.epithet)) o.push(`<p class="d-epithet">${esc(c.epithet)}</p>`);

    const chips = [c.race, c.class, has(c.level) ? "Level " + c.level : ""].filter(has);
    if (chips.length) o.push(`<ul class="d-chips">${chips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`);
    if (has(c.quote)) o.push(`<p class="d-quote">“${esc(c.quote)}”</p>`);

    const bio = Array.isArray(c.bio) ? c.bio : has(c.bio) ? [c.bio] : [];
    if (bio.length) o.push(`<div class="d-bio">${bio.map((p) => `<p>${esc(p)}</p>`).join("")}</div>`);

    const facts = [
      ["Race", c.race], ["Subrace", c.subrace],
      ["Class", c.class], ["Subclass", c.subclass],
      ["Multiclass", c.multiclass], ["Level", c.level],
      ["Background", c.background], ["Alignment", c.alignment],
      ["Deity", c.deity], ["Age", c.age],
      ["Height", c.height], ["Pronouns", c.pronouns],
      ["Status", c.status],
      ...Object.entries(c.extra || {}),
    ].filter(([, v]) => has(v));

    const panel = [];
    if (facts.length) panel.push(`<h3>Details</h3><dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`);
    if (c.stats && Object.keys(c.stats).length) {
      const top = Math.max(...Object.values(c.stats).map(Number));
      panel.push(`<h3>Ability scores</h3><ul class="stats">${Object.entries(c.stats).map(([k, v]) =>
        `<li${Number(v) === top ? ' class="is-high"' : ""}><span class="ab">${esc(k)}</span><span class="score">${esc(v)}</span><span class="mod">${mod(v)}</span></li>`).join("")}</ul>`);
    }
    if (c.traits && c.traits.length) panel.push(`<h3>Quirks</h3><ul class="traits">${c.traits.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`);
    if (has(c.goals)) panel.push(`<h3>Goals</h3><p>${esc(c.goals)}</p>`);
    if (panel.length) o.push(`<div class="panel">${panel.join("")}</div>`);
    return o.join("");
  }

  /* ---------- open / switch / close ---------- */
  const detail = $("#detail");
  let current = null, lastCard = null, swapTimer = null;

  function fill(c) {
    detail.setAttribute("style", colorVars(c));
    const scene = $("#detail-scene");
    scene.style.backgroundImage = c.background_image ? `url('${c.background_image}')` : "none";
    scene.classList.toggle("has-img", !!c.background_image);
    $("#detail-word").textContent = firstName(c.name);
    const text = $("#detail-text");
    text.innerHTML = detailHTML(c);
    [...text.children].forEach((el, n) => el.style.setProperty("--d", n));
    $("#figure").innerHTML = art(c, "detail");
    $("#detail-scroll").scrollTop = 0;

    const prev = chars[(c._n - 1 + chars.length) % chars.length];
    const next = chars[(c._n + 1) % chars.length];
    $("#prev").href = "#" + prev._id; $("#prev b").textContent = prev.name;
    $("#next").href = "#" + next._id; $("#next b").textContent = next.name;
    $(".detail-nav").hidden = chars.length < 2;
    document.title = `${c.name} · ${siteTitle}`;
  }

  function replay() {
    detail.classList.remove("is-open", "is-swapping");
    void detail.offsetWidth;
    detail.classList.add("is-open");
  }

  function open(c) {
    clearTimeout(swapTimer);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (current && current !== c && !detail.hidden && !reduced) {
      detail.classList.add("is-swapping");
      swapTimer = setTimeout(() => { fill(c); replay(); }, 240);
    } else {
      // grow the colour out from the card that was clicked
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
      $("#close-btn").focus({ preventScroll: true });
    }
    current = c;
  }

  function close() {
    detail.hidden = true;
    detail.classList.remove("is-open", "is-swapping");
    document.body.classList.remove("is-locked");
    document.title = siteTitle;
    if (current) {
      lastCard = document.querySelector(`.card[href="#${CSS.escape(current._id)}"]`);
      if (lastCard) lastCard.focus({ preventScroll: false });
    }
    current = null;
  }

  function route() {
    const id = decodeURIComponent(location.hash.slice(1));
    const c = chars.find((x) => x._id === id);
    if (c) open(c);
    else if (!detail.hidden) close();
  }

  function goHome() {
    // clear the hash without jumping the page
    history.pushState("", document.title, location.pathname + location.search);
    route();
  }

  $("#close-btn").addEventListener("click", goHome);
  document.addEventListener("keydown", (e) => {
    if (detail.hidden) return;
    if (e.key === "Escape") goHome();
    if (e.key === "ArrowLeft") location.hash = $("#prev").getAttribute("href");
    if (e.key === "ArrowRight") location.hash = $("#next").getAttribute("href");
  });
  $("#logo").addEventListener("click", (e) => { e.preventDefault(); goHome(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  document.querySelector(".topnav a").addEventListener("click", (e) => { e.preventDefault(); goHome(); $("#browse").scrollIntoView({ behavior: "smooth" }); });

  window.addEventListener("hashchange", route);
  window.addEventListener("popstate", route);
  route();

  chars.forEach((c) => [c.art, c.background_image].filter(Boolean).forEach((src) => { new Image().src = src; }));
})();
