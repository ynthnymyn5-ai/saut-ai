// Minimal, dependency-free reader for the first sheet of an .xlsx file, and for CSV.
// .xlsx is a zip: we read the central directory, inflate entries with the browser's
// DecompressionStream('deflate-raw'), then parse sharedStrings.xml and the first worksheet.
// Returns an array of objects keyed by the header row.

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf) {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not_zip');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const files = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('bad_zip');
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    const dataStart = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = new Uint8Array(buf, dataStart, csize);
    files[name] = { method, raw };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return async (name) => {
    const f = files[name];
    if (!f) return null;
    return dec.decode(f.method === 8 ? await inflate(f.raw) : f.raw);
  };
}

const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
// Excel stores dates as days since 1899-12-30.
export const excelSerialToIso = (n) => new Date(Math.round((n - 25569) * 86400e3)).toISOString().slice(0, 10);

async function readXlsx(buf) {
  const get = await unzip(buf);
  const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const shared = [];
  const ss = await get('xl/sharedStrings.xml');
  if (ss) for (const si of xml(ss).getElementsByTagName('si')) shared.push([...si.getElementsByTagName('t')].map((t) => t.textContent).join(''));
  // First worksheet listed in the workbook.
  const rels = xml((await get('xl/_rels/workbook.xml.rels')) || '<r/>');
  const firstSheet = xml((await get('xl/workbook.xml')) || '<w/>').getElementsByTagName('sheet')[0];
  const rid = firstSheet?.getAttribute('r:id') || firstSheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const target = [...rels.getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target');
  const sheetPath = target ? 'xl/' + target.replace(/^\/?xl\//, '').replace(/^\//, '') : 'xl/worksheets/sheet1.xml';
  const sheet = xml((await get(sheetPath)) || (await get('xl/worksheets/sheet1.xml')) || '<x/>');
  const rows = [];
  for (const row of sheet.getElementsByTagName('row')) {
    const out = [];
    out.rowNumber = Number(row.getAttribute('r')) || rows.length + 1;
    for (const c of row.getElementsByTagName('c')) {
      const type = c.getAttribute('t');
      const vEl = c.getElementsByTagName('v')[0];
      let val = vEl ? vEl.textContent : '';
      if (type === 's') val = shared[Number(val)] ?? '';
      else if (type === 'inlineStr') val = [...c.getElementsByTagName('t')].map((t) => t.textContent).join('');
      else if (type !== 'str' && val !== '' && !Number.isNaN(Number(val))) val = Number(val);
      out[colIndex(c.getAttribute('r') || '')] = val;
    }
    rows.push(out);
  }
  return rows;
}

function readCsv(text) {
  text = text.replace(/^﻿/, '');
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Read a File into [{header: value}] using its first row as headers. */
export async function readSheet(file) {
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
  const grid = isCsv ? readCsv(await file.text()) : await readXlsx(await file.arrayBuffer());
  const [head = [], ...body] = grid.filter((r) => r && r.some((x) => String(x ?? '').trim() !== ''));
  // `_row` is the row number as the user sees it in Excel, for error messages.
  return body.map((r) => ({ ...Object.fromEntries(head.map((h, i) => [String(h ?? '').trim(), r[i] ?? ''])), _row: r.rowNumber }));
}
