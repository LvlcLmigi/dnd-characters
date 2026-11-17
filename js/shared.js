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
    style: {
      accent: "#1a5cff", text: "#141a2b", pageBg: "#ffffff", browseBg: "#e8f1ff",
      headingFont: "Rubik", bodyFont: "Rubik",
      zoom: 100, cardSize: 240, cardRadius: 28, pattern: "dots", showDie: true,
      heroImage: "", browseImage: "",
    },
  };

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
    doc.documentElement.dataset.pattern = st.pattern || "dots";
    const z = Math.max(60, Math.min(160, Number(st.zoom) || 100));
    doc.body.style.zoom = z === 100 ? "" : String(z / 100);

    const hero = doc.getElementById("hero");
    if (hero) hero.classList.toggle("has-image", !!st.heroImage);
    const die = doc.querySelector(".hero-art");
    if (die) die.style.display = st.showDie === false || st.heroImage ? "none" : "";

    const link = doc.getElementById("font-link");
    if (link) {
      const href = fontHref([st.headingFont, st.bodyFont]);
      if (link.getAttribute("href") !== href) link.setAttribute("href", href);
    }
  }

  window.DND = { FONTS, DEFAULT_SITE, PALETTE, inkFor, shade, luminance, fontHref, fontStack, mergeSite, applyStyle };
})();
