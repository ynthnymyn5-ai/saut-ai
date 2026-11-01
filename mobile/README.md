# SAUT AI mobile app (Android / iOS)

A native shell (Capacitor) around the live app at `server.url` in `capacitor.config.json`.
Every web deploy updates the app instantly — no store update needed for features.

## Android — built automatically
GitHub → Actions → **android** → *Run workflow* (or push changes under `mobile/`).
The APK is published to the `android-build` branch (`saut-ai.apk`) and as a workflow artifact.

- Debug-signed APK: install directly on Android for testing (allow "Install unknown apps").
- Google Play: add a release keystore as repository secrets (`ANDROID_KEYSTORE_BASE64`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`); the workflow then
  also builds a signed `saut-ai.aab` for upload in Play Console ($25 one-time developer fee).

## iOS
Requires an Apple Developer account ($99/year) and a Mac with Xcode:
`cd mobile && npm install && npx cap add ios && npx cap open ios` → set your team → Archive → App Store Connect.
Until then, iPhone users install the web app: Safari → Share → Add to Home Screen.

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
