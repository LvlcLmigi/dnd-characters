/* ------------------------------------------------------------
   Shared by the site (app.js) and admin mode (admin.js):
   fonts, colour helpers and applying the site's style settings.
   ------------------------------------------------------------ */
(function () {
  "use strict";

  // Google Fonts available in admin mode. `spec` must only list weights the font has.
  const FONTS = {
    "Rubik":              { spec: "Rubik:ital,wght@0,400;0,500;0,700;0,800;0,900;1,400", fallback: "Arial, sans-serif", label: "Rubik (rounded, default)" },
    "Nunito":             { spec: "Nunito:ital,wght@0,400;0,500;0,700;0,800;0,900;1,400", fallback: "Arial, sans-serif", label: "Nunito (soft, friendly)" },
    "Baloo 2":            { spec: "Baloo+2:wght@400;500;700;800", fallback: "Arial, sans-serif", label: "Baloo 2 (bubbly, cartoon)" },
    "Lilita One":         { spec: "Lilita+One", fallback: "Arial Black, sans-serif", label: "Lilita One (chunky, headings only)", headingOnly: true },
    "Bricolage Grotesque":{ spec: "Bricolage+Grotesque:wght@400;500;700;800", fallback: "Arial, sans-serif", label: "Bricolage Grotesque (modern)" },
    "Space Grotesk":      { spec: "Space+Grotesk:wght@400;500;700", fallback: "Arial, sans-serif", label: "Space Grotesk (techy)" },
    "Cinzel":             { spec: "Cinzel:wght@400;500;700;800;900", fallback: "Georgia, serif", label: "Cinzel (classic fantasy, headings only)", headingOnly: true },
    "Fraunces":           { spec: "Fraunces:ital,wght@0,400;0,500;0,700;0,800;0,900;1,400", fallback: "Georgia, serif", label: "Fraunces (storybook serif)" },
    "Lora":               { spec: "Lora:ital,wght@0,400;0,500;0,700;1,400", fallback: "Georgia, serif", label: "Lora (bookish serif)" },
  };

  const DEFAULT_SITE = {
    title: "The Party",
    subtitle: "",
    intro: "",
    heroTitle: "Characters",
    browseHeading: "Meet the party",
    folders: [],                       // [{ id, name }]
    style: {
      accent: "#1a5cff", text: "#141a2b", pageBg: "#ffffff", browseBg: "#e8f1ff",
      headingFont: "Rubik", bodyFont: "Rubik",
      zoom: 100, cardSize: 240, cardRadius: 28, pattern: "dots", showDie: true,
      heroImage: "", browseImage: "",
      // home page
      heroStyle: "compact",            // compact | big
      heroAlign: "left",               // left | center | right   (title block)
      cardAlign: "center",             // left | center | right   (cards, section heading, folder tabs)
      cardNameAlign: "center",         // left | center | right   (name under each card)
      gridWidth: 1240,                 // px, widest the card area gets
      cardGapX: 28, cardGapY: 72,      // px between cards
      cardsPerRow: 0,                  // 0 = as many as fit
      browsePadTop: 48,                // px above the character section heading
      showCardSub: true,               // race · class under names
      // animations
      charEntrance: "pop",             // how a character appears on their page
      cardEntrance: "pop",             // how cards appear on the home page
      folderDisplay: "tabs",           // tabs | sections
      // pop-out effects on the character art (cards, and optionally their page)
      shadow: "on",                    // on | none   - offset drop shadow
      shadowColor: "#000000",
      shadowOpacity: 45,               // 0-100
      shadowDistance: 10,              // px on a card (scaled up on character pages)
      shadowSoftness: 6,               // blur px, 0 = hard sticker-style edge
      shadowDirection: "down-right",   // down-right | down | down-left
      glow: "none",                    // none | glow | outline   - follows the character's shape
      glowColor: "#ffffff",
      glowSize: 4,                     // px on a card
      effectsOnPage: true,
      // character pages
      lockHeader: true,                // name + title stay put, only the text below scrolls
      lockDetails: true,               // with lockHeader: details box stays put too (false = it scrolls with the story)
      detailsPosition: "above",        // above | below | beside
      pagePattern: "",                 // "" = same as cards
      // character page layout on larger screens (percentages of the screen)
      textLeft: 6, textWidth: 38, textTop: 8,
      artX: 72, artHeight: 96, artBottom: 0,
    },
  };

  const PATTERNS = [
    ["dots", "Dots"], ["grid", "Grid"], ["stripes", "Stripes"], ["diamonds", "Diamonds"],
    ["checks", "Checks"], ["sparkles", "Sparkles"], ["waves", "Waves"], ["none", "None"],
  ];
  const ENTRANCES = [["pop", "Pop in"], ["fade", "Fade in"], ["drop", "Drop down"], ["rise", "Rise up"], ["slide", "Slide in"], ["zoom", "Zoom"], ["spin", "Spin"], ["flip", "Flip"], ["none", "None"]];
  const CARD_ENTRANCES = [["pop", "Pop up"], ["fade", "Fade in"], ["drop", "Drop down"], ["slide", "Slide in"], ["zoom", "Zoom"], ["flip", "Flip"], ["none", "None"]];
  const GLOWS = [["none", "None"], ["glow", "Glow"], ["outline", "Outline"]];
  const SHADOW_DIRS = [["down-left", "↙ Down-left"], ["down", "↓ Down"], ["down-right", "↘ Down-right"]];

  function rgba(hex, alpha) {
    const rgb = hexToRgb(hex) || [0, 0, 0];
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.max(0, Math.min(1, alpha)).toFixed(2)})`;
  }
  // CSS filter for a character's art. scale: 1 on cards, bigger on their page; lift: extra pop on hover.
  function artFilter(style, c, scale, lift) {
    c = c || {};
    const n = (v, d) => (isNaN(Number(v)) ? d : Number(v));
    const parts = [];
    const glow = c.glow || style.glow || "none";
    const gc = c.glowColor || style.glowColor || "#ffffff";
    const gs = Math.max(1, n(style.glowSize, 4)) * scale;
    if (glow === "outline") {
      const w = Math.max(1, Math.round(gs * 0.75));
      parts.push(`drop-shadow(${w}px 0 0 ${gc})`, `drop-shadow(-${w}px 0 0 ${gc})`, `drop-shadow(0 ${w}px 0 ${gc})`, `drop-shadow(0 -${w}px 0 ${gc})`);
    } else if (glow === "glow") {
      parts.push(`drop-shadow(0 0 ${(gs * 0.6).toFixed(1)}px ${gc})`, `drop-shadow(0 0 ${(gs * 1.6).toFixed(1)}px ${gc})`);
    }
    const shadow = c.shadow || style.shadow || "on";
    if (shadow !== "none") {
      const d = n(style.shadowDistance, 10) * scale * (lift || 1);
      const dir = c.shadowDirection || style.shadowDirection || "down-right";
      const dx = dir === "down" ? 0 : dir === "down-left" ? -d * 0.8 : d * 0.8;
      const dy = d;
      const blur = n(style.shadowSoftness, 6) * scale * (lift ? 1.3 : 1);
      parts.push(`drop-shadow(${dx.toFixed(1)}px ${dy.toFixed(1)}px ${blur.toFixed(1)}px ${rgba(style.shadowColor || "#000000", n(style.shadowOpacity, 45) / 100)})`);
    }
    return parts.length ? parts.join(" ") : "none";
  }

  const PALETTE = ["#d8274d", "#e0611a", "#1fa463", "#1a5cff", "#8e3fd6", "#e64fa0", "#12a5b8", "#c9a00e"];

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  function luminance(hex) {
    const rgb = hexToRgb(hex); if (!rgb) return 0;
    const lin = (v) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
    return .2126 * lin(rgb[0]) + .7152 * lin(rgb[1]) + .0722 * lin(rgb[2]);
  }
  // readable text colour on top of a background colour
  function inkFor(hex) { return luminance(hex) > .4 ? "#141a2b" : "#ffffff"; }
  function shade(hex, amt) { // amt < 0 darkens, > 0 lightens
    const rgb = hexToRgb(hex); if (!rgb) return hex;
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    return "#" + rgb.map((v) => Math.round(v + (t - v) * p).toString(16).padStart(2, "0")).join("");
  }

  function fontStack(name) {
    const f = FONTS[name] || FONTS.Rubik;
    return `"${FONTS[name] ? name : "Rubik"}", ${f.fallback}`;
  }
  function fontHref(names) {
    const uniq = [...new Set(names.filter((n) => FONTS[n]))];
    if (!uniq.length) uniq.push("Rubik");
    return "https://fonts.googleapis.com/css2?" + uniq.map((n) => "family=" + FONTS[n].spec).join("&") + "&display=swap";
  }

  function mergeSite(site) {
    const s = Object.assign({}, DEFAULT_SITE, site || {});
    s.style = Object.assign({}, DEFAULT_SITE.style, (site && site.style) || {});
    s.folders = Array.isArray(s.folders) ? s.folders.filter((f) => f && f.id) : [];
    // settings from the earlier "backdrop" version
    if (s.style.cardBackdrop !== undefined) {
      if (!(site.style && site.style.glow) && (s.style.cardBackdrop === "glow" || s.style.cardBackdrop === "outline")) s.style.glow = s.style.cardBackdrop;
      ["cardBackdrop", "backdropColor", "backdropStrength", "backdropOnPage"].forEach((k) => delete s.style[k]);
    }
    return s;
  }

  // resolveUrl lets admin preview swap in not-yet-published images
  function applyStyle(site, doc, resolveUrl) {
    doc = doc || document;
    const st = mergeSite(site).style;
    const r = doc.documentElement.style;
    const url = (p) => (p ? `url("${(resolveUrl ? resolveUrl(p) : p).replace(/"/g, "%22")}")` : "none");
    r.setProperty("--brand", st.accent);
    r.setProperty("--brand-dark", shade(st.accent, -.32));
    r.setProperty("--ink", st.text);
    r.setProperty("--ink-2", shade(st.text, .3));
    r.setProperty("--page", st.pageBg);
    r.setProperty("--sky", st.browseBg);
    r.setProperty("--font", fontStack(st.bodyFont));
    r.setProperty("--font-head", fontStack(st.headingFont));
    r.setProperty("--card-size", Math.max(140, Math.min(400, Number(st.cardSize) || 240)) + "px");
    r.setProperty("--card-radius", Math.max(0, Math.min(200, Number(st.cardRadius) || 0)) + "px");
    r.setProperty("--hero-image", url(st.heroImage));
    r.setProperty("--browse-image", url(st.browseImage));
    doc.documentElement.dataset.hero = st.heroStyle === "big" ? "big" : "compact";
    const al = (v) => (v === "left" || v === "right" ? v : "center");
    const flex = { left: "flex-start", center: "center", right: "flex-end" };
    const num = (v, d, lo, hi) => { const x = Number(v); return Math.max(lo, Math.min(hi, isNaN(x) ? d : x)); };
    const ha = st.heroAlign === "center" || st.heroAlign === "right" ? st.heroAlign : "left";
    r.setProperty("--hero-align", ha);
    r.setProperty("--hero-justify", flex[ha]);
    r.setProperty("--hero-intro-ml", ha === "left" ? "0" : "auto");
    r.setProperty("--hero-intro-mr", ha === "right" ? "0" : ha === "center" ? "auto" : "0");
    r.setProperty("--grid-justify", { left: "start", center: "center", right: "end" }[al(st.cardAlign)]);
    r.setProperty("--head-align", al(st.cardAlign));
    r.setProperty("--gm-l", al(st.cardAlign) === "left" ? "0" : "auto");      // the whole card area hugs that side
    r.setProperty("--gm-r", al(st.cardAlign) === "right" ? "0" : "auto");
    r.setProperty("--card-text-align", al(st.cardNameAlign));
    r.setProperty("--grid-max", num(st.gridWidth, 1240, 400, 4000) + "px");
    r.setProperty("--gap-x", num(st.cardGapX, 28, 0, 200) + "px");
    r.setProperty("--gap-y", num(st.cardGapY, 72, 0, 300) + "px");
    r.setProperty("--browse-pad-top", num(st.browsePadTop, 48, 0, 400) + "px");
    const per = num(st.cardsPerRow, 0, 0, 12);
    if (per > 0) { r.setProperty("--per-row", String(per)); doc.documentElement.dataset.perRow = String(per); }
    else { r.removeProperty("--per-row"); delete doc.documentElement.dataset.perRow; }
    doc.documentElement.dataset.cardSub = st.showCardSub === false ? "off" : "on";
    doc.documentElement.dataset.cardEnter = st.cardEntrance || "pop";

    const z = Math.max(60, Math.min(160, Number(st.zoom) || 100));
    doc.body.style.zoom = z === 100 ? "" : String(z / 100);
    r.setProperty("--zoom", String(z / 100));   // full-height areas divide by this so they still fill the screen

    const hero = doc.getElementById("hero");
    if (hero) hero.classList.toggle("has-image", !!st.heroImage);
    const die = doc.querySelector(".hero-art");
    if (die) die.style.display = st.showDie === false || st.heroImage || st.heroAlign === "right" ? "none" : "";

    const link = doc.getElementById("font-link");
    if (link) {
      const href = fontHref([st.headingFont, st.bodyFont]);
      if (link.getAttribute("href") !== href) link.setAttribute("href", href);
    }
  }

  window.DND = { FONTS, DEFAULT_SITE, PALETTE, PATTERNS, ENTRANCES, CARD_ENTRANCES, GLOWS, SHADOW_DIRS, artFilter, inkFor, shade, luminance, fontHref, fontStack, mergeSite, applyStyle };
})();
