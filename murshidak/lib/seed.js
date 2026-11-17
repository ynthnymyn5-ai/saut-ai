import { PROCEDURES } from './procedures-data.js';
import { encryptText } from './crypto.js';

export const DEMO_PHONE = '99999999';
export const BUSINESS_PHONE = '98888888';
export const ADMIN_PHONE = '90000000';

export async function insertProcedure(db, p) {
  return (await db.run(`INSERT INTO procedures (slug, category, mode, popular, title_ar, title_en, summary_ar, summary_en,
    fees_ar, fees_en, duration_ar, duration_en, keywords, steps, documents, published)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    p.slug, p.category, p.mode, p.popular || 0, p.title.ar, p.title.en, p.summary.ar, p.summary.en,
    p.fees.ar, p.fees.en, p.duration.ar, p.duration.en,
    JSON.stringify(p.keywords || {}), JSON.stringify(p.steps), JSON.stringify(p.documents), p.published === 0 ? 0 : 1)).id;
}

const AGENTS = [
  ['مكتب الرواد للتعقيب', 'Al-Rowad Clearance Office', '96610201', 'متخصصون في معاملات الإقامات والعمالة المنزلية منذ 2009.', 'Residency and domestic-worker specialists since 2009.', ['residency', 'family'], 'حولي، السالمية', 'Hawalli, Salmiya', 4.9, 312, 15, 15, 'approved'],
  ['أبو فهد للمعاملات', 'Abu Fahad Services', '96610202', 'معقّب مرور وتجديد دفاتر وفحص فني.', 'Traffic, registration and inspection runner.', ['traffic'], 'الجهراء، الفروانية', 'Jahra, Farwaniya', 4.7, 188, 10, 12, 'approved'],
  ['مؤسسة الإنجاز التجاري', 'Al-Injaz Business Services', '96610203', 'تأسيس الشركات والرخص التجارية وملفات القوى العاملة.', 'Company setup, commercial licenses and Manpower files.', ['commerce'], 'العاصمة، الشويخ', 'Capital, Shuwaikh', 4.8, 97, 35, 9, 'approved'],
  ['سارة للخدمات العائلية', 'Sara Family Services', '96610204', 'إقامات التحاق بعائل، شهادات ميلاد، وتصديقات.', 'Dependent residencies, birth certificates and attestations.', ['family', 'justice'], 'مبارك الكبير، العدان', 'Mubarak Al-Kabeer, Adan', 4.6, 74, 12, 6, 'approved'],
  ['مكتب الثقة للتعقيب', 'Al-Thiqa Clearance', '96610205', 'كل المعاملات الحكومية للأفراد مع متابعة يومية.', 'All personal government paperwork with daily updates.', ['residency', 'civil', 'traffic', 'justice', 'health'], 'جميع المناطق', 'All areas', 4.5, 241, 8, 11, 'approved'],
  ['خالد للتصديقات', 'Khalid Attestation', '96610206', 'تصديق الشهادات من الخارجية ومعادلة التعليم العالي.', 'MOFA attestation and Higher Education equivalency.', ['justice'], 'العاصمة', 'Capital', 4.4, 52, 20, 7, 'approved'],
  ['مكتب الصفوة', 'Al-Safwa Office', '96610207', 'طلب انضمام جديد – بانتظار التحقق من الترخيص.', 'New application – licence pending verification.', ['commerce', 'residency'], 'الأحمدي', 'Ahmadi', 0, 0, 18, 3, 'pending'],
  ['يوسف للمعاملات السريعة', 'Yousef Express Services', '96610208', 'طلب انضمام جديد.', 'New application.', ['traffic', 'civil'], 'الفروانية', 'Farwaniya', 0, 0, 7, 2, 'pending'],
];

function addDays(base, n) {
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Seed once (inside the caller's transaction): the procedure library and agents always;
 * the three sample accounts only when `demoAccounts` is true (local development and tests).
 * `today` is YYYY-MM-DD in Kuwait time.
 */
export async function seedIfEmpty(db, today, { demoAccounts = true } = {}) {
  const n = (await db.get('SELECT CAST(COUNT(*) AS INTEGER) c FROM procedures')).c;
  if (n > 0) return false;
  const procId = {};
  for (const p of PROCEDURES) procId[p.slug] = await insertProcedure(db, p);
  const agentId = [];
  for (const a of AGENTS) {
    agentId.push((await db.run(`INSERT INTO agents (name_ar,name_en,phone,bio_ar,bio_en,categories,areas_ar,areas_en,rating,reviews,price_kwd,years,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, a[0], a[1], a[2], a[3], a[4], JSON.stringify(a[5]), a[6], a[7], a[8], a[9], a[10], a[11], a[12])).id);
  }
  if (!demoAccounts) return true;
  const user = async (phone, name, role, plan) => (await db.run('INSERT INTO users (phone,name,role,plan) VALUES (?,?,?,?)', phone, name, role, plan)).id;
  const member = async (u, name, rel, nat) => (await db.run('INSERT INTO members (user_id,name,relation,nationality) VALUES (?,?,?,?)', u, name, rel, nat)).id;
  const doc = (u, mid, type, label, num, days, notes) => db.run('INSERT INTO documents (user_id,member_id,type,label,number_enc,expiry_date,notes) VALUES (?,?,?,?,?,?,?)',
    u, mid, type, label, encryptText(num), addDays(today, days), notes);

  // --- Family demo account
  const u = await user(DEMO_PHONE, 'عبدالله الكويتي', 'user', 'family');
  const m = {
    self: await member(u, 'عبدالله الكويتي', 'self', 'كويتي'),
    wife: await member(u, 'نورة', 'spouse', 'كويتية'),
    sara: await member(u, 'سارة', 'child', 'كويتية'),
    moh: await member(u, 'محمد', 'child', 'كويتي'),
    maid: await member(u, 'ماريا سانتوس', 'domestic_worker', 'فلبينية'),
    driver: await member(u, 'راجو كومار', 'domestic_worker', 'هندي'),
  };
  const docs = [
    [m.self, 'civil_id', '287031501234', 200, ''],
    [m.self, 'driving_license', '287031501234', 18, ''],
    [m.self, 'car_registration', '45-123456', 55, 'لاند كروزر 2021'],
    [m.self, 'passport', 'K12345678', 700, ''],
    [m.wife, 'civil_id', '290050207788', 75, ''],
    [m.wife, 'passport', 'K22334455', -5, ''],
    [m.sara, 'passport', 'K99887766', 400, ''],
    [m.moh, 'civil_id', '312090104455', 1100, ''],
    [m.maid, 'residency', '20-2019-556677', 12, 'مادة 20'],
    [m.maid, 'passport', 'P8765432A', 500, ''],
    [m.maid, 'civil_id', '286121309911', 12, ''],
    [m.driver, 'residency', '20-2021-112233', 140, 'مادة 20'],
    [m.driver, 'driving_license', '285040612345', 25, ''],
  ];
  for (const [mid, type, num, days, notes] of docs) await doc(u, mid, type, '', num, days, notes);

  const hist = (statuses, start) => JSON.stringify(statuses.map((st, i) => ({ status: st, at: addDays(today, start + i * 2) + 'T09:00:00Z' })));
  const booking = (agentIdx, slug, mid, status, date, notes, price, statuses, start, updated) => db.run(
    `INSERT INTO bookings (user_id,agent_id,procedure_id,member_id,status,preferred_date,notes,price_kwd,history,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    u, agentId[agentIdx], procId[slug], mid, status, addDays(today, date), notes, price, hist(statuses, start), addDays(today, start), addDays(today, updated));
  await booking(0, 'domestic-worker-recruitment', m.self, 'in_progress', -6, 'استقدام سائق ثانٍ من الهند', 15, ['requested', 'accepted', 'in_progress'], -10, -6);
  await booking(4, 'kuwaiti-passport-renewal', m.wife, 'accepted', 3, 'تجديد جواز نورة المنتهي', 8, ['requested', 'accepted'], -4, -2);
  await booking(1, 'vehicle-registration-renewal', m.self, 'done', -30, 'فحص فني وتجديد', 10, ['requested', 'accepted', 'in_progress', 'done'], -40, -30);
  await booking(3, 'birth-certificate', m.moh, 'requested', 5, '', 12, ['requested'], -1, -1);

  // --- Business demo account: employees' residencies
  const b = await user(BUSINESS_PHONE, 'شركة الأفق للتجارة العامة', 'user', 'business');
  const owner = await member(b, 'فهد العتيبي (المالك)', 'self', 'كويتي');
  await doc(b, owner, 'civil_id', '', '281110105566', 300, '');
  const emps = [['أحمد حسن', 'مصري', 20], ['جون ماثيو', 'هندي', 48], ['علي رضا', 'باكستاني', 95], ['محمد سليم', 'بنغلاديشي', 210], ['ريتا فرنانديز', 'فلبينية', -3]];
  for (const [name, nat, days] of emps) {
    const e = await member(b, name, 'employee', nat);
    await doc(b, e, 'residency', '', '18-' + (100000 + e * 7919), days, 'مادة 18');
    await doc(b, e, 'passport', '', 'X' + (5000000 + e * 31), days + 600, '');
  }
  await doc(b, owner, 'other', 'الرخصة التجارية', '2023/44551', 40, '');

  // --- Admin
  const a = await user(ADMIN_PHONE, 'مشرف مرشدك', 'admin', 'business');
  await member(a, 'مشرف مرشدك', 'self', '');
  return true;
}
