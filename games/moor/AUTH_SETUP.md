# تفعيل تسجيل الدخول في «مور» (Google + رقم الجوال)

شاشة الدخول جاهزة في اللعبة لكنها **مخفية** لين تفعّل طريقة وحدة على الأقل.
بعد ما تخلّص الخطوات، غيّر سطر واحد في `www/index.html`:

```js
const AUTH_CFG={googleWebClientId:'',phone:false};
```

- حط **Web Client ID** حق Google بين العلامتين، أو/و
- خلّ `phone:true` إذا فعّلت الرسائل النصية.

بعدها ابنِ نسخة جديدة. أول ما يفتح اللاعب اللعبة تطلع له شاشة الدخول.

---

## ١) قاعدة البيانات (مرة وحدة)
Supabase ← المشروع `kzvjkokwliqjjqnwbgsa` ← **SQL Editor** ← الصق محتوى `supabase/auth.sql` ← Run.
هذا يضيف دالة «حذف حسابي» (متجر Google يطلبها لأي لعبة فيها حسابات).

## ٢) الدخول برقم الجوال
1. Supabase ← **Authentication ← Sign In / Providers ← Phone** ← فعّله.
2. اختر مزوّد رسائل (Twilio أو MessageBird أو Vonage) وحط بياناته. **كل رسالة لها تكلفة** من المزوّد.
3. (مستحسن) في نفس الصفحة أضف **Test phone numbers** مع رمز ثابت، عشان مراجع Google يقدر يدخل بدون رسالة حقيقية. اكتب الرقم والرمز في Play Console ← App access.
4. في اللعبة: `phone:true`.

## ٣) الدخول بحساب Google
1. **Google Cloud Console** ← APIs & Services ← **Credentials** ← Create credentials ← OAuth client ID:
   - **Web application** (اسمه مثلاً «Moor Supabase»). انسخ **Client ID** و **Client secret**.
   - **Android**: Package name `com.moorgame.cards`، و SHA-1 حق مفتاح الرفع:
     `65:B2:88:54:CE:4A:67:58:22:A3:FB:AD:EE:9D:79:0D:D3:C4:06:F9`
   - **Android** ثاني بنفس الباكج و SHA-1 حق **مفتاح توقيع Google** (تلقاه في Play Console ← Test and release ← App integrity ← App signing بعد أول رفع).
2. Supabase ← **Authentication ← Providers ← Google** ← فعّله، والصق **Client ID و Client secret حق Web**، وفعّل **Skip nonce checks** (مطلوب للدخول من تطبيقات أندرويد).
3. في اللعبة: `googleWebClientId:'xxxxxxxx.apps.googleusercontent.com'` (الـ Web Client ID، مو حق Android).

## ٤) Play Console
- **App access**: اختر «All or some functionality is restricted» وحط رقم الجوال التجريبي والرمز.
- **Data safety**: أضف **Personal info ← Phone number** و **Email address** و **Name** (Collected، Required، App functionality)، و **Account management** كغرض.
- **Data deletion**: رابط حذف الحساب: `https://www.sautai.company/moor/account-deletion.html`
  (يشتغل بعد دمج الفرع في `main` مثل صفحة الخصوصية).
