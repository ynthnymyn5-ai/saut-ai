# SAUT AI mobile app (Android / iOS)

A native shell (Capacitor) around the live app at `server.url` in `capacitor.config.json`.
Every web deploy updates the app instantly — no store update needed for features.

## Android — built automatically
GitHub → Actions → **android** → *Run workflow* (or push changes under `mobile/`).
The APK is published to the `android-build` branch (`saut-ai.apk`) and as a workflow artifact.

- Debug-signed APK (`saut-ai.apk`): install directly on Android for testing (allow "Install unknown apps").
  Each CI run signs it with a new debug key, so uninstall the old one before installing a newer build.
- With the release keystore secrets set, the workflow also builds `saut-ai-release.apk`, signed with your key
  and not debuggable. Install this one for real use: later builds update it in place.
- Google Play: add a release keystore as repository secrets (`ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`); the workflow then
  also builds a signed `saut-ai.aab` for upload in Play Console ($25 one-time developer fee).

## iOS
Requires an Apple Developer account ($99/year) and a Mac with Xcode:
`cd mobile && npm install && npx cap add ios && npx cap open ios` → set your team → Archive → App Store Connect.
Until then, iPhone users install the web app: Safari → Share → Add to Home Screen.

## Native features (v1.4)
The shell ships these Capacitor plugins; the web app drives them through `src/lib/native.ts` and
`src/components/native/NativeBridge.tsx` (no Capacitor packages in the web bundle, and every call is a
no-op in a normal browser):

| Feature | How |
|---|---|
| Android back button | goes back; on inner screens opened from a link goes up to `/dashboard`; on top-level screens sends the app to the background instead of closing it |
| Offline | a banner while there's no internet; if the app can't load at all, `www/index.html` shows a Retry button and reconnects by itself |
| Links to other sites | open in an in-app browser tab (Chrome Custom Tab), so people don't lose their place. `mailto:`, `tel:` and WhatsApp go to the phone's apps |
| App Links | `https://www.sautai.company/{app,dashboard,auth,reset-password,onboarding}…` open inside the app (email confirmation, password reset, dashboard links). Needs `ANDROID_CERT_SHA256` on the server, see below |
| Status bar and splash | dark status bar matching the app; splash hides as soon as the page is ready |
| Refresh on return | after 5+ minutes in the background, the data on screen reloads |
| Share and haptics | the native share sheet (e.g. *Share tracking link* on an order); a short vibration on success and error messages |

The Android project is generated in CI; `scripts/patch-android.mjs` then adds the microphone permissions,
turns off Android backup (`allowBackup=false`: sessions stay on the phone), adds the App Links intent filter
and writes the version.

## Versions
Raise `version` **and** `androidVersionCode` in `mobile/package.json` for every release
(Android only installs an update when the code goes up).

## App Links (open our links in the app)
1. Build once with the release keystore secrets set; `build-android.log` shows `release cert SHA256: …`.
2. On Vercel set `ANDROID_CERT_SHA256` to that value (with Play App Signing, also add the fingerprint from
   Play Console → Setup → App signing, comma-separated) and redeploy.
3. Check `https://www.sautai.company/.well-known/assetlinks.json`, then reinstall the app.

Without it, links still work: Android asks whether to open them in the browser or in SAUT AI.

## Change the web address
Edit `server.url` (e.g. your own domain) and re-run the workflow.

## Sign-up and login inside the app (what was fixed, v1.1)
- The app adds `SautAIApp/1.1` to its user agent. The web app uses it to hide **Continue with Google**
  (Google blocks sign-in inside app WebViews — error `disallowed_useragent`).
- Email links open in the phone's browser, not in the app, so the app now lets people **type the code
  from the email** (sign-up confirmation and password reset). The link still works; after opening it the
  person is told their email is confirmed and logs in inside the app.
- One-time Supabase setting needed for codes (see `docs/ANDROID_RELEASE.md` → *Email templates*).

## Releasing to Google Play
See `docs/ANDROID_RELEASE.md` (keystore, signing, store listing, data-safety answers, account-deletion URL).
