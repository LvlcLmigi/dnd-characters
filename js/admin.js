/* ------------------------------------------------------------
   Admin mode
   Edits data/site.json, data/characters.json and images, then
   publishes them to the GitHub repo as one commit using the
   GitHub access key the owner pastes in (kept in this browser).
   ------------------------------------------------------------ */
(function () {
  "use strict";

  const D = window.DND, I = window.DDBImport;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
  const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  const initials = (n) => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const DEFAULT_REPO = "LvlcLmigi/dnd-characters";
  const BRANCH = "main";
  const ABIL = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

  const store = {
    get(k) { try { return localStorage.getItem(k) || sessionStorage.getItem(k); } catch { return null; } },
    set(k, v, remember) { try { (remember ? localStorage : sessionStorage).setItem(k, v); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* ignore */ } },
  };

  const state = {
    token: null,
    repo: store.get("dnd-admin-repo") || DEFAULT_REPO,
    headSha: null,
    remote: { site: null, chars: null },   // raw text of the data files as last seen on GitHub
    base: { site: "", chars: "" },          // our serialised text at last load/publish (dirty check)
    baseById: new Map(),
    site: null,
    chars: [],
    pending: new Map(),                     // path -> Blob (new images not yet published)
    urls: new Map(),                        // path -> object URL (images added this session)
    meta: new Map(),                        // path -> { hasAlpha }
    view: { type: "site" },
    importResult: null,
    importError: "",
    device: "desktop",
    previewReady: false,
    busy: false,
  };

  /* =========================================================
     Serialising & dirty tracking
     ========================================================= */
  const CHAR_KEYS = ["id", "name", "epithet", "player", "color", "hidden", "folder", "cardPattern", "pagePattern", "shadow", "glow", "glowColor", "race", "subrace", "class", "subclass", "multiclass", "level",
    "background", "alignment", "deity", "age", "height", "pronouns", "status", "stats", "quote", "bio", "traits", "goals", "extra", "art", "backgroundImage"];

  function cleanChar(c) {
    const o = {};
    CHAR_KEYS.forEach((k) => { if (c[k] !== undefined) o[k] = c[k]; });
    Object.keys(c).forEach((k) => { if (!(k in o) && !k.startsWith("_") && k !== "background_image" && k !== "tone") o[k] = c[k]; });
    if (!o.backgroundImage && c.background_image) o.backgroundImage = c.background_image;
    if (o.extra && !Object.keys(o.extra).length) delete o.extra;
    return o;
  }
  const charsText = () => JSON.stringify(state.chars.map(cleanChar), null, 2) + "\n";
  const siteText = () => JSON.stringify(state.site, null, 2) + "\n";
  function referencedImages() {
    const refs = new Set();
    state.chars.forEach((c) => { if (c.art) refs.add(c.art); if (c.backgroundImage) refs.add(c.backgroundImage); });
    if (state.site.style.heroImage) refs.add(state.site.style.heroImage);
    if (state.site.style.browseImage) refs.add(state.site.style.browseImage);
    return [...state.pending.keys()].filter((p) => refs.has(p));
  }
  function allImagePaths() {
    const out = new Set();
    state.chars.forEach((c) => { if (c.art) out.add(c.art); if (c.backgroundImage) out.add(c.backgroundImage); });
    if (state.site.style.heroImage) out.add(state.site.style.heroImage);
    if (state.site.style.browseImage) out.add(state.site.style.browseImage);
    return [...out];
  }
  const isDirty = () => siteText() !== state.base.site || charsText() !== state.base.chars || referencedImages().length > 0;
  function charChanged(c) {
    const was = state.baseById.get(c.id);
    return !was || was !== JSON.stringify(cleanChar(c)) || (c.art && state.pending.has(c.art)) || (c.backgroundImage && state.pending.has(c.backgroundImage));
  }
  function setBaseline() {
    state.base.site = siteText();
    state.base.chars = charsText();
    state.baseById = new Map(state.chars.map((c) => [c.id, JSON.stringify(cleanChar(c))]));
  }

  /* =========================================================
     GitHub API
     ========================================================= */
  async function gh(method, path, body) {
    const r = await fetch("https://api.github.com" + path, {
      method,
      headers: Object.assign({
        Authorization: "Bearer " + state.token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      }, body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (!r.ok) {
      let msg = "";
      try { msg = (await r.json()).message || ""; } catch { /* no body */ }
      const e = new Error(friendlyError(r.status, msg));
      e.status = r.status;
      throw e;
    }
    return r.status === 204 ? null : r.json();
  }
  function friendlyError(status, msg) {
    if (status === 401) return "GitHub didn't accept that key. Check you copied all of it, or create a new one.";
    if (status === 403) return `That key isn't allowed to change ${state.repo}. Make sure it has access to the repository with Contents set to "Read and write".` + (msg ? ` (GitHub said: ${msg})` : "");
    if (status === 404) return `Couldn't reach ${state.repo} with that key. Make sure the key's repository access includes it.`;
    return `GitHub error ${status}${msg ? ": " + msg : ""}`;
  }
  function b64FromText(t) {
    const bytes = new TextEncoder().encode(t);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const textFromB64 = (b) => new TextDecoder().decode(Uint8Array.from(atob(String(b).replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  const blobToB64 = (blob) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(",")[1]);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });

  async function readRemote(sha) {
    const get = (p) => gh("GET", `/repos/${state.repo}/contents/${p}?ref=${sha}`)
      .then((f) => textFromB64(f.content))
      .catch((e) => { if (e.status === 404) return null; throw e; });
    const [site, chars] = await Promise.all([get("data/site.json"), get("data/characters.json")]);
    return { site, chars };
  }

  async function loadRepo() {
    const ref = await gh("GET", `/repos/${state.repo}/git/ref/heads/${BRANCH}`);
    state.headSha = ref.object.sha;
    const remote = await readRemote(state.headSha);
    state.remote = remote;
    state.site = D.mergeSite(remote.site ? JSON.parse(remote.site) : {});
    state.chars = (remote.chars ? JSON.parse(remote.chars) : []).map((c, i) => {
      const o = Object.assign({}, c);
      if (!o.id) o.id = slug(o.name) || "character-" + (i + 1);
      if (!o.backgroundImage && o.background_image) o.backgroundImage = o.background_image;
      delete o.background_image; delete o.tone; delete o.entrance;
      return o;
    });
    state.pending.clear();
    setBaseline();
  }

  /* =========================================================
     Sign in
     ========================================================= */
  function tokenLink() {
    const owner = state.repo.split("/")[0];
    const p = new URLSearchParams({
      name: "dnd.volbeat.vip admin",
      description: "Lets admin mode on dnd.volbeat.vip publish changes to " + state.repo,
      target_name: owner,
      contents: "write",
    });
    return "https://github.com/settings/personal-access-tokens/new?" + p.toString();
  }
  function showSignin(error) {
    $("#loading").hidden = true;
    $("#app").hidden = true;
    $("#signin").hidden = false;
    $("#repo-input").value = state.repo;
    $("#repo-name-hint").textContent = state.repo.split("/")[1] || state.repo;
    $("#token-link").href = tokenLink();
    const err = $("#signin-error");
    err.hidden = !error; err.textContent = error || "";
    setTimeout(() => $("#token-input").focus(), 50);
  }
  $("#repo-input").addEventListener("input", (e) => {
    state.repo = e.target.value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "") || DEFAULT_REPO;
    $("#token-link").href = tokenLink();
    $("#repo-name-hint").textContent = state.repo.split("/")[1] || state.repo;
  });
  $("#signin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#signin-btn");
    state.token = $("#token-input").value.trim();
    if (!state.token) return;
    btn.disabled = true; btn.textContent = "Checking…";
    $("#signin-error").hidden = true;
    try {
      await loadRepo();
      const remember = $("#remember").checked;
      store.del("dnd-admin-token");
      store.set("dnd-admin-token", state.token, remember);
      store.set("dnd-admin-repo", state.repo, true);
      $("#token-input").value = "";
      startApp();
    } catch (err) {
      showSignin(err.message);
    } finally {
      btn.disabled = false; btn.textContent = "Unlock admin";
    }
  });

  /* =========================================================
     App shell
     ========================================================= */
  function startApp() {
    $("#signin").hidden = true;
    $("#loading").hidden = true;
    $("#app").hidden = false;
    if (!state.view || (state.view.type === "char" && !state.chars[state.view.i])) state.view = { type: "site" };
    renderAll();
    layoutPreview();
  }

  function renderAll() {
    renderSide();
    renderEditor();
    updateStatus();
    sendPreview();
  }

  let changeTimer = null;
  function changed(opts) {
    updateStatus();
    if (!opts || opts.side !== false) renderSideSoon();
    clearTimeout(changeTimer);
    changeTimer = setTimeout(sendPreview, 120);
  }
  let sideTimer = null;
  function renderSideSoon() { clearTimeout(sideTimer); sideTimer = setTimeout(renderSide, 150); }

  function updateStatus(text, kind) {
    const s = $("#status");
    const dirty = isDirty();
    $("#btn-publish").disabled = !dirty || state.busy;
    $("#btn-discard").hidden = !dirty || state.busy;
    if (text) { s.textContent = text; s.className = "status " + (kind || ""); return; }
    if (state.busy) return;
    s.textContent = dirty ? "Not published yet" : "Everything's published";
    s.className = "status " + (dirty ? "dirty" : "ok");
  }

  let toastTimer = null;
  function toast(msg, kind, ms) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast show " + (kind || "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = "toast " + (kind || ""); }, ms || 3200);
  }

  // Images are read straight from GitHub so they show even before the live site has updated.
  const rawUrl = (p) => /^(https?:|data:|blob:)/.test(p) ? p : `https://raw.githubusercontent.com/${state.repo}/${state.headSha || BRANCH}/${String(p).replace(/^\//, "")}`;
  const imgUrl = (p) => (p ? state.urls.get(p) || rawUrl(p) : "");

  /* ---------- sidebar ---------- */
  function renderSide() {
    $("#nav-site").classList.toggle("on", state.view.type === "site");
    $("#nav-import").classList.toggle("on", state.view.type === "import");
    const list = $("#char-list");
    if (!state.chars.length) { list.innerHTML = `<li class="empty-list">No characters yet.</li>`; return; }
    const item = (c, i) => {
      const col = c.color || D.PALETTE[i % D.PALETTE.length];
      const on = state.view.type === "char" && state.view.i === i;
      const sub = [c.race, c.class].filter(has).join(" · ") || (c.hidden ? "Hidden" : "");
      return `<li><button class="char-item${on ? " on" : ""}${c.hidden ? " is-hidden" : ""}" data-char="${i}" style="--c:${esc(col)}">
        <span class="char-thumb" style="color:${D.inkFor(col)}">${c.art ? `<img src="${esc(imgUrl(c.art))}" alt="">` : esc(initials(c.name))}</span>
        <span class="char-meta"><b>${esc(c.name || "Untitled")}</b><small>${esc(sub)}${c.hidden ? " · hidden" : ""}</small></span>
        ${charChanged(c) ? '<span class="dot" title="Not published yet"></span>' : ""}
      </button></li>`;
    };
    const folders = state.site.folders || [];
    if (!folders.length) { list.innerHTML = state.chars.map(item).join(""); return; }
    const known = new Set(folders.map((f) => f.id));
    const groups = folders.map((f) => ({ name: f.name || "Folder", items: state.chars.map((c, i) => [c, i]).filter(([c]) => c.folder === f.id) }));
    groups.push({ name: "No folder", items: state.chars.map((c, i) => [c, i]).filter(([c]) => !c.folder || !known.has(c.folder)) });
    list.innerHTML = groups.filter((g, n) => g.items.length || n < groups.length - 1)
      .map((g) => `<li class="folder-head">${esc(g.name)} <small>${g.items.length}</small></li>${g.items.map(([c, i]) => item(c, i)).join("") || '<li class="empty-list">Empty</li>'}`).join("");
  }
  $("#char-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-char]");
    if (b) go({ type: "char", i: Number(b.dataset.char) });
  });
  $("#nav-site").addEventListener("click", () => go({ type: "site" }));
  $("#nav-import").addEventListener("click", () => go({ type: "import", target: null }));
  $("#btn-new").addEventListener("click", () => {
    const c = newCharacter();
    const from = cur();
    if (from && from.folder) c.folder = from.folder;
    state.chars.push(c);
    go({ type: "char", i: state.chars.length - 1 });
    changed();
    setTimeout(() => { const n = $("#f-name"); if (n) { n.focus(); n.select(); } }, 30);
  });

  function go(view) {
    state.view = view;
    if (view.type !== "import") { state.importResult = null; state.importError = ""; }
    renderSide();
    renderEditor();
    sendPreview();
    $("#editor").scrollTop = 0;
  }

  function uniqueId(base, exceptIndex) {
    let id = slug(base) || "character";
    const taken = new Set(state.chars.filter((_, i) => i !== exceptIndex).map((c) => c.id));
    if (!taken.has(id)) return id;
    let n = 2; while (taken.has(`${id}-${n}`)) n++;
    return `${id}-${n}`;
  }
  function nextColor() {
    const used = new Set(state.chars.map((c) => (c.color || "").toLowerCase()));
    return D.PALETTE.find((p) => !used.has(p)) || D.PALETTE[state.chars.length % D.PALETTE.length];
  }
  function newCharacter(name) {
    return {
      id: uniqueId(name || "new-character"), name: name || "New character", epithet: "", player: "",
      color: nextColor(), hidden: false,
      race: "", subrace: "", class: "", subclass: "", multiclass: "", level: 1,
      background: "", alignment: "", deity: "", age: "", height: "", pronouns: "", status: "Alive",
      stats: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      quote: "", bio: [], traits: [], goals: "", extra: {}, art: "", backgroundImage: "",
    };
  }

  /* =========================================================
     Editor views
     ========================================================= */
  const RACES = ["Aasimar", "Dragonborn", "Dwarf", "Elf", "Gnome", "Goliath", "Half-Elf", "Half-Orc", "Halfling", "Human", "Orc", "Tiefling", "Tabaxi", "Firbolg", "Genasi", "Kenku", "Tortle", "Warforged", "Changeling", "Harengon", "Owlin", "Lizardfolk", "Yuan-ti", "Bugbear", "Goblin", "Hobgoblin", "Kobold", "Triton", "Satyr", "Fairy", "Centaur", "Minotaur", "Loxodon", "Leonin", "Shifter", "Kalashtar", "Githyanki", "Githzerai", "Eladrin", "Shadar-kai", "Sea Elf", "Duergar", "Deep Gnome", "Autognome", "Plasmoid", "Thri-kreen", "Giff", "Hadozee"];
  const CLASSES = ["Artificer", "Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard", "Blood Hunter"];
  const ALIGNMENTS = ["Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "True Neutral", "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil", "Unaligned"];
  const STATUSES = ["Alive", "Dead", "Missing", "Retired", "Captured", "Unknown"];
  const datalists = () => [["dl-race", RACES], ["dl-class", CLASSES], ["dl-align", ALIGNMENTS], ["dl-status", STATUSES]]
    .map(([id, opts]) => `<datalist id="${id}">${opts.map((o) => `<option value="${esc(o)}">`).join("")}</datalist>`).join("");

  function renderEditor() {
    const ed = $("#editor");
    if (state.view.type === "char" && state.chars[state.view.i]) ed.innerHTML = charView(state.chars[state.view.i], state.view.i);
    else if (state.view.type === "import") ed.innerHTML = importView();
    else { state.view = { type: "site" }; ed.innerHTML = siteView(); }
    const bm = $("#bookmarklet");
    if (bm) bm.setAttribute("href", I.BOOKMARKLET);
  }

  /* ---------- small builders ---------- */
  const text = (label, attrs, value, opts = {}) => `<label class="field${opts.full ? " full" : ""}"><span>${label}${opts.hint ? ` <small>${opts.hint}</small>` : ""}</span>
    <input type="${opts.type || "text"}" ${attrs} value="${esc(value)}"${opts.list ? ` list="${opts.list}"` : ""}${opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : ""}${opts.id ? ` id="${opts.id}"` : ""}${opts.min !== undefined ? ` min="${opts.min}"` : ""}${opts.max !== undefined ? ` max="${opts.max}"` : ""}></label>`;
  const area = (label, attrs, value, opts = {}) => `<label class="field${opts.full ? " full" : ""}"><span>${label}${opts.hint ? ` <small>${opts.hint}</small>` : ""}</span>
    <textarea ${attrs} rows="${opts.rows || 4}"${opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : ""}>${esc(value)}</textarea></label>`;
  const chipRow = (key, options, current) => `<span class="chips">${options.map(([v, l]) =>
    `<button class="chip${String(current ?? "") === v ? " on" : ""}" data-chip="${key}" data-val="${esc(v)}">${esc(l)}</button>`).join("")}</span>`;
  const colorField = (attrs, value) => `<span class="color-input"><input type="color" ${attrs} value="${esc(/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000")}" aria-label="Pick colour"><input type="text" ${attrs} value="${esc(value)}" spellcheck="false" aria-label="Colour code"></span>`;

  function uploadBox(label, key, path, opts = {}) {
    const url = imgUrl(path);
    const meta = state.meta.get(path);
    const notPublished = path && state.pending.has(path);
    return `<div class="upload">
      <span class="upload-label">${label} ${notPublished ? '<span class="badge">new</span>' : ""}</span>
      <label class="drop${opts.wide ? " wide" : ""}${path ? " filled" : ""}" data-drop="${key}" ${opts.color ? `style="--c:${esc(opts.color)}"` : ""}>
        ${path ? `<img class="${opts.kind === "art" ? "art" : "cover"}" src="${esc(url)}" alt="">` : `<span class="drop-text"><b>Upload image</b>Click or drop a file here</span>`}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-upload="${key}" aria-label="${esc(label)}">
      </label>
      ${path ? `<div class="upload-actions"><button class="btn ghost small" data-remove-img="${key}">Remove</button></div>` : ""}
      ${opts.kind === "art" && meta && !meta.hasAlpha ? `<p class="note">This picture has a solid background, so it'll show as a rectangle instead of popping out of the card. For the full effect, remove the background first (remove.bg or Photopea work) and upload the PNG.</p>` : ""}
      ${opts.kind === "art" && meta && meta.hasAlpha ? `<p class="note ok">Transparent background detected. I trimmed the empty space around the character.</p>` : ""}
      ${opts.help ? `<p class="hint" style="margin:0;font-size:13px;color:var(--ink-3)">${opts.help}</p>` : ""}
    </div>`;
  }

  /* ---------- character view ---------- */
  function charView(c, i) {
    const col = c.color || D.PALETTE[i % D.PALETTE.length];
    const mod = (n) => { const v = Math.floor((Number(n) - 10) / 2); return isNaN(v) ? "" : (v >= 0 ? "+" : "−") + Math.abs(v); };
    const stats = c.stats || {};
    const extra = Object.entries(c.extra || {});
    const host = location.host || "dnd.volbeat.vip";
    return `${datalists()}
    <div class="ed-head">
      <div><h1>${esc(c.name || "Untitled")}</h1><p>${c.hidden ? "Hidden from the site" : "Shown on the site"} · character ${i + 1} of ${state.chars.length}</p></div>
      <div class="ed-actions">
        <button class="btn ghost small" data-act="up" ${i === 0 ? "disabled" : ""} title="Move earlier in the list">↑</button>
        <button class="btn ghost small" data-act="down" ${i === state.chars.length - 1 ? "disabled" : ""} title="Move later in the list">↓</button>
        <button class="btn ghost small" data-act="reimport">Update from D&amp;D Beyond</button>
        <button class="btn ghost small" data-act="duplicate">Duplicate</button>
        <button class="btn danger small" data-act="delete">Delete</button>
      </div>
    </div>

    <section class="sec">
      <h2>Look</h2>
      <p class="hint">Their signature colour is used for their card and their whole page.</p>
      <div class="color-row">
        ${colorField('data-c="color"', col)}
        <div class="swatches">${D.PALETTE.map((p) => `<button class="swatch${p.toLowerCase() === String(col).toLowerCase() ? " on" : ""}" style="--s:${p}" data-swatch="${p}" aria-label="Use ${p}"></button>`).join("")}</div>
      </div>
      <div class="uploads" style="margin-top:16px">
        ${uploadBox("Character art", "art", c.art, { kind: "art", color: col, help: "A PNG with a transparent background, tall and cropped close to the character." })}
        ${uploadBox("Page background", "backgroundImage", c.backgroundImage, { kind: "bg", help: "Optional scene behind them on their page. It fades into their colour on the text side." })}
      </div>
      <div class="grid" style="margin-top:18px">
        <label class="field full"><span>Drop shadow</span>${chipRow("c.shadow", [["", "Site default"], ["on", "On"], ["none", "Off"]], c.shadow || "")}</label>
        <label class="field full"><span>Glow / outline around them</span>${chipRow("c.glow", [["", "Site default"], ...D.GLOWS], c.glow || "")}</label>
        <label class="field"><span>Glow / outline colour</span><span class="color-row">${colorField('data-c="glowColor"', c.glowColor || state.site.style.glowColor)}${c.glowColor ? '<button class="link-btn" data-act="glow-color-reset">Use site colour</button>' : ""}</span></label>
        <label class="field full"><span>Card pattern</span>${chipRow("c.cardPattern", [["", "Site default"], ...D.PATTERNS], c.cardPattern || "")}</label>
        <label class="field full"><span>Pattern on their page</span>${chipRow("c.pagePattern", [["", "Site default"], ...D.PATTERNS], c.pagePattern || "")}</label>
      </div>
      <div style="margin-top:16px"><label class="toggle"><input type="checkbox" data-c="hidden" data-type="bool" ${c.hidden ? "checked" : ""}> Hide this character from the site</label></div>
    </section>

    <section class="sec">
      <h2>Basics</h2>
      <div class="grid">
        ${text("Name", 'data-c="name"', c.name, { id: "f-name" })}
        ${text("Title / epithet", 'data-c="epithet"', c.epithet, { placeholder: "e.g. The Unquiet Mind" })}
        ${text("Played by", 'data-c="player"', c.player)}
        <label class="field"><span>Folder</span><select data-c="folder"><option value="">No folder</option>${(state.site.folders || []).map((f) => `<option value="${esc(f.id)}"${f.id === c.folder ? " selected" : ""}>${esc(f.name)}</option>`).join("")}</select></label>
        <label class="field"><span>Link <small>(their own web address)</small></span><span class="prefixed"><b>${esc(host)}/#</b><input type="text" data-c="id" value="${esc(c.id)}" spellcheck="false"></span></label>
      </div>
    </section>

    <section class="sec">
      <h2>D&amp;D details</h2>
      <div class="grid">
        ${text("Race / species", 'data-c="race"', c.race, { list: "dl-race" })}
        ${text("Subrace / lineage", 'data-c="subrace"', c.subrace)}
        ${text("Class", 'data-c="class"', c.class, { list: "dl-class" })}
        ${text("Subclass", 'data-c="subclass"', c.subclass)}
        ${text("Level", 'data-c="level" data-type="num"', c.level, { type: "number", min: 0, max: 30 })}
        ${text("Multiclass", 'data-c="multiclass"', c.multiclass, { placeholder: "e.g. Warlock 2 (The Fiend)" })}
        ${text("Background", 'data-c="background"', c.background)}
        ${text("Alignment", 'data-c="alignment"', c.alignment, { list: "dl-align" })}
        ${text("Deity / faith", 'data-c="deity"', c.deity)}
        ${text("Age", 'data-c="age"', c.age)}
        ${text("Height", 'data-c="height"', c.height)}
        ${text("Pronouns", 'data-c="pronouns"', c.pronouns)}
        ${text("Status", 'data-c="status"', c.status, { list: "dl-status" })}
      </div>
    </section>

    <section class="sec">
      <h2>Ability scores</h2>
      <p class="hint">Modifiers are worked out for you. Clear a box to hide that score.</p>
      <div class="stats-edit">
        ${ABIL.map((a) => `<div class="stat-box"><label for="st-${a}">${a}</label><input id="st-${a}" type="number" min="1" max="30" data-stat="${a}" value="${esc(stats[a] ?? "")}"><small data-mod="${a}">${has(stats[a]) ? mod(stats[a]) : ""}</small></div>`).join("")}
      </div>
    </section>

    <section class="sec">
      <h2>Story</h2>
      <div class="grid">
        ${text("Quote", 'data-c="quote"', c.quote, { full: true, placeholder: "Something they'd say" })}
        ${area("Biography", 'data-c="bio" data-type="paras"', (c.bio || []).join("\n\n"), { full: true, rows: 7, hint: "(leave a blank line between paragraphs)" })}
        ${area("Quirks &amp; traits", 'data-c="traits" data-type="lines"', (c.traits || []).join("\n"), { rows: 4, hint: "(one per line)" })}
        ${area("Goals", 'data-c="goals"', c.goals, { rows: 4 })}
      </div>
    </section>

    <section class="sec">
      <h2>Extra details</h2>
      <p class="hint">Anything else for their Details box, like Patron, Familiar, Homeland or Eyes.</p>
      <div class="kv" id="kv">
        ${extra.map(([k, v], n) => `<div class="kv-row" data-kv="${n}"><input type="text" data-kv-k value="${esc(k)}" placeholder="Label" aria-label="Label"><input type="text" data-kv-v value="${esc(v)}" placeholder="Value" aria-label="Value"><button class="icon-btn" data-kv-del="${n}" aria-label="Remove row">✕</button></div>`).join("")}
      </div>
      <button class="btn ghost small" data-act="kv-add" style="margin-top:10px">+ Add a detail</button>
    </section>`;
  }

  /* ---------- site view ---------- */
  function siteView() {
    const s = state.site, st = s.style;
    const fontOpts = (sel, headingOk) => Object.entries(D.FONTS)
      .filter(([, f]) => headingOk || !f.headingOnly)
      .map(([name, f]) => `<option value="${esc(name)}"${name === sel ? " selected" : ""}>${esc(f.label)}</option>`).join("");
    const range = (label, key, min, max, step, unit) => `<label class="field"><span>${label}</span><span class="range"><input type="range" data-st="${key}" data-type="num" min="${min}" max="${max}" step="${step}" value="${esc(st[key])}"><output data-out="${key}" data-unit="${unit}">${esc(st[key])}${unit}</output></span></label>`;
    const folders = s.folders || [];
    const count = (id) => state.chars.filter((c) => c.folder === id).length;
    const colour = (label, key) => `<label class="field"><span>${label}</span>${colorField(`data-st="${key}"`, st[key])}</label>`;
    return `
    <div class="ed-head"><div><h1>Site &amp; style</h1><p>Titles, colours, fonts, zoom and backgrounds for the whole site.</p></div>
      <div class="ed-actions"><button class="btn ghost small" data-act="reset-style">Reset style to default</button></div></div>

    <section class="sec">
      <h2>Text</h2>
      <div class="grid">
        ${text("Site name", 'data-s="title"', s.title, { hint: "(top left)" })}
        ${text("Tagline", 'data-s="subtitle"', s.subtitle, { hint: "(footer)" })}
        ${text("Big title", 'data-s="heroTitle"', s.heroTitle)}
        ${text("Character section heading", 'data-s="browseHeading"', s.browseHeading)}
        ${area("Intro", 'data-s="intro"', s.intro, { full: true, rows: 2 })}
      </div>
    </section>

    <section class="sec">
      <h2>Colours</h2>
      <div class="grid">
        ${colour("Accent (buttons, highlights)", "accent")}
        ${colour("Text", "text")}
        ${colour("Page background", "pageBg")}
        ${colour("Character section background", "browseBg")}
      </div>
    </section>

    <section class="sec">
      <h2>Fonts</h2>
      <div class="grid">
        <label class="field"><span>Headings</span><select data-st="headingFont">${fontOpts(st.headingFont, true)}</select>
          <span class="font-sample" style="font-family:${esc(D.fontStack(st.headingFont))}">${esc(s.heroTitle || "Characters")}</span></label>
        <label class="field"><span>Body text</span><select data-st="bodyFont">${fontOpts(st.bodyFont, false)}</select>
          <span class="font-sample" style="font-family:${esc(D.fontStack(st.bodyFont))};font-weight:400;font-size:16px">Raised in a mountain monastery, she copied texts no one else would touch.</span></label>
      </div>
    </section>

    <section class="sec">
      <h2>Home page</h2>
      <div class="grid">
        <label class="field full"><span>Top of the page</span>${chipRow("style.heroStyle", [["compact", "Compact: characters right away"], ["big", "Big title"]], st.heroStyle)}</label>
        ${range("Site zoom", "zoom", 70, 140, 5, "%")}
        <label class="toggle"><input type="checkbox" data-st="showDie" data-type="bool" ${st.showDie !== false ? "checked" : ""}> Show the d20 drawing</label>
      </div>
    </section>

    <section class="sec">
      <h2>Folders</h2>
      <p class="hint">Sort characters into groups like Main party, NPCs or Retired. Choose each character's folder on their page.</p>
      <div class="folder-rows">
        ${folders.map((f, n) => `<div class="folder-row">
          <input type="text" data-folder-name="${n}" value="${esc(f.name)}" aria-label="Folder name">
          <span class="folder-count">${count(f.id)} ${count(f.id) === 1 ? "character" : "characters"}</span>
          <button class="icon-btn" data-act="folder-up" data-f="${n}" ${n === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
          <button class="icon-btn" data-act="folder-down" data-f="${n}" ${n === folders.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
          <button class="icon-btn" data-act="folder-del" data-f="${n}" aria-label="Delete folder">✕</button>
        </div>`).join("") || '<p class="hint" style="margin:0">No folders yet.</p>'}
      </div>
      <button class="btn ghost small" data-act="folder-add" style="margin-top:12px">+ Add folder</button>
      ${folders.length ? `<label class="field" style="margin-top:16px"><span>Show folders on the site as</span>${chipRow("style.folderDisplay", [["tabs", "Tabs to switch between"], ["sections", "Sections, one after another"]], st.folderDisplay)}</label>` : ""}
    </section>

    <section class="sec">
      <h2>Character cards</h2>
      <div class="grid">
        ${range("Card size", "cardSize", 160, 360, 10, "px")}
        ${range("Card corner roundness", "cardRadius", 0, 120, 2, "px")}
        <label class="field full"><span>Pattern</span>${chipRow("style.pattern", D.PATTERNS, st.pattern)}</label>
      </div>
    </section>

    <section class="sec">
      <h2>Pop-out effects on character art</h2>
      <p class="hint">A drop shadow and a glow or outline that follow the shape of the character, so they stand out from their colour.</p>
      <div class="grid">
        <label class="field full"><span>Drop shadow</span>${chipRow("style.shadow", [["on", "On"], ["none", "Off"]], st.shadow)}</label>
        <label class="field full"><span>Shadow direction</span>${chipRow("style.shadowDirection", D.SHADOW_DIRS, st.shadowDirection)}</label>
        ${range("Shadow distance", "shadowDistance", 0, 30, 1, "px")}
        ${range("Shadow softness", "shadowSoftness", 0, 24, 1, "px")}
        ${range("Shadow darkness", "shadowOpacity", 0, 100, 5, "%")}
        <label class="field"><span>Shadow colour</span>${colorField('data-st="shadowColor"', st.shadowColor)}</label>
        <label class="field full"><span>Glow / outline</span>${chipRow("style.glow", D.GLOWS, st.glow)}</label>
        <label class="field"><span>Glow / outline colour</span>${colorField('data-st="glowColor"', st.glowColor)}</label>
        ${range("Glow / outline size", "glowSize", 1, 12, 1, "px")}
        <label class="toggle full"><input type="checkbox" data-st="effectsOnPage" data-type="bool" ${st.effectsOnPage !== false ? "checked" : ""}> Use these effects on character pages too, not just the cards</label>
        <p class="hint full" style="margin:0">Effects need art with a transparent background to follow the character's shape.</p>
      </div>
    </section>

    <section class="sec">
      <h2>Character pages</h2>
      <div class="grid">
        <label class="toggle full"><input type="checkbox" data-st="lockHeader" data-type="bool" ${st.lockHeader !== false ? "checked" : ""}> Keep the name and details box in place; only the story scrolls</label>
        <label class="field full"><span>Details box position</span>${chipRow("style.detailsPosition", [["above", "Above the story"], ["below", "Below the story"], ["beside", "Beside the story"]], st.detailsPosition)}</label>
        <label class="field full"><span>Page pattern</span>${chipRow("style.pagePattern", [["", "Same as cards"], ...D.PATTERNS], st.pagePattern || "")}</label>
      </div>
      <p class="hint" style="margin:12px 0 0">On phones the whole page scrolls normally.</p>
    </section>

    <section class="sec">
      <h2>Background images</h2>
      <p class="hint">Optional. Wide photos or paintings work best.</p>
      <div class="uploads">
        ${uploadBox("Top of the page", "style.heroImage", st.heroImage, { kind: "bg", wide: true, help: "Replaces the d20 drawing. Keep it light so the title stays readable." })}
        ${uploadBox("Character section", "style.browseImage", st.browseImage, { kind: "bg", wide: true, help: "Shown behind the character cards." })}
      </div>
    </section>`;
  }

  /* ---------- import view ---------- */
  function importView() {
    const target = state.view.target != null ? state.chars[state.view.target] : null;
    const r = state.importResult;
    const banner = target
      ? `<div class="mode-banner">Updating <b>${esc(target.name)}</b>. The details you tick below will replace theirs; their art, colour and anything you leave unticked stay as they are.</div>`
      : `<div class="mode-banner">This creates a new character. You can review everything before it's added.</div>`;

    if (r) {
      const rows = importRows(r, target);
      return `<div class="ed-head"><div><h1>Review import</h1><p>Found in your ${esc(r._source || "file")}. Untick anything you don't want.</p></div></div>
        ${banner}
        <section class="sec">
          <table class="review"><tbody>
            ${rows.map((row, n) => `<tr><td><input type="checkbox" data-imp="${n}" ${row.on ? "checked" : ""} aria-label="Include ${esc(row.label)}"></td><td>${esc(row.label)}</td><td class="${row.changed ? "changed" : ""}">${esc(row.show)}</td></tr>`).join("")}
          </tbody></table>
          ${r._avatar ? `<p class="hint" style="margin-top:14px">D&amp;D Beyond has a portrait for this character: <a href="${esc(r._avatar)}" target="_blank" rel="noopener">open it</a>. Save it, remove the background, then upload it as their art.</p>` : ""}
        </section>
        <div class="ed-actions">
          <button class="btn primary" data-act="imp-apply">${target ? `Update ${esc(target.name)}` : "Add character"}</button>
          <button class="btn ghost" data-act="imp-cancel">Start over</button>
        </div>`;
    }

    return `<div class="ed-head"><div><h1>Import from D&amp;D Beyond</h1><p>Bring in a character's race, class, level, scores and story.</p></div></div>
      ${banner}
      ${state.importError ? `<p class="note" style="margin-bottom:14px">${state.importError}</p>` : ""}
      <div class="import-modes">
        <section class="sec">
          <h2>Upload a file</h2>
          <p class="hint">Either the PDF from D&amp;D Beyond (on the character sheet: <b>Manage → Export to PDF</b>), or the <b>.json</b> file from the bookmark below.</p>
          <label class="drop big-drop" data-drop="import">
            <span class="drop-text"><b>Choose a PDF or JSON file</b>or drop it here</span>
            <input type="file" accept=".pdf,.json,application/pdf,application/json" data-upload="import" aria-label="Character file">
          </label>
        </section>

        <section class="sec">
          <h2>Paste the character link</h2>
          <p class="hint">Works when the character's privacy is set to <b>Public</b> on D&amp;D Beyond.</p>
          <form class="inline-form" data-form="ddb-link">
            <input type="text" id="ddb-link" placeholder="https://www.dndbeyond.com/characters/12345678" spellcheck="false">
            <button class="btn primary" type="submit">Fetch</button>
          </form>
        </section>

        <section class="sec">
          <h2>One-click bookmark <small style="font-weight:500;color:var(--ink-3)">(most complete)</small></h2>
          <p class="hint">Gets the full character data, including private characters you can see.</p>
          <a class="bookmarklet" id="bookmarklet" href="#">⬇ Get D&amp;D Beyond character</a>
          <ol class="howto">
            <li>Drag that button onto your browser's bookmarks bar (once).</li>
            <li>Open your character on dndbeyond.com and click the bookmark. It downloads a <b>.json</b> file.</li>
            <li>Upload that file above.</li>
          </ol>
        </section>
      </div>`;
  }

  function importRows(r, target) {
    const rows = [];
    const add = (label, key, value, show, on = true) => {
      if (!has(show)) return;
      const cur = target ? JSON.stringify(target[key] ?? "") : "";
      rows.push({ label, key, value, show, on, changed: target && cur !== JSON.stringify(value) });
    };
    [["Name", "name"], ["Player", "player"], ["Race", "race"], ["Subrace", "subrace"], ["Class", "class"], ["Subclass", "subclass"],
      ["Multiclass", "multiclass"], ["Level", "level"], ["Background", "background"], ["Alignment", "alignment"], ["Deity", "deity"],
      ["Age", "age"], ["Height", "height"]].forEach(([label, key]) => add(label, key, r[key], r[key]));
    if (r.stats && Object.keys(r.stats).length) add("Ability scores", "stats", r.stats, Object.entries(r.stats).map(([k, v]) => `${k} ${v}`).join(" · "));
    if (r.extra && Object.keys(r.extra).length) add("Looks", "extra", r.extra, Object.entries(r.extra).map(([k, v]) => `${k}: ${v}`).join("\n"));
    if (r.bio && r.bio.length) add("Biography", "bio", r.bio, r.bio.join("\n\n"), !target || !(target.bio || []).length);
    if (r.traits && r.traits.length) add("Personality", "traits", r.traits, r.traits.join("\n"), !target || !(target.traits || []).length);
    if (has(r.goals)) add("Ideals → Goals", "goals", r.goals, r.goals, !target || !has(target.goals));
    Object.entries(r._more || {}).forEach(([k, v]) => {
      if (!has(v)) return;
      if (k === "Bonds" || k === "Flaws") rows.push({ label: k + " → Quirks", key: "_trait", value: `${k === "Bonds" ? "Bond" : "Flaw"}: ${v}`, show: v, on: false });
      else rows.push({ label: k + " → Details", key: "_extra", extraKey: k, value: v, show: v, on: false });
    });
    state._importRows = rows;
    return rows;
  }

  function applyImport() {
    const rows = state._importRows || [];
    const checked = new Set($$("[data-imp]").filter((b) => b.checked).map((b) => Number(b.dataset.imp)));
    const targetIndex = state.view.target;
    const c = targetIndex != null && state.chars[targetIndex] ? state.chars[targetIndex] : newCharacter(state.importResult.name);
    rows.forEach((row, n) => {
      if (!checked.has(n)) return;
      if (row.key === "_trait") c.traits = [...(c.traits || []), row.value];
      else if (row.key === "_extra") c.extra = Object.assign({}, c.extra, { [row.extraKey]: row.value });
      else if (row.key === "extra") c.extra = Object.assign({}, c.extra, row.value);
      else if (row.key === "stats") c.stats = Object.assign({}, row.value);
      else c[row.key] = clone(row.value);
    });
    let i = targetIndex;
    if (i == null || !state.chars[i]) {
      c.id = uniqueId(c.name);
      state.chars.push(c);
      i = state.chars.length - 1;
    }
    state.importResult = null;
    go({ type: "char", i });
    changed();
    toast(`${targetIndex != null ? "Updated" : "Added"} ${c.name}. Check it over, add art, then Publish.`, "ok", 4500);
  }

  async function runImport(promise) {
    state.importError = "";
    updateStatus("Reading…");
    try {
      state.importResult = await promise;
    } catch (err) {
      state.importResult = null;
      state.importError = esc(err.message || String(err));
    }
    updateStatus();
    renderEditor();
  }

  /* =========================================================
     Editing events
     ========================================================= */
  const editor = $("#editor");
  const cur = () => (state.view.type === "char" ? state.chars[state.view.i] : null);

  function readValue(el) {
    const t = el.dataset.type;
    if (t === "bool") return el.checked;
    if (t === "num") return el.value === "" ? "" : Number(el.value);
    if (t === "paras") return el.value.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    if (t === "lines") return el.value.split("\n").map((p) => p.trim()).filter(Boolean);
    return el.value;
  }
  function syncColorPair(el, value) {
    const box = el.closest(".color-input");
    if (!box) return;
    $$("input", box).forEach((x) => { if (x !== el && /^#[0-9a-f]{6}$/i.test(value)) x.value = value; });
  }
  const validColor = (v) => /^#[0-9a-f]{6}$/i.test(v);

  editor.addEventListener("input", (e) => {
    const el = e.target;
    const c = cur();
    if (el.dataset.c && c) {
      const key = el.dataset.c;
      let v = readValue(el);
      if (key === "color" || key === "glowColor") { syncColorPair(el, v); if (!validColor(v)) return; if (key === "color") renderSwatches(v); }
      if (key === "id") { v = slug(v); }
      if (key === "name") {
        const wasAuto = c.id === uniqueId(c.name, state.view.i) || c.id === slug(c.name);
        if (wasAuto && !state.baseById.has(c.id)) c.id = uniqueId(v || "character", state.view.i);
        const h = $(".ed-head h1"); if (h) h.textContent = v || "Untitled";
        const idIn = $('[data-c="id"]'); if (idIn && idIn !== el) idIn.value = c.id;
      }
      if (key === "folder" && !v) delete c.folder; else c[key] = v;
      if (key === "color") { const d = $$('.drop[data-drop="art"]'); d.forEach((x) => x.style.setProperty("--c", v)); }
      changed();
      return;
    }
    if (el.dataset.stat && c) {
      c.stats = Object.assign({}, c.stats);
      if (el.value === "") delete c.stats[el.dataset.stat];
      else c.stats[el.dataset.stat] = Number(el.value);
      const m = $(`[data-mod="${el.dataset.stat}"]`);
      if (m) { const v = Math.floor((Number(el.value) - 10) / 2); m.textContent = el.value === "" ? "" : (v >= 0 ? "+" : "−") + Math.abs(v); }
      changed({ side: false });
      return;
    }
    if (el.matches("[data-kv-k], [data-kv-v]") && c) {
      const extra = {};
      $$(".kv-row").forEach((row) => {
        const k = $("[data-kv-k]", row).value.trim(), v = $("[data-kv-v]", row).value;
        if (k) extra[k] = v;
      });
      c.extra = extra;
      changed({ side: false });
      return;
    }
    if (el.dataset.folderName !== undefined) {
      const f = state.site.folders[Number(el.dataset.folderName)];
      if (f) { f.name = el.value; changed(); }
      return;
    }
    if (el.dataset.s) { state.site[el.dataset.s] = readValue(el); changed({ side: false }); return; }
    if (el.dataset.st) {
      const key = el.dataset.st;
      const v = readValue(el);
      if (el.closest(".color-input")) { syncColorPair(el, v); if (!validColor(v)) return; }
      state.site.style[key] = v;
      const out = $(`[data-out="${key}"]`);
      if (out) out.textContent = v + (out.dataset.unit || "");
      if (key === "headingFont" || key === "bodyFont") {
        const sample = el.parentElement.querySelector(".font-sample");
        if (sample) sample.style.fontFamily = D.fontStack(v);
      }
      changed({ side: false });
    }
  });
  editor.addEventListener("change", (e) => {
    const el = e.target;
    if (el.matches('select[data-st], input[type=checkbox][data-st]')) {
      state.site.style[el.dataset.st] = readValue(el);
      changed({ side: false });
    }
    if (el.matches('input[type=checkbox][data-c]') && cur()) {
      cur()[el.dataset.c] = readValue(el);
      renderEditor(); changed();
    }
    if (el.matches("input[type=file][data-upload]") && el.files && el.files[0]) {
      handleFile(el.dataset.upload, el.files[0]);
      el.value = "";
    }
  });

  function renderSwatches(v) {
    $$(".swatch").forEach((s) => s.classList.toggle("on", s.dataset.swatch.toLowerCase() === String(v).toLowerCase()));
  }

  editor.addEventListener("click", async (e) => {
    const t = e.target;
    const sw = t.closest("[data-swatch]");
    if (sw && cur()) {
      e.preventDefault();
      cur().color = sw.dataset.swatch;
      $$('[data-c="color"]').forEach((x) => { x.value = sw.dataset.swatch; });
      renderSwatches(sw.dataset.swatch);
      $$('.drop[data-drop="art"]').forEach((x) => x.style.setProperty("--c", sw.dataset.swatch));
      changed();
      return;
    }
    const chip = t.closest("[data-chip]");
    if (chip) {
      e.preventDefault();
      const [scope, key] = chip.dataset.chip.split(".");
      const val = chip.dataset.val;
      if (scope === "style") state.site.style[key] = val;
      else if (scope === "c" && cur()) { if (val) cur()[key] = val; else delete cur()[key]; }
      $$(`[data-chip="${chip.dataset.chip}"]`).forEach((b) => b.classList.toggle("on", b === chip));
      changed({ side: false });
      return;
    }
    const rm = t.closest("[data-remove-img]");
    if (rm) { e.preventDefault(); setImage(rm.dataset.removeImg, ""); return; }
    const kvDel = t.closest("[data-kv-del]");
    if (kvDel && cur()) {
      e.preventDefault();
      kvDel.closest(".kv-row").remove();
      const extra = {};
      $$(".kv-row").forEach((row) => { const k = $("[data-kv-k]", row).value.trim(); if (k) extra[k] = $("[data-kv-v]", row).value; });
      cur().extra = extra;
      changed({ side: false });
      return;
    }
    if (t.closest("#bookmarklet")) { e.preventDefault(); toast("Drag this button onto your bookmarks bar, then click it while viewing a character on dndbeyond.com.", "", 5000); return; }
    const act = t.closest("[data-act]");
    if (!act) return;
    e.preventDefault();
    const i = state.view.i, c = cur();
    switch (act.dataset.act) {
      case "up": case "down": {
        const j = act.dataset.act === "up" ? i - 1 : i + 1;
        if (j < 0 || j >= state.chars.length) return;
        [state.chars[i], state.chars[j]] = [state.chars[j], state.chars[i]];
        go({ type: "char", i: j }); changed();
        break;
      }
      case "duplicate": {
        const copy = clone(cleanChar(c));
        copy.name = c.name + " (copy)";
        copy.id = uniqueId(copy.name);
        state.chars.splice(i + 1, 0, copy);
        go({ type: "char", i: i + 1 }); changed();
        break;
      }
      case "delete":
        if (!confirm(`Delete ${c.name || "this character"}? It disappears from the site when you publish.`)) return;
        state.chars.splice(i, 1);
        go(state.chars.length ? { type: "char", i: Math.max(0, i - 1) } : { type: "site" });
        changed();
        break;
      case "reimport":
        go({ type: "import", target: i });
        break;
      case "kv-add": {
        const kv = $("#kv");
        const n = $$(".kv-row").length;
        kv.insertAdjacentHTML("beforeend", `<div class="kv-row" data-kv="${n}"><input type="text" data-kv-k placeholder="Label" aria-label="Label"><input type="text" data-kv-v placeholder="Value" aria-label="Value"><button class="icon-btn" data-kv-del="${n}" aria-label="Remove row">✕</button></div>`);
        $$("[data-kv-k]").pop().focus();
        break;
      }
      case "glow-color-reset":
        delete c.glowColor;
        renderEditor(); changed({ side: false });
        break;
      case "folder-add": {
        state.site.folders = [...(state.site.folders || []), { id: "f-" + Date.now().toString(36), name: "New folder" }];
        renderEditor(); changed();
        const ins = $$("[data-folder-name]"); const last = ins[ins.length - 1];
        if (last) { last.focus(); last.select(); }
        break;
      }
      case "folder-up": case "folder-down": {
        const n = Number(act.dataset.f), m = act.dataset.act === "folder-up" ? n - 1 : n + 1;
        const f = state.site.folders;
        if (m < 0 || m >= f.length) return;
        [f[n], f[m]] = [f[m], f[n]];
        renderEditor(); changed();
        break;
      }
      case "folder-del": {
        const n = Number(act.dataset.f), f = state.site.folders[n];
        if (!f) return;
        const inIt = state.chars.filter((c) => c.folder === f.id);
        if (!confirm(`Delete the folder "${f.name}"?` + (inIt.length ? ` Its ${inIt.length} character${inIt.length === 1 ? "" : "s"} will be kept, just without a folder.` : ""))) return;
        inIt.forEach((c) => { delete c.folder; });
        state.site.folders.splice(n, 1);
        renderEditor(); changed();
        break;
      }
      case "reset-style":
        if (!confirm("Reset colours, fonts, zoom, cards and page layout to the defaults? Your folders and background images are kept.")) return;
        state.site.style = Object.assign({}, D.DEFAULT_SITE.style, { heroImage: state.site.style.heroImage, browseImage: state.site.style.browseImage, folderDisplay: state.site.style.folderDisplay });
        renderEditor(); changed({ side: false });
        break;
      case "imp-apply": applyImport(); break;
      case "imp-cancel": state.importResult = null; state.importError = ""; renderEditor(); break;
    }
  });

  editor.addEventListener("submit", (e) => {
    const f = e.target.closest('[data-form="ddb-link"]');
    if (!f) return;
    e.preventDefault();
    const raw = $("#ddb-link").value;
    const id = I.idFromLink(raw);
    if (!id) { state.importError = "That doesn't look like a D&amp;D Beyond character link. It should look like dndbeyond.com/characters/12345678."; renderEditor(); return; }
    runImport(I.fetchById(id).catch((err) => {
      const url = I.serviceUrl(id);
      throw new Error(`${err.message === "Failed to fetch" ? "D&D Beyond didn't let this page read the character directly." : err.message} Use the bookmark below instead, or open ${url} in a new tab, save it with Ctrl+S / Cmd+S as a .json file, and upload it above.`);
    }));
  });

  // drag & drop onto any drop zone
  editor.addEventListener("dragover", (e) => { const d = e.target.closest("[data-drop]"); if (d) { e.preventDefault(); d.classList.add("drag"); } });
  editor.addEventListener("dragleave", (e) => { const d = e.target.closest("[data-drop]"); if (d) d.classList.remove("drag"); });
  editor.addEventListener("drop", (e) => {
    const d = e.target.closest("[data-drop]");
    if (!d) return;
    e.preventDefault(); d.classList.remove("drag");
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(d.dataset.drop, f);
  });

  /* =========================================================
     Images
     ========================================================= */
  async function decode(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file); } catch { /* fall back below */ }
    }
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("That file couldn't be opened as an image."));
      img.src = URL.createObjectURL(file);
    });
  }
  const canvasBlob = (cv, type, q) => new Promise((res) => cv.toBlob(res, type, q));

  async function processImage(file, kind) {
    const img = await decode(file);
    const w0 = img.width, h0 = img.height;
    let cv = document.createElement("canvas");
    cv.width = w0; cv.height = h0;
    let ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    // transparency check (and trim empty margins on character art)
    let hasAlpha = false;
    if (kind === "art" && /png|webp|gif/.test(file.type || "png")) {
      const data = ctx.getImageData(0, 0, w0, h0).data;
      let minX = w0, minY = h0, maxX = -1, maxY = -1, clear = 0;
      for (let y = 0; y < h0; y++) {
        for (let x = 0; x < w0; x++) {
          const a = data[(y * w0 + x) * 4 + 3];
          if (a < 250) clear++;
          if (a > 12) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        }
      }
      hasAlpha = clear > w0 * h0 * 0.02;
      if (hasAlpha && maxX >= 0 && (minX > 0 || minY > 0 || maxX < w0 - 1 || maxY < h0 - 1)) {
        const tw = maxX - minX + 1, th = maxY - minY + 1;
        const t = document.createElement("canvas");
        t.width = tw; t.height = th;
        t.getContext("2d").drawImage(cv, minX, minY, tw, th, 0, 0, tw, th);
        cv = t;
      }
    }

    // resize
    const maxW = kind === "art" ? 1400 : 2400, maxH = kind === "art" ? 1800 : 1800;
    const scale = Math.min(1, maxW / cv.width, maxH / cv.height);
    if (scale < 1) {
      const r = document.createElement("canvas");
      r.width = Math.round(cv.width * scale); r.height = Math.round(cv.height * scale);
      const rc = r.getContext("2d");
      rc.imageSmoothingQuality = "high";
      rc.drawImage(cv, 0, 0, r.width, r.height);
      cv = r;
    }
    const png = kind === "art" && hasAlpha;
    const blob = await canvasBlob(cv, png ? "image/png" : "image/jpeg", png ? undefined : 0.86);
    if (img.close) img.close();
    return { blob, ext: png ? "png" : "jpg", hasAlpha };
  }

  async function handleFile(key, file) {
    if (key === "import") { runImport(I.fromFile(file)); return; }
    if (!/^image\//.test(file.type)) { toast("That isn't an image file.", "err"); return; }
    const c = cur();
    const kind = key === "art" ? "art" : "bg";
    updateStatus("Preparing image…");
    try {
      const out = await processImage(file, kind);
      const folder = key === "art" ? "characters" : key === "backgroundImage" ? "backgrounds" : "site";
      const base = key.startsWith("style.") ? key.slice(6).replace(/Image$/, "").toLowerCase() : (c && c.id) || "image";
      const path = `images/${folder}/${slug(base) || "image"}-${Date.now().toString(36)}.${out.ext}`;
      state.pending.set(path, out.blob);
      state.urls.set(path, URL.createObjectURL(out.blob));
      state.meta.set(path, { hasAlpha: out.hasAlpha });
      setImage(key, path);
      const kb = Math.round(out.blob.size / 1024);
      toast(`Image ready (${kb > 1024 ? (kb / 1024).toFixed(1) + " MB" : kb + " KB"}). It goes live when you publish.`, "ok");
    } catch (err) {
      updateStatus();
      toast(err.message || "Couldn't process that image.", "err", 5000);
    }
  }

  function setImage(key, path) {
    if (key.startsWith("style.")) state.site.style[key.slice(6)] = path;
    else if (cur()) cur()[key] = path;
    renderEditor();
    changed();
  }

  /* =========================================================
     Live preview
     ========================================================= */
  const frame = $("#preview");
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.type === "dnd-preview-ready") { state.previewReady = true; sendPreview(); }
  });
  function sendPreview() {
    if (!state.previewReady || !state.site || !frame.contentWindow) return;
    const show = state.view.type === "char" && state.chars[state.view.i] ? state.chars[state.view.i].id : "";
    frame.contentWindow.postMessage({
      type: "dnd-preview",
      site: clone(state.site),
      characters: state.chars.map(cleanChar),
      images: Object.fromEntries(allImagePaths().map((p) => [p, imgUrl(p)])),
      show,
    }, location.origin);
  }

  function layoutPreview() {
    const box = $("#preview-frame");
    const W = box.clientWidth, H = box.clientHeight;
    if (!W || !H) return;
    box.classList.toggle("phone", state.device === "phone");
    if (state.device === "phone") {
      const s = Math.min(1, (H - 44) / 844, (W - 40) / 390);
      frame.style.width = "390px"; frame.style.height = "844px";
      frame.style.transform = `scale(${s})`;
      frame.style.marginLeft = `${(-390 * s) / 2}px`;
    } else {
      const vw = 1280, s = W / vw;
      frame.style.width = vw + "px"; frame.style.height = H / s + "px";
      frame.style.transform = `scale(${s})`;
      frame.style.marginLeft = "0";
    }
  }
  new ResizeObserver(layoutPreview).observe($("#preview-frame"));
  $("#device-seg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-device]");
    if (!b) return;
    state.device = b.dataset.device;
    $$("#device-seg button").forEach((x) => x.classList.toggle("on", x === b));
    layoutPreview();
  });
  $("#btn-preview").addEventListener("click", () => { $("#preview-pane").classList.add("open"); setTimeout(layoutPreview, 320); });
  $("#btn-preview-close").addEventListener("click", () => $("#preview-pane").classList.remove("open"));

  /* =========================================================
     Publish
     ========================================================= */
  function commitMessage() {
    let before = [];
    try { before = JSON.parse(state.base.chars); } catch { /* none */ }
    const beforeIds = new Map(before.map((c) => [c.id, c]));
    const nowIds = new Set(state.chars.map((c) => c.id));
    const added = state.chars.filter((c) => !beforeIds.has(c.id)).map((c) => c.name);
    const removed = before.filter((c) => !nowIds.has(c.id)).map((c) => c.name);
    const edited = state.chars.filter((c) => beforeIds.has(c.id) && charChanged(c)).map((c) => c.name);
    const parts = [];
    if (added.length) parts.push("add " + added.join(", "));
    if (edited.length) parts.push("update " + edited.join(", "));
    if (removed.length) parts.push("remove " + removed.join(", "));
    if (siteText() !== state.base.site) parts.push("update site style");
    if (!parts.length && charsText() !== state.base.chars) parts.push("reorder characters");
    return "Admin: " + (parts.join("; ") || "update site");
  }

  async function publish() {
    if (state.busy || !isDirty()) return;
    state.busy = true;
    const btn = $("#btn-publish");
    btn.disabled = true; btn.textContent = "Publishing…";
    updateStatus("Publishing…");
    try {
      const sText = siteText(), cText = charsText();
      const sChanged = sText !== state.base.site, cChanged = cText !== state.base.chars;

      const ref = await gh("GET", `/repos/${state.repo}/git/ref/heads/${BRANCH}`);
      const head = ref.object.sha;
      if (head !== state.headSha) {
        const remote = await readRemote(head);
        const clash = (sChanged && remote.site !== state.remote.site) || (cChanged && remote.chars !== state.remote.chars);
        if (clash && !confirm("The site was changed somewhere else since you opened admin. Publishing will replace those changes with yours. Publish anyway?")) {
          throw new Error("Publish cancelled. Use Discard to load the latest version.");
        }
      }
      const headCommit = await gh("GET", `/repos/${state.repo}/git/commits/${head}`);

      const tree = [];
      const images = referencedImages();
      for (const path of images) {
        const blob = await gh("POST", `/repos/${state.repo}/git/blobs`, { content: await blobToB64(state.pending.get(path)), encoding: "base64" });
        tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
      }
      if (sChanged) tree.push({ path: "data/site.json", mode: "100644", type: "blob", content: sText });
      if (cChanged) tree.push({ path: "data/characters.json", mode: "100644", type: "blob", content: cText });

      const newTree = await gh("POST", `/repos/${state.repo}/git/trees`, { base_tree: headCommit.tree.sha, tree });
      const commit = await gh("POST", `/repos/${state.repo}/git/commits`, { message: commitMessage(), tree: newTree.sha, parents: [head] });
      await gh("PATCH", `/repos/${state.repo}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false });

      state.headSha = commit.sha;
      state.remote = { site: sChanged ? sText : (await readRemote(commit.sha)).site, chars: cChanged ? cText : state.remote.chars };
      images.forEach((p) => state.pending.delete(p));
      setBaseline();
      state.busy = false;
      renderSide(); renderEditor();
      updateStatus("Published. Going live…", "ok");
      toast("Published! The site updates in about a minute.", "ok", 4500);
      watchLive(sText, cText);
    } catch (err) {
      state.busy = false;
      updateStatus("Not published", "err");
      toast(err.message || "Publishing failed.", "err", 7000);
    } finally {
      state.busy = false;
      btn.textContent = "Publish";
      setTimeout(() => updateStatus(), 4000);
    }
  }
  $("#btn-publish").addEventListener("click", publish);

  // Poll the live site until GitHub Pages is serving what we just published.
  let liveTimer = null;
  function watchLive(sText, cText) {
    clearTimeout(liveTimer);
    let tries = 0;
    const check = async () => {
      tries++;
      try {
        const get = (p) => fetch(`${p}?t=${Date.now()}`, { cache: "no-store" }).then((r) => (r.ok ? r.text() : ""));
        const [s, c] = await Promise.all([get("data/site.json"), get("data/characters.json")]);
        if (s === sText && c === cText) {
          if (!isDirty()) updateStatus("Live on the site ✓", "ok");
          toast("Your changes are live on the site ✓", "ok");
          return;
        }
      } catch { /* keep waiting */ }
      if (tries < 30) liveTimer = setTimeout(check, 8000);
    };
    liveTimer = setTimeout(check, 15000);
  }

  /* ---------- discard / sign out / leaving ---------- */
  $("#btn-discard").addEventListener("click", async () => {
    if (!confirm("Throw away everything you haven't published and reload the latest version?")) return;
    try {
      updateStatus("Reloading…");
      await loadRepo();
      state.view = { type: "site" };
      renderAll();
      toast("Changes discarded.");
    } catch (err) { toast(err.message, "err", 6000); updateStatus(); }
  });
  $("#btn-signout").addEventListener("click", () => {
    if (isDirty() && !confirm("You have changes that aren't published. Sign out anyway and lose them?")) return;
    if (!isDirty() && !confirm("Sign out of admin on this device? You'll need your GitHub key to get back in.")) return;
    store.del("dnd-admin-token");
    state.base.site = siteText(); state.base.chars = charsText(); state.pending.clear();
    location.reload();
  });
  window.addEventListener("beforeunload", (e) => {
    if (state.site && isDirty()) { e.preventDefault(); e.returnValue = ""; }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !$("#app").hidden) { e.preventDefault(); publish(); }
  });

  /* =========================================================
     Boot
     ========================================================= */
  (async function boot() {
    state.token = store.get("dnd-admin-token");
    if (!state.token) { showSignin(); return; }
    try {
      await loadRepo();
      startApp();
    } catch (err) {
      if (err.status === 401) store.del("dnd-admin-token");
      showSignin(err.message);
    }
  })();
})();
