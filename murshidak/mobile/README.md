# Murshidak phone app (Android / iOS)

A Capacitor shell that opens the live web app (`https://murshidak-khaki.vercel.app`), so every web deploy updates the app instantly.

**Android:** run the GitHub Actions workflow **murshidak-android** (Actions → murshidak-android → Run workflow). It builds a debug APK you can install for testing, published to the `murshidak-android-build` branch and as a workflow artifact. For Google Play, add a signing keystore as repository secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`); the workflow then also builds a signed `.aab` to upload in the Play Console.

**iOS:** needs a Mac with Xcode and an Apple Developer account: `npm install && npx cap add ios && npm run assets && npx cap open ios`, then archive and upload from Xcode.

**Known limits of the shell app:**
- Phone push notifications use Web Push, which Android/iOS app shells don't support. Inside the store app they need Firebase Cloud Messaging (`@capacitor/push-notifications`), which is not set up yet. Until then, users who want push should "Add to Home Screen" from the browser.
- Voice input (the mic button) relies on the browser's speech recognition, which the Android app shell does not provide; typing works everywhere.
