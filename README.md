# Characters — dnd.volbeat.vip

A "meet the characters" site for our D&D campaign: a browse grid of character cards, and a full-colour page for each character. Plain HTML/CSS/JS, no build step.

## Adding or editing characters
Everything lives in **`js/characters.js`**. Copy a `{ ... }` block, paste it after the last one, change the values.

| Field | What it is |
|---|---|
| `id` | short name used in the link, e.g. `dnd.volbeat.vip/#brokk` |
| `name`, `epithet`, `player` | header text |
| `race`, `subrace`, `class`, `subclass`, `multiclass`, `level` | the D&D basics |
| `background`, `alignment`, `deity`, `age`, `height`, `pronouns`, `status` | more particulars |
| `extra` | any custom rows, e.g. `extra: { "Patron": "The Raven Queen", "Familiar": "Pip" }` |
| `stats` | ability scores; modifiers are calculated for you |
| `quote`, `bio` (list of paragraphs), `traits` (list), `goals` | the story bits |
| `color` | their signature colour; it's used for their card and their whole page. Bright, saturated colours work best; text switches to dark automatically on very light colours |
| `art` | full-body character image — **PNG with a transparent background** works best |
| `background_image` | optional scene shown behind them on their page (fades into their colour on the text side) |

Leave any field out (or `""`) and it just won't show.

**Art tips:** cut the character out (remove.bg, Photoshop, or Photopea's "Remove Background" all work) and crop tight to the figure so they burst out over the top of their card. Tall images around 800–1200px high look best. Put files in `images/characters/` and `images/backgrounds/`.

Until a character has `art`, their initials stand in as a placeholder.

The site accent colour and font are set at the top of `css/style.css`. The title and intro text on the home page come from `CAMPAIGN` in `js/characters.js`.

## Hosting on GitHub Pages
1. Create a new public repo on GitHub (e.g. `dnd-characters`).
2. Upload everything in this folder (keep the folder structure — `CNAME` and `.nojekyll` included) to the repo root.
3. Repo → **Settings → Pages** → Source: *Deploy from a branch*, Branch: `main` / `(root)` → Save.
4. In the same page, **Custom domain** should already show `dnd.volbeat.vip` (from the `CNAME` file). Tick **Enforce HTTPS** once it's allowed (can take up to an hour after DNS works).

## DNS on Porkbun
Porkbun → Domain Management → volbeat.vip → **DNS** → add a record:

- Type: **CNAME**
- Host: **dnd**
- Answer: **YOUR-GITHUB-USERNAME.github.io**
- TTL: default

That's it — your main `volbeat.vip` site is untouched. Changes usually go live within a few minutes to an hour.

Optional but recommended: GitHub → your account Settings → Pages → **Add a verified domain** → `volbeat.vip`, and add the TXT record it gives you on Porkbun. This stops anyone else claiming your subdomain.

## Previewing locally
Just open `index.html` in a browser, or run `python3 -m http.server` in this folder and visit http://localhost:8000.
