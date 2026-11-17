/* ------------------------------------------------------------
   D&D Beyond import for admin mode.
   Reads either:
   - the character JSON (from the bookmarklet, or the character
     service link for public characters), or
   - the fillable PDF from D&D Beyond's "Export to PDF".
   Returns plain character fields; admin mode shows them for
   review before anything is saved.
   ------------------------------------------------------------ */
(function () {
  "use strict";

  const ABIL = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
  const ABIL_LONG = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
  const ALIGN = { 1: "Lawful Good", 2: "Neutral Good", 3: "Chaotic Good", 4: "Lawful Neutral", 5: "True Neutral", 6: "Chaotic Neutral", 7: "Lawful Evil", 8: "Neutral Evil", 9: "Chaotic Evil" };
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
  const clean = (s) => String(s ?? "").replace(/\r/g, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  const paragraphs = (s) => clean(s).split(/\n\s*\n|\n(?=\S)/).map((p) => p.trim()).filter(Boolean);
  const lines = (s) => clean(s).split(/\n+/).map((p) => p.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);

  /* ---------- character ID / link ---------- */
  function idFromLink(text) {
    const m = String(text || "").match(/(?:characters\/|character\/v5\/character\/)(\d{3,})/) || String(text || "").match(/^\s*(\d{3,})\s*$/);
    return m ? m[1] : null;
  }
  const serviceUrl = (id) => `https://character-service.dndbeyond.com/character/v5/character/${id}`;

  // Works only for characters set to Public on D&D Beyond, and only if D&D Beyond allows the request.
  async function fetchById(id) {
    const r = await fetch(serviceUrl(id));
    if (!r.ok) throw new Error(r.status === 403 || r.status === 404 ? "D&D Beyond wouldn't share that character. Is its privacy set to Public?" : "D&D Beyond answered " + r.status);
    const j = await r.json();
    return fromJson(j);
  }

  // Bookmarklet: run on a D&D Beyond character page, downloads the character JSON.
  const BOOKMARKLET = "javascript:(async()=>{const m=location.href.match(/dndbeyond\\.com\\/(?:profile\\/[^/]+\\/)?characters\\/(\\d+)/);if(!m){alert('Open one of your characters on dndbeyond.com first, then click this bookmark.');return}try{const r=await fetch('https://character-service.dndbeyond.com/character/v5/character/'+m[1]);const j=await r.json();const d=j.data||j;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(d)],{type:'application/json'}));a.download=(d.name||'character').replace(/[^\\w -]/g,'')+'.ddb.json';document.body.appendChild(a);a.click();a.remove()}catch(e){alert('Could not download this character: '+e.message)}})()";

  /* ---------- JSON ---------- */
  function fromJson(input) {
    const d = (input && input.data && input.data.classes) ? input.data : input;
    if (!d || typeof d !== "object" || !("classes" in d) || !("stats" in d)) {
      throw new Error("That file doesn't look like a D&D Beyond character.");
    }
    const out = { name: clean(d.name) };

    // race / subrace
    const race = d.race || {};
    if (race.isSubRace && race.baseRaceName) {
      out.race = clean(race.baseRaceName);
      out.subrace = clean(race.subRaceShortName || race.fullName);
    } else {
      out.race = clean(race.fullName || race.baseRaceName || race.baseName);
    }

    // classes: the starting class (or highest level) is the main one
    const classes = (d.classes || []).slice().sort((a, b) => (b.isStartingClass - a.isStartingClass) || (b.level - a.level));
    if (classes.length) {
      const main = classes[0];
      out.class = clean(main.definition && main.definition.name);
      out.subclass = clean(main.subclassDefinition && main.subclassDefinition.name);
      out.level = classes.reduce((n, c) => n + (Number(c.level) || 0), 0) || "";
      out.multiclass = classes.slice(1).map((c) => {
        const sub = c.subclassDefinition && c.subclassDefinition.name;
        return `${clean(c.definition && c.definition.name)} ${c.level}${sub ? ` (${clean(sub)})` : ""}`;
      }).join(", ");
    }

    // background, alignment, deity, look
    const bg = d.background || {};
    out.background = clean(bg.hasCustomBackground && bg.customBackground ? bg.customBackground.name : bg.definition && bg.definition.name);
    out.alignment = ALIGN[d.alignmentId] || "";
    out.deity = clean(d.faith);
    out.age = has(d.age) ? String(d.age) : "";
    out.height = clean(d.height);
    const extra = {};
    if (has(d.gender)) extra.Gender = clean(d.gender);
    if (has(d.eyes)) extra.Eyes = clean(d.eyes);
    if (has(d.hair)) extra.Hair = clean(d.hair);
    if (has(d.skin)) extra.Skin = clean(d.skin);
    if (has(d.weight)) extra.Weight = clean(d.weight) + (/^\d+$/.test(String(d.weight)) ? " lb" : "");
    out.extra = extra;

    // ability scores: base (or "set-base" modifier) + bonuses; an override replaces everything
    const mods = Object.values(d.modifiers || {}).flat().filter(Boolean);
    out.stats = {};
    for (let id = 1; id <= 6; id++) {
      const key = ABIL_LONG[id - 1] + "-score";
      const find = (arr) => (arr || []).find((s) => s.id === id);
      const override = find(d.overrideStats);
      if (override && has(override.value)) { out.stats[ABIL[id - 1]] = Number(override.value); continue; }
      const base = Number((find(d.stats) || {}).value) || 10;
      const setBase = Math.max(0, ...mods.filter((m) => m.type === "set-base" && m.subType === key).map((m) => Number(m.value) || 0));
      const bonus = mods.filter((m) => m.type === "bonus" && m.subType === key).reduce((n, m) => n + (Number(m.value) || 0), 0);
      const extraBonus = Number((find(d.bonusStats) || {}).value) || 0;
      let total = (setBase || base) + bonus + extraBonus;
      const setScore = Math.max(0, ...mods.filter((m) => m.type === "set" && m.subType === key).map((m) => Number(m.value) || 0));
      if (setScore > total) total = setScore;   // e.g. Belt of Giant Strength
      out.stats[ABIL[id - 1]] = total;
    }

    // story
    const notes = d.notes || {}, traits = d.traits || {};
    out.bio = paragraphs(notes.backstory);
    out.traits = lines(traits.personalityTraits);
    out.goals = clean(traits.ideals);
    out._more = {
      Bonds: clean(traits.bonds), Flaws: clean(traits.flaws), Appearance: clean(traits.appearance),
      Allies: clean(notes.allies), Organizations: clean(notes.organizations), Enemies: clean(notes.enemies),
    };
    out.player = clean(d.username);
    out._avatar = d.decorations && d.decorations.avatarUrl ? String(d.decorations.avatarUrl).split("?")[0] : "";
    out._source = "D&D Beyond character data";
    return out;
  }

  /* ---------- PDF ---------- */
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  let pdfjsReady = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfjsReady) pdfjsReady = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = PDFJS; s.crossOrigin = "anonymous";
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; res(window.pdfjsLib); };
      s.onerror = () => { pdfjsReady = null; rej(new Error("Couldn't load the PDF reader. Check your connection and try again.")); };
      document.head.appendChild(s);
    });
    return pdfjsReady;
  }

  async function readPdfFields(buffer) {
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    const fields = {};
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const annots = await page.getAnnotations();
      annots.forEach((a) => {
        if (!a.fieldName) return;
        let v = a.fieldValue;
        if (Array.isArray(v)) v = v.join(", ");
        if (v === undefined || v === null || v === "Off") return;
        const prev = fields[a.fieldName];
        fields[a.fieldName] = prev && prev !== String(v) ? prev + "\n" + v : String(v);
      });
    }
    return fields;
  }

  // D&D Beyond (and the classic WotC sheet) use names like "CharacterName", "CLASS  LEVEL", "STR".
  function fromPdfFields(fields) {
    const norm = {};
    Object.entries(fields).forEach(([k, v]) => {
      const n = k.toLowerCase().replace(/\[\d+\]/g, "").replace(/[^a-z0-9]/g, "");
      if (has(v)) norm[n] = norm[n] ? norm[n] + "\n" + v : String(v);
    });
    const pick = (...names) => { for (const n of names) if (has(norm[n])) return clean(norm[n]); return ""; };
    const pickStart = (...prefixes) => {
      for (const p of prefixes) {
        const keys = Object.keys(norm).filter((k) => k.startsWith(p)).sort();
        const vals = keys.map((k) => norm[k]).filter(has);
        if (vals.length) return clean(vals.join("\n"));
      }
      return "";
    };

    const out = {};
    out.name = pick("charactername", "charactername2", "name");
    if (!out.name) throw new Error("No character name found in that PDF. Is it a D&D Beyond character sheet export?");
    out.player = pick("playername", "player");

    // "Fighter 5 / Wizard 2"  or  "Fighter 5 (Battle Master)"
    const cl = pick("classlevel", "class", "classandlevel");
    const parts = [...cl.matchAll(/([A-Za-z][A-Za-z' -]*?)\s*(\d{1,2})(?:\s*\(([^)]+)\))?/g)];
    if (parts.length) {
      out.class = parts[0][1].trim();
      if (parts[0][3]) out.subclass = parts[0][3].trim();
      out.level = parts.reduce((n, m) => n + Number(m[2]), 0);
      out.multiclass = parts.slice(1).map((m) => `${m[1].trim()} ${m[2]}${m[3] ? ` (${m[3].trim()})` : ""}`).join(", ");
    } else if (cl) out.class = cl;
    const sub = pick("subclass", "archetype");
    if (sub) out.subclass = sub;

    const race = pick("race", "racesubrace", "species");
    const rm = race.match(/^(.*?)\s*\((.+)\)$/);
    if (rm) { out.race = rm[1]; out.subrace = rm[2]; } else out.race = race;
    out.background = pick("background");
    out.alignment = pick("alignment");
    out.deity = pick("faith", "deity");
    out.age = pick("age");
    out.height = pick("height");
    const extra = {};
    [["Gender", "gender"], ["Eyes", "eyes"], ["Hair", "hair"], ["Skin", "skin"], ["Weight", "weight"]].forEach(([label, key]) => {
      const v = pick(key); if (v) extra[label] = v;
    });
    out.extra = extra;

    out.stats = {};
    ABIL.forEach((a, i) => {
      const v = pick(a.toLowerCase(), ABIL_LONG[i], a.toLowerCase() + "score");
      const n = parseInt(v, 10);
      if (!isNaN(n) && n > 0 && n < 40) out.stats[a] = n;
    });

    out.bio = paragraphs(pickStart("backstory", "characterbackstory"));
    out.traits = lines(pick("personalitytraits", "personality"));
    out.goals = pick("ideals");
    out._more = { Bonds: pick("bonds"), Flaws: pick("flaws"), Appearance: pick("appearance") };
    out._source = "D&D Beyond PDF";
    out._fieldCount = Object.keys(fields).length;
    return out;
  }

  /* ---------- one entry point for files ---------- */
  async function fromFile(file) {
    const name = (file.name || "").toLowerCase();
    const buf = await file.arrayBuffer();
    const head = new TextDecoder().decode(buf.slice(0, 5));
    if (head === "%PDF-" || name.endsWith(".pdf")) {
      return fromPdfFields(await readPdfFields(buf));
    }
    let json;
    try { json = JSON.parse(new TextDecoder().decode(buf)); }
    catch { throw new Error("That file isn't a D&D Beyond PDF or character JSON file."); }
    return fromJson(json);
  }

  window.DDBImport = { fromFile, fromJson, fromPdfFields, readPdfFields, fetchById, idFromLink, serviceUrl, BOOKMARKLET };
})();
