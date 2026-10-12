# AutoShorts – Faceless Video Maker

A Windows Store app (PWA) that turns a **topic**, a pasted **article** or **your own script** into a
faceless vertical video (9:16) for TikTok, Instagram Reels and YouTube Shorts:

- **Script** — written automatically: facts are looked up on Wikipedia for a topic, an article is
  summarised to its strongest sentences, then a hook and a call to action are added. Six formats
  (Did you know, Top list, Explainer, Story, Mystery, Motivation). Uses the browser's on-device AI
  or the user's own OpenAI-compatible key when available.
- **Seven languages** — videos in English, Spanish, French, German, Portuguese (Brazil), Hindi and
  Arabic: the script writer, captions (right-to-left for Arabic), number cards, post kit and
  hashtags all follow the video's language, and facts come from that language's Wikipedia. The
  interface is translated into the same seven languages (picked from the Windows language,
  changeable in Settings › Language).
- **AI voiceover** — 40 neural voices generated **on the PC**: Kokoro-82M speaks English (28 voices),
  Spanish, French, Portuguese and Hindi; the voice pack (about 107 MB) downloads once, then works
  offline. German uses a Piper voice (20 MB, separate download). Arabic videos use your own voice,
  recorded line by line, or captions only.
- **Visuals** — 12 animated background themes in 10 looks, the user's own photos/clips, or free
  Pexels stock footage; Ken Burns motion, transitions, emoji stickers, big number cards, title banner.
- **Music** — 8 moods of original music synthesised on the device (royalty-free by construction),
  ducked under the voice, with cuts locked to the beat and optional transition sounds.
- **Captions** — 9 animated styles (word-by-word pop, highlight box, neon, comic, word slam…).
- **Export** — MP4 (H.264/AAC) rendered locally with WebCodecs. Free: 3 exports a week, 720p, small
  watermark. **Pro** (Microsoft Store add-on): unlimited 1080p, no watermark, all voices, looks,
  styles and moods.
- **Creator Hub** — saved projects, post kit (TikTok caption, Shorts title/description, Reels caption,
  hashtags, credits), upload links, cover image.

Everything runs locally. No server, no accounts, no tracking.

---

## 1. Put it on GitHub Pages

1. Create a **public** repository named **`AutoShorts`** on GitHub (the name is case-sensitive and is
   part of the address).
2. Upload **all files in this folder** to the root of the `main` branch (drag the folder contents
   into "Add file › Upload files"). The largest file, `vendor/ort/ort-wasm-simd-threaded.jsep.wasm`,
   is 21.6 MB — under GitHub's 25 MB web-upload limit.
   You don't need to upload `README.md`, `tools/` or `store/`, but it does no harm.
3. Settings › Pages › Build and deployment › **Deploy from a branch** › `main` / `(root)` › Save.
4. After a minute, open **https://haymohsen.github.io/AutoShorts/**.
   On the very first visit the page reloads itself once — that switches on the multi-threaded voice
   engine (the service worker adds the cross-origin isolation headers GitHub Pages can't set).

The manifest uses the unique id `/AutoShorts/`, start URL and scope `/AutoShorts/`, so it won't clash
with your other apps on `haymohsen.github.io`.

## 2. Microsoft Store setup (Partner Center)

1. **Reserved name:** `AutoShorts – Faceless Video Maker`. The app's manifest uses exactly this name, so the package's
   display name matches the reservation (keep the en dash).
2. **Pricing:** Free. The app sells Pro as add-ons.
3. **Create the Pro add-ons** (Partner Center › your app › Add-ons › Create a new add-on). The
   **Product ID must match exactly** what the app looks for:

   | Product ID | Type | Suggested price |
   |---|---|---|
   | `autoshorts_pro_lifetime` | Durable (lifetime) | one-time, e.g. $19.99 |
   | `autoshorts_pro_yearly` | Subscription, 1 year | optional, e.g. $14.99/year |
   | `autoshorts_pro_monthly` | Subscription, 1 month | optional, e.g. $3.99/month |

   You can create only the lifetime one — the app shows whichever add-ons exist. Give each add-on a
   title such as "AutoShorts Pro" and publish them with (or before) the app submission.
4. **Privacy policy URL:** `https://haymohsen.github.io/AutoShorts/privacy.html`
5. **Store listing text:** see `store/STORE-LISTING.md` (with a caption for each screenshot).
   Screenshots: `store/screenshots/`. Store logos and hero art: `store/logos/`.

## 3. Package with PWABuilder

1. Go to **pwabuilder.com**, enter `https://haymohsen.github.io/AutoShorts/` and start.
2. **Package for stores › Windows › Generate package**, with the values from Partner Center
   (Product management › Product identity):
   - Package ID: the `Package/Identity/Name` shown there (e.g. `Jotech.AutoShorts…`)
   - App name: `AutoShorts – Faceless Video Maker` (filled in from the manifest; it must match the
     reserved name exactly, en dash included)
   - Publisher ID: `CN=73B709AB-BF94-4318-AE43-BAAA136F59D9`
   - Publisher display name: `Jotech`
   - App version `1.0.0`, classic package version `0.9.9`
3. Upload the generated `.msixbundle` and `.classic.appxbundle` in a new submission.

Purchases (the Digital Goods API) only work in the Store-installed app, Edge 134 or later. In the
browser the Pro dialog points people to the Store.

## 4. Updating later

1. Change `VERSION` in `sw.js` and `APP_VERSION` in `js/settings.js` (e.g. `1.0.1`).
   Only if you replaced a file in `vendor/`, `fonts/` or `icons/`, also raise `VENDOR` in `sw.js`
   (otherwise installed copies keep the old file, and users don't download the voice engine again).
2. If you added or renamed files, run `python3 tools/build-sw-list.py` (rebuilds the offline file list).
3. Upload the changed files to GitHub.
4. Repackage in PWABuilder with a higher version and submit it as an update.

## Optional settings in code

- `js/stock.js` → `APP_PEXELS_KEY`: put your own free Pexels key here if you want stock footage to
  work without users adding a key. (It becomes visible in the app's files; Pexels keys are free and
  rate-limited to 200 requests an hour per key.)
- `js/pro.js` → `STORE_URL`: once the app is live, replace it with the app's Store link so the
  website version can send people to the Store.
- `js/license.js` → `PRODUCTS`, `FREE_EXPORTS_PER_WEEK`.

## Testing locally

Serve the folder on `localhost` (for example `python -m http.server 8080`) and open
`http://localhost:8080/`. Add `?pro=1` to the address to unlock Pro features for testing (works only
on localhost).

## Technical notes

- Voice: Kokoro-82M (q8 ONNX, 92 MB, plus 28 voice styles, 15 MB) via kokoro-js / Transformers.js / ONNX Runtime Web, in a worker.
  Spanish, French, Portuguese and Hindi text is turned into phonemes with eSpeak NG (WebAssembly, `vendor/espeak/`,
  dictionaries trimmed to the app's languages) and fed to the same model. German uses the Piper voice
  de_DE-eva_k-x_low (`js/piper-worker.js`, ONNX Runtime Web). `js/speech.js` rewrites numbers, units and
  abbreviations the way each language says them.
- Languages: `js/langs.js` (per-language script writer packs), `js/i18n.js` + `js/i18n/*.js` (interface
  translations, keyed by the English text). `python3 tools/extract-i18n.py` lists every interface string
  and checks each translation file for missing strings and placeholders.
  Settings has an option to use the graphics card (WebGPU, 326 MB model) for faster voiceovers. All voice styles are downloaded right after the model so every voice works offline.
- Export: Mediabunny + WebCodecs. Uses H.264 + AAC when Windows provides them, otherwise VP9 / Opus.
- Storage: IndexedDB (projects, voice clips, media). The voice model is kept in the browser cache.
- Third-party licenses: `licenses.html`.
