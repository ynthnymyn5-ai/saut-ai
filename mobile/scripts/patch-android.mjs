#!/usr/bin/env node
// Patches the Android project that `npx cap add android` generates (CI regenerates it on every build).
// Run from mobile/: `node scripts/patch-android.mjs [androidDir]`. Fails loudly if the template changed.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const androidDir = process.argv[2] ?? "android";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const cap = JSON.parse(readFileSync("capacitor.config.json", "utf8"));

/** Paths on our own domain that open inside the app instead of the browser (Android App Links). */
export const APP_LINK_PATHS = ["/app", "/dashboard", "/auth", "/reset-password", "/onboarding"];

const mainHost = new URL(cap.server.url).hostname; // www.sautai.company
const hosts = [...new Set([mainHost, mainHost.replace(/^www\./, "")])];

function replaceOnce(text, find, replacement, what) {
  if (!text.includes(find)) throw new Error(`patch-android: anchor not found (${what}): ${find}`);
  return text.replace(find, replacement);
}

// ── AndroidManifest.xml ────────────────────────────────────────────────────
const manifestPath = join(androidDir, "app/src/main/AndroidManifest.xml");
let m = readFileSync(manifestPath, "utf8");

// microphone for the voice assistant and live voice tests
if (!m.includes("android.permission.RECORD_AUDIO")) {
  m = replaceOnce(m, '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.INTERNET" />\n' +
    '    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n' +
    '    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />', "permissions");
}

// sessions and cookies stay on the phone: no Google Drive backup / restore onto another device
if (!m.includes('android:allowBackup="false"')) m = replaceOnce(m, 'android:allowBackup="true"', 'android:allowBackup="false"', "allowBackup");

// App Links: email confirmation, password reset and dashboard links open in the app
if (!m.includes('android:autoVerify="true"')) {
  const data = hosts.flatMap((h) => APP_LINK_PATHS.map((p) =>
    `                <data android:scheme="https" android:host="${h}" android:pathPrefix="${p}" />`)).join("\n");
  const filter =
    '            <intent-filter android:autoVerify="true">\n' +
    '                <action android:name="android.intent.action.VIEW" />\n' +
    '                <category android:name="android.intent.category.DEFAULT" />\n' +
    '                <category android:name="android.intent.category.BROWSABLE" />\n' +
    `${data}\n` +
    "            </intent-filter>\n";
  m = replaceOnce(m, '<category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n',
    '<category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n\n' + filter, "launcher intent-filter");
}
writeFileSync(manifestPath, m);

// ── app/build.gradle: version from mobile/package.json ─────────────────────
const gradlePath = join(androidDir, "app/build.gradle");
const vn = String(pkg.version);
const vc = Number(pkg.androidVersionCode);
if (!/^\d+\.\d+\.\d+$/.test(vn) || !Number.isInteger(vc) || vc < 1) {
  throw new Error(`patch-android: bad version in package.json (version=${vn}, androidVersionCode=${pkg.androidVersionCode})`);
}
let g = readFileSync(gradlePath, "utf8");
if (!/versionCode \d+/.test(g) || !/versionName "[^"]*"/.test(g)) throw new Error("patch-android: version lines not found in build.gradle");
g = g.replace(/versionCode \d+/, `versionCode ${vc}`).replace(/versionName "[^"]*"/, `versionName "${vn}"`);
writeFileSync(gradlePath, g);

console.log(`patch-android: version ${vn} (${vc}); allowBackup=false; App Links for ${hosts.join(", ")} ${APP_LINK_PATHS.join(" ")}`);
