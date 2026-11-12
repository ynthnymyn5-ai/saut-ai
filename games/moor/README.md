# مور MOOR — Android app

The card game as a Capacitor 8 app (`com.moorgame.cards`). The game itself is `www/index.html`.

- Build: push changes under `games/moor/` (or run the **moor-android** workflow). It produces an
  **unsigned** release `.aab` (for Google Play) and `.apk` as the `moor-release-unsigned` artifact.
- Sign: with the game's upload key (kept outside the repo — never commit `*.jks`):
  - AAB: `jarsigner -keystore moor-upload.jks app-release.aab moor-upload`
  - APK: `apksigner sign --ks moor-upload.jks app-release-unsigned.apk`
- Privacy policy (Play Console): `https://www.sautai.company/moor/privacy.html`
  (served from `public/moor/privacy.html` of the main site — keep it in sync with `www/privacy.html`).
- In-app products to create in Play Console, with these exact ids:
  `moor_coins_small`, `moor_coins_medium`, `moor_coins_large` (consumable) and
  `moor_vip_monthly`, `moor_vip_yearly` (subscriptions, group `moor_vip`).
- Coins are credited only after the purchase is verified, once per transaction id.
- `SCHEDULE_EXACT_ALARM` is removed on purpose (reminders don't need exact timing).

## Other folders
- `promo-video/` — 26 s vertical promo video (Remotion). `npm i && npx remotion render MoorPromo out/moor-promo.mp4`
- `demo/` — buyer demo builder (expires on a set date, online/purchases off, obfuscated): `npm i && node build.js` → `site/game.html` (serve with `wrapper.html` as index and `../www/fonts`).
- `marketing/` — sales page, rendered promo video, 512 px store icon.
