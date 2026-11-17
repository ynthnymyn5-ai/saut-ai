// External services. Each one is optional and switches on only when its environment
// variables are set; `status()` tells the UI what is live so nothing pretends to work.
//   SMS + WhatsApp: Twilio REST API      Push: Web Push (VAPID)
//   Document reading: OpenAI vision      Payments: MyFatoorah (KNET / cards)

const env = (k) => (process.env[k] || '').trim();
const timeoutFetch = async (url, opts = {}, ms = 15000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); } finally { clearTimeout(t); }
};

export function status() {
  return {
    sms: !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && (env('TWILIO_FROM') || env('TWILIO_MESSAGING_SERVICE_SID'))),
    whatsapp: !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_WHATSAPP_FROM')),
    push: !!(env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY')),
    ai: !!env('OPENAI_API_KEY'),
    payments: !!env('MYFATOORAH_API_KEY'),
  };
}

// ---------------------------------------------------------------- Twilio
const kw = (phone) => '+965' + phone;
async function twilioMessage(params) {
  const sid = env('TWILIO_ACCOUNT_SID');
  const res = await timeoutFetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`twilio_${res.status}_${data.code || ''}`);
  return data.sid;
}

export async function sendSms(phone, text) {
  const from = env('TWILIO_MESSAGING_SERVICE_SID') ? { MessagingServiceSid: env('TWILIO_MESSAGING_SERVICE_SID') } : { From: env('TWILIO_FROM') };
  return twilioMessage({ To: kw(phone), Body: text, ...from });
}

/**
 * WhatsApp. Messages that start a conversation must use an approved template:
 * set TWILIO_WHATSAPP_CONTENT_SID to a template with two variables ({{1}} title, {{2}} details).
 * Without it, a plain body is sent, which WhatsApp only delivers inside a 24-hour session.
 */
export async function sendWhatsApp(phone, title, body) {
  const base = { From: 'whatsapp:' + env('TWILIO_WHATSAPP_FROM').replace(/^whatsapp:/, ''), To: 'whatsapp:' + kw(phone) };
  if (env('TWILIO_WHATSAPP_CONTENT_SID')) {
    return twilioMessage({ ...base, ContentSid: env('TWILIO_WHATSAPP_CONTENT_SID'), ContentVariables: JSON.stringify({ 1: title, 2: body }) });
  }
  return twilioMessage({ ...base, Body: `${title}\n${body}` });
}

// ---------------------------------------------------------------- Web Push
let webpush;
export async function sendPush(sub, payload) {
  if (!webpush) {
    webpush = (await import('web-push')).default;
    webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:admin@example.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  }
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 86400 });
    return 'sent';
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) return 'gone'; // subscription expired: caller deletes it
    throw e;
  }
}

// ---------------------------------------------------------------- OpenAI vision: read a document photo
const SCAN_PROMPT = `You read photos of Kuwaiti identity documents for a personal reminder app.
Return JSON only: {"type": one of "civil_id","passport","residency","driving_license","car_registration","other",
"number": the main document/ID number as printed (string, "" if unreadable),
"expiry_date": "YYYY-MM-DD" or "" if not visible, "name": holder name if printed (string or ""),
"confidence": 0..1}.
Dates on Kuwaiti documents are usually DD/MM/YYYY. Never guess digits you cannot read; leave the field empty instead.`;

export async function scanDocument(mime, base64) {
  const res = await timeoutFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env('OPENAI_VISION_MODEL') || env('OPENAI_CHAT_MODEL') || 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SCAN_PROMPT },
        { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${mime};base64,${base64}`, detail: 'high' } }] },
      ],
    }),
  }, 30000);
  if (!res.ok) throw new Error(`openai_${res.status}`);
  const out = JSON.parse((await res.json()).choices?.[0]?.message?.content || '{}');
  const types = ['civil_id', 'passport', 'residency', 'driving_license', 'car_registration', 'other'];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(out.expiry_date || '') && !Number.isNaN(Date.parse(out.expiry_date)) ? out.expiry_date : '';
  return {
    type: types.includes(out.type) ? out.type : 'other',
    number: String(out.number || '').replace(/[^\w\-/ ]/g, '').trim().slice(0, 40),
    expiry_date: date,
    name: String(out.name || '').slice(0, 80),
    confidence: Math.max(0, Math.min(1, Number(out.confidence) || 0)),
  };
}

// ---------------------------------------------------------------- MyFatoorah
const mfBase = () => env('MYFATOORAH_BASE_URL') || 'https://apitest.myfatoorah.com';
async function mf(path, body) {
  const res = await timeoutFetch(mfBase() + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('MYFATOORAH_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.IsSuccess === false) throw new Error(`myfatoorah_${res.status}_${data.Message || ''}`.slice(0, 120));
  return data.Data;
}

/** Create a payment link (KNET and cards). The plan is activated only after getPaymentStatus says Paid. */
export async function createInvoice({ amount, reference, customerName, phone, callbackUrl, errorUrl, lang }) {
  const d = await mf('/v2/SendPayment', {
    NotificationOption: 'LNK', InvoiceValue: amount, DisplayCurrencyIso: 'KWD',
    CustomerName: customerName || 'Murshidak user', MobileCountryCode: '+965', CustomerMobile: phone,
    CustomerReference: reference, UserDefinedField: reference,
    CallBackUrl: callbackUrl, ErrorUrl: errorUrl, Language: lang === 'en' ? 'en' : 'ar',
  });
  return { invoiceId: String(d.InvoiceId), url: d.InvoiceURL };
}

export async function getPaymentStatus(paymentId) {
  const d = await mf('/v2/GetPaymentStatus', { Key: String(paymentId), KeyType: 'PaymentId' });
  return { invoiceId: String(d.InvoiceId), status: d.InvoiceStatus, amount: Number(d.InvoiceValue), reference: d.UserDefinedField || d.CustomerReference };
}
