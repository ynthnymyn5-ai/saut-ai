import zlib from "node:zlib";

/**
 * Dependency-free text extraction for knowledge uploads (unit-tested).
 * DOCX = a ZIP containing word/document.xml; we read just that entry.
 */
const MAX_UNZIPPED = 50 * 1024 * 1024; // zip-bomb guard

export function readZipEntry(buf: Buffer, name: string): Buffer | null {
  // End of central directory: signature 0x06054b50, searched backwards (comment ≤ 64 KB)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const entryName = buf.toString("utf8", p + 46, p + 46 + nlen);
    if (entryName === name) {
      if (usize > MAX_UNZIPPED) throw new Error("Document is too large to read");
      if (buf.readUInt32LE(local) !== 0x04034b50) return null;
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + csize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return zlib.inflateRawSync(data, { maxOutputLength: MAX_UNZIPPED });
      throw new Error(`Unsupported compression method ${method}`);
    }
    p += 46 + nlen + xlen + clen;
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()]);

/** Plain text from a .docx: paragraphs → lines, tabs and breaks kept, table cells separated. */
export function docxToText(buf: Buffer): string {
  const xml = readZipEntry(buf, "word/document.xml");
  if (!xml) throw new Error("Not a valid Word document");
  const body = xml.toString("utf8");
  const text = body
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:(br|cr)\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>\s*<\/w:tc>/g, "\t") // last paragraph in a table cell → cell separator
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, (_, t: string) => `\u0000${t}\u0001`)
    .replace(/<[^>]+>/g, "")
    .replace(/\u0000([^\u0001]*)\u0001/g, (_, t: string) => decode(t));
  return normalise(text);
}

export function normalise(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
