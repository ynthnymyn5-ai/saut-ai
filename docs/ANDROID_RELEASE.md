# SAUT AI — Android release guide

The Android app is a Capacitor shell that loads the live web app (`mobile/capacitor.config.json` → `server.url`).
No secrets are inside the APK: it contains only the public URL. All keys live on the server (Vercel).

## 1. Supabase settings the app needs (one time)

**Auth → URL Configuration**
- Site URL: `https://www.sautai.company`
- Redirect URLs: `https://www.sautai.company/auth/callback`

**Auth → Email Templates** — add the code so people can confirm *inside the app*
(the link opens in the phone's browser, not in the app).

*Confirm signup* — body:
```html
<h2>Confirm your SAUT AI account · تأكيد حسابك</h2>
<p>Your code · رمزك: <strong style="font-size:22px;letter-spacing:4px">{{ .Token }}</strong></p>
<p>Type it in the SAUT AI app, or <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=/onboarding">confirm by link</a>.</p>
```
*Reset password* — body:
```html
<h2>Reset your SAUT AI password · استعادة كلمة المرور</h2>
<p>Your code · رمزك: <strong style="font-size:22px;letter-spacing:4px">{{ .Token }}</strong></p>
<p>Type it in the SAUT AI app, or <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">reset by link</a>.</p>
```
The `token_hash` links work in any browser (they don't depend on where sign-up started).

**Auth → SMTP (strongly recommended before launch):** Supabase's built-in mailer sends only a few emails
per hour per project — the most common cause of "sign-up failed / email never arrived" on launch day.
Connect an SMTP provider (e.g. Resend, Amazon SES, Postmark) under Project Settings → Auth → SMTP.

## 2. Test on a real phone (checklist)
1. Install `saut-ai.apk` from the `android-build` branch (allow "Install unknown apps").
2. Sign up with a new email → the screen asks for the code → type the code from the email → onboarding opens.
3. Close the app completely, reopen → you are still signed in (session restored).
4. Settings → sign out → log in again with the password.
5. Log in with a wrong password → "Wrong email or password".
6. Forgot password → enter the code from the email → choose a new password → log in.
7. Arabic and English: switch language on the login screen; text direction follows.
8. Microphone: open the assistant and allow the microphone prompt.

## 3. Release signing (Google Play)
```bash
keytool -genkeypair -v -keystore saut-release.jks -alias saut -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 saut-release.jks > saut-release.jks.b64
```
GitHub → repository → Settings → Secrets and variables → Actions → add
`ANDROID_KEYSTORE_BASE64` (contents of the .b64 file), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`saut`),
`ANDROID_KEY_PASSWORD`. Run the **android** workflow → `saut-ai.aab` appears on the `android-build` branch.
Keep the `.jks` file and passwords in a password manager — losing them means you can't update the app
(unless you enrol in Play App Signing, which is recommended).

## 4. Play Console checklist
- [ ] Developer account ($25 one-time), app created as **SAUT AI**, default language Arabic + English listing
- [ ] Upload `saut-ai.aab` to Internal testing first; test with 2–3 phones
- [ ] Privacy policy URL: `https://www.sautai.company/privacy`
- [ ] Account deletion URL: `https://www.sautai.company/account-deletion` (in-app: Settings → Delete my account)
- [ ] Data safety: collects name, email, phone (account), messages and audio (only when the user uses chat/voice
      features), app activity; data encrypted in transit; users can request deletion. No data sold.
- [ ] Permissions: Internet, Microphone (voice assistant / live voice test)
- [ ] Content rating questionnaire, target audience 18+ (business app)
- [ ] Screenshots (phone) in Arabic and English, 512×512 icon, 1024×500 feature graphic
- [ ] Testers' feedback addressed → promote to Production
