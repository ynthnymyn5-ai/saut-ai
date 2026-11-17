import { PROCEDURES } from './procedures-data.js';
import { encryptText } from './crypto.js';
import { tx } from './db.js';

export const DEMO_PHONE = '99999999';
export const BUSINESS_PHONE = '98888888';
export const ADMIN_PHONE = '90000000';

export function insertProcedure(db, p) {
  return db.prepare(`INSERT INTO procedures (slug, category, mode, popular, title_ar, title_en, summary_ar, summary_en,
    fees_ar, fees_en, duration_ar, duration_en, keywords, steps, documents, published)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(
    p.slug, p.category, p.mode, p.popular || 0, p.title.ar, p.title.en, p.summary.ar, p.summary.en,
    p.fees.ar, p.fees.en, p.duration.ar, p.duration.en,
    JSON.stringify(p.keywords || {}), JSON.stringify(p.steps), JSON.stringify(p.documents),
  ).lastInsertRowid;
}

const AGENTS = [
  ['مكتب الرواد للتعقيب', 'Al-Rowad Clearance Office', '96610201', 'متخصصون في معاملات الإقامات والعمالة المنزلية منذ 2009.', 'Residency and domestic-worker specialists since 2009.', ['residency', 'family'], 'حولي، السالمية', 'Hawalli, Salmiya', 4.9, 312, 15, 15, 'approved'],
  ['أبو فهد للمعاملات', 'Abu Fahad Services', '96610202', 'معقّب مرور وتجديد دفاتر وفحص فني.', 'Traffic, registration and inspection runner.', ['traffic'], 'الجهراء، الفروانية', 'Jahra, Farwaniya', 4.7, 188, 10, 12, 'approved'],
  ['مؤسسة الإنجاز التجاري', 'Al-Injaz Business Services', '96610203', 'تأسيس الشركات والرخص التجارية وملفات القوى العاملة.', 'Company setup, commercial licenses and Manpower files.', ['commerce'], 'العاصمة، الشويخ', 'Capital, Shuwaikh', 4.8, 97, 35, 9, 'approved'],
  ['سارة للخدمات العائلية', 'Sara Family Services', '96610204', 'إقامات التحاق بعائل، شهادات ميلاد، وتصديقات.', 'Dependent residencies, birth certificates and attestations.', ['family', 'justice'], 'مبارك الكبير، العدان', 'Mubarak Al-Kabeer, Adan', 4.6, 74, 12, 6, 'approved'],
  ['مكتب الثقة للتعقيب', 'Al-Thiqa Clearance', '96610205', 'كل المعاملات الحكومية للأفراد مع متابعة يومية.', 'All personal government paperwork with daily updates.', ['residency', 'civil', 'traffic', 'justice'], 'جميع المناطق', 'All areas', 4.5, 241, 8, 11, 'approved'],
  ['خالد للتصديقات', 'Khalid Attestation', '96610206', 'تصديق الشهادات من الخارجية ومعادلة التعليم العالي.', 'MOFA attestation and Higher Education equivalency.', ['justice'], 'العاصمة', 'Capital', 4.4, 52, 20, 7, 'approved'],
  ['مكتب الصفوة', 'Al-Safwa Office', '96610207', 'طلب انضمام جديد – بانتظار التحقق من الترخيص.', 'New application – licence pending verification.', ['commerce', 'residency'], 'الأحمدي', 'Ahmadi', 0, 0, 18, 3, 'pending'],
  ['يوسف للمعاملات السريعة', 'Yousef Express Services', '96610208', 'طلب انضمام جديد.', 'New application.', ['traffic', 'civil'], 'الفروانية', 'Farwaniya', 0, 0, 7, 2, 'pending'],
];

function addDays(base, n) {
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Seed everything once. `today` is YYYY-MM-DD in Kuwait time so expiries stay meaningful. */
export function seedIfEmpty(db, today) {
  const n = db.prepare('SELECT COUNT(*) c FROM procedures').get().c;
  if (n > 0) return false;
  tx(db, () => {
    for (const p of PROCEDURES) insertProcedure(db, p);
    const insAgent = db.prepare(`INSERT INTO agents (name_ar,name_en,phone,bio_ar,bio_en,categories,areas_ar,areas_en,rating,reviews,price_kwd,years,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const a of AGENTS) insAgent.run(a[0], a[1], a[2], a[3], a[4], JSON.stringify(a[5]), a[6], a[7], a[8], a[9], a[10], a[11], a[12]);

    const insUser = db.prepare('INSERT INTO users (phone,name,role,plan) VALUES (?,?,?,?)');
    const insMember = db.prepare('INSERT INTO members (user_id,name,relation,nationality) VALUES (?,?,?,?)');
    const insDoc = db.prepare('INSERT INTO documents (user_id,member_id,type,label,number_enc,expiry_date,notes) VALUES (?,?,?,?,?,?,?)');
    const proc = (slug) => db.prepare('SELECT id FROM procedures WHERE slug=?').get(slug).id;

    // --- Family demo account
    const u = insUser.run(DEMO_PHONE, 'عبدالله الكويتي', 'user', 'family').lastInsertRowid;
    const m = {
      self: insMember.run(u, 'عبدالله الكويتي', 'self', 'كويتي').lastInsertRowid,
      wife: insMember.run(u, 'نورة', 'spouse', 'كويتية').lastInsertRowid,
      sara: insMember.run(u, 'سارة', 'child', 'كويتية').lastInsertRowid,
      moh: insMember.run(u, 'محمد', 'child', 'كويتي').lastInsertRowid,
      maid: insMember.run(u, 'ماريا سانتوس', 'domestic_worker', 'فلبينية').lastInsertRowid,
      driver: insMember.run(u, 'راجو كومار', 'domestic_worker', 'هندي').lastInsertRowid,
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
    for (const [mid, type, num, days, notes] of docs) insDoc.run(u, mid, type, '', encryptText(num), addDays(today, days), notes);

    const insBooking = db.prepare(`INSERT INTO bookings (user_id,agent_id,procedure_id,member_id,status,preferred_date,notes,price_kwd,history,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    const hist = (statuses, start) => JSON.stringify(statuses.map((st, i) => ({ status: st, at: addDays(today, start + i * 2) + 'T09:00:00Z' })));
    insBooking.run(u, 1, proc('domestic-worker-recruitment'), m.self, 'in_progress', addDays(today, -6), 'استقدام سائق ثانٍ من الهند', 15, hist(['requested', 'accepted', 'in_progress'], -10), addDays(today, -10), addDays(today, -6));
    insBooking.run(u, 5, proc('kuwaiti-passport-renewal'), m.wife, 'accepted', addDays(today, 3), 'تجديد جواز نورة المنتهي', 8, hist(['requested', 'accepted'], -4), addDays(today, -4), addDays(today, -2));
    insBooking.run(u, 2, proc('vehicle-registration-renewal'), m.self, 'done', addDays(today, -30), 'فحص فني وتجديد', 10, hist(['requested', 'accepted', 'in_progress', 'done'], -40), addDays(today, -40), addDays(today, -30));
    insBooking.run(u, 4, proc('birth-certificate'), m.moh, 'requested', addDays(today, 5), '', 12, hist(['requested'], -1), addDays(today, -1), addDays(today, -1));

    // --- Business demo account: employees' residencies
    const b = insUser.run(BUSINESS_PHONE, 'شركة الأفق للتجارة العامة', 'user', 'business').lastInsertRowid;
    const owner = insMember.run(b, 'فهد العتيبي (المالك)', 'self', 'كويتي').lastInsertRowid;
    insDoc.run(b, owner, 'civil_id', 'رخصة', encryptText('281110105566'), addDays(today, 300), '');
    const emps = [['أحمد حسن', 'مصري', 20], ['جون ماثيو', 'هندي', 48], ['علي رضا', 'باكستاني', 95], ['محمد سليم', 'بنغلاديشي', 210], ['ريتا فرنانديز', 'فلبينية', -3]];
    for (const [name, nat, days] of emps) {
      const e = insMember.run(b, name, 'employee', nat).lastInsertRowid;
      insDoc.run(b, e, 'residency', '', encryptText('18-' + (100000 + e * 7919)), addDays(today, days), 'مادة 18');
      insDoc.run(b, e, 'passport', '', encryptText('X' + (5000000 + e * 31)), addDays(today, days + 600), '');
    }
    insDoc.run(b, owner, 'other', 'الرخصة التجارية', encryptText('2023/44551'), addDays(today, 40), '');

    // --- Admin
    const a = insUser.run(ADMIN_PHONE, 'مشرف مرشدك', 'admin', 'business').lastInsertRowid;
    insMember.run(a, 'مشرف مرشدك', 'self', '');
  });
  return true;
}
