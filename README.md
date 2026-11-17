# Characters — dnd.volbeat.vip

A "meet the characters" site for our D&D campaign: a browse grid of character cards, and a full-colour page for each character. Hosted free on GitHub Pages.

## Editing the site: admin mode

Go to **dnd.volbeat.vip/admin.html** (or the small "Admin" link in the footer).

From there you can:
- add, edit, reorder, hide, duplicate and delete characters
- upload character art and page backgrounds (images are resized automatically; transparent PNGs get their empty edges trimmed)
- import a character from D&D Beyond (the "Export to PDF" file, a public character link, or the one-click bookmark)
- sort characters into folders (shown on the site as tabs or as sections)
- arrange the home page: title position, card alignment, cards per row, card area width, spacing, and whether race & class show under names
- change the site's titles, colours, fonts, zoom, card size, card corners, patterns and background images
- add a drop shadow and a glow or outline that follow the shape of the character art (on cards and their page)
- choose the character page layout: name and details locked in place with only the story scrolling, the details box above, below or beside the story, plus where the text and art sit on screen (with per-character art position)
- override the card pattern, page pattern, shadow and glow per character
- pick entrance animations for characters on their page and for cards on the home page (site-wide or per character)
- see every change in the live preview before anyone else does

Nothing changes on the real site until you press **Publish**. The site updates about a minute later.

### First-time setup (once per device)
Admin mode needs a GitHub access key to save changes:
1. On the admin page, click **Create a key on GitHub**.
2. Repository access: **Only select repositories → dnd-characters**.
3. Permissions → Repository permissions → **Contents: Read and write**.
4. Generate the token, copy it (starts with `github_pat_`), paste it into admin mode.

The key is stored only in that browser. Revoke it any time at GitHub → Settings → Developer settings → Personal access tokens.

## Where things live
| Path | What it is |
|---|---|
| `data/site.json` | site text and style settings |
| `data/characters.json` | all characters |
| `images/characters/`, `images/backgrounds/`, `images/site/` | uploaded art |
| `index.html`, `css/style.css`, `js/app.js`, `js/shared.js` | the public site |
| `admin.html`, `css/admin.css`, `js/admin.js`, `js/ddb-import.js` | admin mode |

You can also edit the two JSON files directly on GitHub if you ever need to.

## Hosting
- GitHub Pages, deployed from the `main` branch root; custom domain from the `CNAME` file.
- DNS (Porkbun): one CNAME record, `dnd` → `lvlclmigi.github.io`.

## Updating the code
`index.html` and `admin.html` load the CSS/JS with a `?v=` version tag. Bump it whenever those files change so browsers don't use a cached copy (GitHub Pages caches for 10 minutes).
